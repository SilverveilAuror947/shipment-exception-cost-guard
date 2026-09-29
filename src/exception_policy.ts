export type ExceptionDecision =
  | { action: "draft_customer_update"; estimatedCostUsd: number; headroomUsd: number }
  | { action: "manual_review"; estimatedCostUsd: number; overByUsd: number };

export function decideExceptionHandling(
  estimatedCostUsd: number,
  callCeilingUsd: number,
): ExceptionDecision {
  if (estimatedCostUsd <= callCeilingUsd) {
    return {
      action: "draft_customer_update",
      estimatedCostUsd,
      headroomUsd: callCeilingUsd - estimatedCostUsd,
    };
  }
  return {
    action: "manual_review",
    estimatedCostUsd,
    overByUsd: estimatedCostUsd - callCeilingUsd,
  };
}
