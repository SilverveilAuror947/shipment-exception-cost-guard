import assert from "node:assert/strict";
import test from "node:test";
import { decideExceptionHandling } from "../src/exception_policy.js";
import { shipmentRequestSchema } from "../src/shipment_exception_service.js";

test("routes an over-ceiling shipment message to operations review", () => {
  const decision = decideExceptionHandling(0.071, 0.05);
  assert.equal(decision.action, "manual_review");
  assert.equal(decision.estimatedCostUsd, 0.071);
  assert.ok(Math.abs(decision.overByUsd - 0.021) < Number.EPSILON);
});

test("rejects a proof-of-delivery record without its object key", () => {
  const result = shipmentRequestSchema.safeParse({
    shipmentId: "ship-9",
    orderId: "order-3",
    event: {
      type: "damaged",
      occurredAt: "2026-09-27T09:15:00.000Z",
      note: "Outer carton is crushed.",
    },
    proofOfDelivery: { mediaType: "image/jpeg", signedBy: null },
    callCeilingUsd: 0.05,
  });
  assert.equal(result.success, false);
});
