import { z } from "zod";
import { InfraiGateway } from "./infrai_gateway.js";

const argumentsSchema = z.tuple([
  z.coerce.number().positive(),
  z.string().min(1),
  z.coerce.number().positive().optional(),
]);

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before setting the budget");

const [hardCapUsd, period, alertThresholdUsd] = argumentsSchema.parse(process.argv.slice(2));
const result = await new InfraiGateway(apiKey).setBudget(hardCapUsd, period, alertThresholdUsd);
console.log(JSON.stringify(result, null, 2));
