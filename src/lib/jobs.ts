// Job helpers — status labels, lifecycle guards, minimum-price rule, pricing suggestions.
import type { Deal, JobStatus } from "@prisma/client";

export const JOB_STATUS_ORDER: JobStatus[] = [
  "ESTIMATE_SENT",
  "APPROVED",
  "SCHEDULED",
  "DETACH_COMPLETE",
  "REINSTALL_COMPLETE",
  "INVOICED",
  "PAID",
];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  ESTIMATE_SENT: "Estimate Sent",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  DETACH_COMPLETE: "Detach Complete",
  REINSTALL_COMPLETE: "Reinstall Complete",
  INVOICED: "Invoiced",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

export const MINIMUM_PRICE_PER_PANEL = 150;

/** True if a move from `from` to `to` is a backward/regression in the pipeline. */
export function isBackwardMove(from: JobStatus, to: JobStatus): boolean {
  if (from === "CANCELLED" || to === "CANCELLED") return false;
  const fromIdx = JOB_STATUS_ORDER.indexOf(from);
  const toIdx = JOB_STATUS_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx < fromIdx;
}

/** True if the backward move from Reinstall Complete back should trigger an admin alert. */
export function isUnusualBackwardMove(from: JobStatus, to: JobStatus): boolean {
  return from === "REINSTALL_COMPLETE" && isBackwardMove(from, to);
}

/** Suggest subcontractor price per panel from an active Deal (spec §9.3). Null if no deal / non-flat deal / custom. */
export function suggestPriceFromDeal(
  deal: Pick<Deal, "dealType" | "pricingDetails"> | null | undefined,
  insuranceEstimateTotal: number | null | undefined,
  panelCount: number | null | undefined
): { pricePerPanel: number | null; subTotal: number | null; note: string } {
  if (!deal) return { pricePerPanel: null, subTotal: null, note: "No active deal. Quote custom pricing." };

  const pd = deal.pricingDetails as { type?: string; price_per_panel?: number; rate?: number };

  if (pd.type === "flat_rate" && typeof pd.price_per_panel === "number") {
    const price = pd.price_per_panel;
    const subTotal = panelCount ? price * panelCount : null;
    return {
      pricePerPanel: price,
      subTotal,
      note: `Flat rate from active deal: $${price.toFixed(2)}/panel`,
    };
  }
  if (pd.type === "percentage_of_payout" && typeof pd.rate === "number") {
    if (!insuranceEstimateTotal) {
      return {
        pricePerPanel: null,
        subTotal: null,
        note: `Deal = ${(pd.rate * 100).toFixed(0)}% of insurance. Enter insurance estimate total first.`,
      };
    }
    const subTotal = insuranceEstimateTotal * pd.rate;
    const pricePerPanel = panelCount ? subTotal / panelCount : null;
    return {
      pricePerPanel,
      subTotal,
      note: `${(pd.rate * 100).toFixed(0)}% of insurance payout ($${insuranceEstimateTotal.toLocaleString()})`,
    };
  }
  return { pricePerPanel: null, subTotal: null, note: "Custom-terms deal. Quote manually." };
}

/** True if this price triggers the below-minimum approval workflow. */
export function requiresApproval(pricePerPanel: number | null | undefined): boolean {
  if (pricePerPanel == null) return false;
  return pricePerPanel < MINIMUM_PRICE_PER_PANEL;
}
