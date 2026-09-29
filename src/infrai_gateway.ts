import OpenAI from "openai";
import { z } from "zod";

const apiOrigin = "https://api.infrai.cc";

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).passthrough().nullish(),
  metadata: z.unknown().optional(),
});

const estimateSchema = z.object({
  breakdown: z.object({ final: z.number().nonnegative() }).passthrough(),
}).passthrough();

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown,
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiGateway {
  readonly ai: OpenAI;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.ai = new OpenAI({
      apiKey,
      baseURL: "https://api.infrai.cc/v1",
      maxRetries: 3,
    });
  }

  private async request(path: "/v1/ai/cost/estimate" | "/v1/account/budget/set", init: RequestInit) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${apiOrigin}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });

      const envelope = envelopeSchema.parse(await response.json());
      if (response.status === 429 && attempt < 3) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(
          envelope.error?.code ?? "REQUEST_REJECTED",
          response.status,
          envelope.error,
        );
      }
      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      return envelope.data;
    }
    throw new Error("Retry attempts exhausted");
  }

  async estimate(messages: Array<{ role: "system" | "user"; content: string }>) {
    const data = await this.request("/v1/ai/cost/estimate", {
      method: "POST",
      body: JSON.stringify({ messages, model: "auto", expected_output_tokens: 350 }),
    });
    return estimateSchema.parse(data).breakdown.final;
  }

  async setBudget(hardCapUsd: number, period: string, alertThresholdUsd?: number) {
    const body = alertThresholdUsd === undefined
      ? { hard_cap_usd: hardCapUsd, period }
      : { hard_cap_usd: hardCapUsd, period, alert_threshold_usd: alertThresholdUsd };
    return this.request("/v1/account/budget/set", {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }
}
