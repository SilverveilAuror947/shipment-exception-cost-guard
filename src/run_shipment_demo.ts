import { InfraiGateway } from "./infrai_gateway.js";
import { handleShipmentException } from "./shipment_exception_service.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the demo");

const result = await handleShipmentException({
  shipmentId: "ship-8041",
  orderId: "order-2187",
  event: {
    type: "delivery_attempted",
    occurredAt: "2026-09-27T09:15:00.000Z",
    note: "Courier could not access the apartment lobby; another attempt is scheduled tomorrow.",
  },
  proofOfDelivery: {
    objectKey: "pod/ship-8041/attempt-1.jpg",
    mediaType: "image/jpeg",
    signedBy: null,
  },
  callCeilingUsd: 0.05,
}, new InfraiGateway(apiKey));

console.log(JSON.stringify(result, null, 2));
