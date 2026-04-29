// Estimate helpers — recalc totals, "Maximize Insurance" suggestions.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/** Recompute estimate total from its line items. */
export async function recalcEstimateTotal(estimateId: string) {
  const agg = await prisma.estimateLineItem.aggregate({
    where: { estimateId },
    _sum: { total: true },
  });
  const sum = Number(agg._sum.total ?? 0);
  await prisma.estimate.update({ where: { id: estimateId }, data: { totalAmount: sum } });
  return sum;
}

/** Bump the job's stored totals from its current-version estimates. */
export async function syncJobTotals(jobId: string) {
  const estimates = await prisma.estimate.findMany({
    where: { jobId, isCurrentVersion: true },
  });
  let ins: number | null = null;
  let sub: number | null = null;
  for (const e of estimates) {
    if (e.estimateType === "INSURANCE_RETAIL") ins = Number(e.totalAmount);
    if (e.estimateType === "SUBCONTRACTOR") sub = Number(e.totalAmount);
  }
  const patch: Prisma.JobUpdateInput = {};
  if (ins !== null) patch.insuranceEstimateTotal = ins;
  if (sub !== null) patch.subcontractorEstimateTotal = sub;
  if (Object.keys(patch).length > 0) await prisma.job.update({ where: { id: jobId }, data: patch });
}

/**
 * "Maximize Insurance Estimate" — returns suggested add-on line items that:
 *  - exist in the active line item menu, AND
 *  - are NOT already on the estimate.
 * The user can accept / dismiss each one per spec §9.5.
 */
export async function maximizeSuggestions(estimateId: string) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: { lineItems: true },
  });
  if (!estimate) return [];
  if (estimate.estimateType !== "INSURANCE_RETAIL") return [];

  const existingNames = new Set(estimate.lineItems.map((li) => li.itemName.toLowerCase()));
  const menu = await prisma.lineItemMenu.findMany({ where: { isActive: true } });

  // Suggest all menu items NOT yet present (spec §9.5 lists: steep pitch, high roof,
  // conduit, conduit mounting bracket, junction box, critter guard, electrician hours).
  const SUGGESTION_KEYWORDS = [
    "steep pitch",
    "high roof",
    "conduit",
    "junction box",
    "critter guard",
    "electrician",
    "bracket",
  ];
  const isAddOn = (name: string) => {
    const lower = name.toLowerCase();
    return SUGGESTION_KEYWORDS.some((k) => lower.includes(k));
  };

  return menu
    .filter((m) => isAddOn(m.itemName) && !existingNames.has(m.itemName.toLowerCase()))
    .map((m) => ({
      menuItemId: m.id,
      itemName: m.itemName,
      unitType: m.unitType,
      defaultUnitPrice: Number(m.defaultUnitPrice),
      description: m.description ?? "",
    }));
}
