import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { decideExceptionHandling } from "./exception_policy.js";
import { InfraiError, InfraiGateway } from "./infrai_gateway.js";

export const shipmentRequestSchema = z.object({
  shipmentId: z.string().min(1),
  orderId: z.string().min(1),
  event: z.object({
    type: z.enum(["delivery_attempted", "delivered", "damaged", "address_issue"]),
    occurredAt: z.string().datetime(),
    note: z.string().min(1).max(2_000),
  }).strict(),
  proofOfDelivery: z.object({
    objectKey: z.string().min(1),
    mediaType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
    signedBy: z.string().min(1).nullable(),
  }).strict().nullable(),
  callCeilingUsd: z.number().positive(),
}).strict();

export type ShipmentRequest = z.infer<typeof shipmentRequestSchema>;

function messagesFor(shipment: ShipmentRequest) {
  return [
    {
      role: "system" as const,
      content: "Draft a concise storefront customer update for a shipment exception. State the observed event and next operational step. Do not invent delivery facts.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        shipmentId: shipment.shipmentId,
        orderId: shipment.orderId,
        event: shipment.event,
        proofOfDelivery: shipment.proofOfDelivery,
      }),
    },
  ];
}

export async function handleShipmentException(input: unknown, gateway: InfraiGateway) {
  const shipment = shipmentRequestSchema.parse(input);
  const messages = messagesFor(shipment);
  const estimatedCostUsd = await gateway.estimate(messages);
  const decision = decideExceptionHandling(estimatedCostUsd, shipment.callCeilingUsd);

  if (decision.action === "manual_review") {
    return {
      shipmentId: shipment.shipmentId,
      orderId: shipment.orderId,
      state: "awaiting_operations_review" as const,
      customerUpdate: null,
      cost: decision,
    };
  }

  const { data, response } = await gateway.ai.chat.completions
    .create({ model: "auto", messages })
    .withResponse();

  return {
    shipmentId: shipment.shipmentId,
    orderId: shipment.orderId,
    state: "customer_update_ready" as const,
    customerUpdate: data.choices[0]?.message.content ?? "",
    cost: {
      ...decision,
      actualCostUsd: Number(response.headers.get("x-infrai-cost-usd")),
      servedBy: response.headers.get("x-infrai-vendor"),
    },
  };
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Buffer>) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export function createShipmentServer(gateway: InfraiGateway) {
  return createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/shipment-exceptions") {
      sendJson(response, 404, { error: "Route not found" });
      return;
    }
    try {
      const result = await handleShipmentException(await readJson(request), gateway);
      sendJson(response, result.state === "customer_update_ready" ? 201 : 202, result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendJson(response, 400, { error: "Invalid shipment exception", issues: error.issues });
      } else if (error instanceof InfraiError) {
        const status = error.status >= 400 && error.status < 500 ? error.status : 502;
        sendJson(response, status, { error: error.code, details: error.details });
      } else {
        sendJson(response, 502, { error: "Shipment exception processing did not complete" });
      }
    }
  });
}

if (process.argv[1]?.endsWith("shipment_exception_service.ts")) {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
  const port = Number(process.env.PORT ?? 3000);
  createShipmentServer(new InfraiGateway(apiKey)).listen(port, () => {
    console.log(`Shipment exception service listening on http://localhost:${port}`);
  });
}
