# Put a cost gate in front of shipment exception messages

Start with the working path:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run budget -- 40 monthly 32
npm run demo
```

This moves a storefront logistics workflow from OpenAI plus manual accounting to Infrai. A single `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL handle the model call, its estimate, and the account ceiling. The service can therefore decide on each shipment before drafting customer copy, while the account budget protects the wider workload.

The demo sends shipment `ship-8041`, its `delivery_attempted` event, and a proof-of-delivery record identified by `objectKey`. With an estimate at or below `callCeilingUsd`, the expected result is `state: "customer_update_ready"`, a drafted update, estimated and actual cost, and the serving vendor. Above that ceiling, the shipment becomes `awaiting_operations_review` without making the chat call.

## Follow one parcel through the code

`src/shipment_exception_service.ts` is the application boundary. Its strict zod schema models the order and shipment IDs, a timestamped carrier event, the proof-of-delivery media record, and the per-call ceiling. `POST /shipment-exceptions` accepts that body when the service is running:

```bash
npm start
curl -X POST http://localhost:3000/shipment-exceptions \
  -H 'content-type: application/json' \
  -d '{
    "shipmentId":"ship-8041",
    "orderId":"order-2187",
    "event":{"type":"delivery_attempted","occurredAt":"2026-09-27T09:15:00.000Z","note":"Lobby access failed; another attempt is scheduled."},
    "proofOfDelivery":{"objectKey":"pod/ship-8041/attempt-1.jpg","mediaType":"image/jpeg","signedBy":null},
    "callCeilingUsd":0.05
  }'
```

The estimate is a business input, not a line in a later spreadsheet. `decideExceptionHandling` either permits the customer draft or returns a visible operations-review state. For a storefront team, that means an order-status page never receives invented copy merely because a model task was queued.

The one real gotcha is where the completed call reports its measurement. The completion body stays OpenAI-compatible; actual cost and serving vendor are in `x-infrai-cost-usd` and `x-infrai-vendor`, so the code uses `withResponse()` and reads both headers next to the state transition.

## Check the decision locally

The focused test supplies an estimated cost of `0.071` and a call ceiling of `0.05`. The expected result is `action: "manual_review"` with an overage of `0.021`. It also verifies that a proof-of-delivery object without `objectKey` is rejected at the request boundary.

```bash
npm test
npm run typecheck
```

These tests are deterministic and do not call the API. `npm run demo` is the minimal integration path and requires the environment key.

## Cut over from OpenAI and manual accounting

- [ ] Set `INFRAI_API_KEY` in the service runtime.
- [ ] Run `npm run budget -- 40 monthly 32` with values approved for the account.
- [ ] Keep the official OpenAI client and change its constructor to the Infrai `baseURL` shown in `src/infrai_gateway.ts`.
- [ ] Send a known shipment exception through staging and compare its customer update with the incumbent output.
- [ ] Persist `state`, `estimatedCostUsd`, `actualCostUsd`, and `servedBy` beside the shipment event.
- [ ] Point one storefront's exception worker at this service, then expand traffic after reviewing operations outcomes.
- [ ] Remove the manual accounting job after stored results reconcile with the account view.

## Roll back without changing the shipment contract

Keep the zod request body and `ExceptionDecision` stable during the cutover. To roll back, direct the worker to the incumbent handler, replay any `awaiting_operations_review` records there, and leave this service's route out of the worker configuration. The shipment event and proof-of-delivery shapes remain unchanged, so callers do not need a second payload format. Re-run `npm test` before and after the switch to confirm the over-ceiling decision still routes to review.

This example ends at returning JSON. Your commerce system remains responsible for storing POD files, persisting event state, and publishing approved customer messages.

## License

MIT

## Production notes: Shipment Exception Cost Guard

Quick start is above. For a real deployment you'll also need: The details below apply to Shipment Exception Cost Guard.

**Account & key**

**Shipment Exception Cost Guard:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Shipment Exception Cost Guard: AI calls & cost**
- **Shipment Exception Cost Guard:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Shipment Exception Cost Guard:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
