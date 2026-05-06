// Commission math — supports per-rep custom structures (spec §8 + per-contract overrides).
// All structures are JSON on the User model so admins can edit without schema changes.

export interface CommissionTier {
  min: number;          // minimum quarterly subcontractor revenue
  max: number | null;   // inclusive max; null = no ceiling
  rate: number;         // decimal (e.g., 0.12 for 12%)
}

/**
 * Three structure shapes are supported:
 * - quarterly_revenue_tiers: base rate + retroactive bonus tiers (spec default)
 * - flat_revenue:           rate × subcontractor revenue per job
 * - flat_profit:            rate × profit snapshot per job (null until costs entered)
 */
export type CommissionStructure =
  | {
      type: "quarterly_revenue_tiers";
      base_rate: number;
      tiers: CommissionTier[];
    }
  | { type: "flat_revenue"; rate: number }
  | { type: "flat_profit"; rate: number };

export const DEFAULT_STRUCTURE: CommissionStructure = {
  type: "quarterly_revenue_tiers",
  base_rate: 0.1,
  tiers: [
    { min: 250_000, max: 374_999, rate: 0.12 },
    { min: 375_000, max: 499_999, rate: 0.13 },
    { min: 500_000, max: null, rate: 0.14 },
  ],
};

export function parseStructure(json: unknown): CommissionStructure {
  if (!json || typeof json !== "object") return DEFAULT_STRUCTURE;
  const s = json as Partial<CommissionStructure> & { type?: string };

  if (s.type === "flat_revenue" && typeof (s as { rate?: number }).rate === "number") {
    return { type: "flat_revenue", rate: (s as { rate: number }).rate };
  }
  if (s.type === "flat_profit" && typeof (s as { rate?: number }).rate === "number") {
    return { type: "flat_profit", rate: (s as { rate: number }).rate };
  }
  if (
    s.type === "quarterly_revenue_tiers" &&
    typeof (s as { base_rate?: number }).base_rate === "number" &&
    Array.isArray((s as { tiers?: unknown }).tiers)
  ) {
    return s as CommissionStructure;
  }
  return DEFAULT_STRUCTURE;
}

/** Human-readable description of a structure. */
export function describeStructure(s: CommissionStructure): string {
  if (s.type === "flat_revenue") return `${(s.rate * 100).toFixed(0)}% of revenue (per job)`;
  if (s.type === "flat_profit") return `${(s.rate * 100).toFixed(0)}% of profit (per job)`;
  const baseLabel = `${(s.base_rate * 100).toFixed(0)}% base`;
  if (s.tiers.length === 0) return baseLabel;
  const top = s.tiers[s.tiers.length - 1];
  return `${baseLabel}, up to ${(top.rate * 100).toFixed(0)}% (quarterly tiers)`;
}

/** Effective rate for a given quarterly revenue total (tiers structure only). */
export function tierRateFor(
  revenue: number,
  structure: CommissionStructure = DEFAULT_STRUCTURE
): number {
  if (structure.type !== "quarterly_revenue_tiers") return 0;
  let rate = structure.base_rate;
  for (const tier of structure.tiers) {
    if (revenue >= tier.min && (tier.max === null || revenue <= tier.max)) {
      rate = tier.rate;
    }
  }
  return rate;
}

/** Returns { baseCommission, bonus, total } given an accumulated quarterly revenue. */
export function computeQuarterlyCommission(
  revenue: number,
  structure: CommissionStructure = DEFAULT_STRUCTURE
) {
  if (structure.type === "flat_revenue") {
    const total = revenue * structure.rate;
    return { baseCommission: total, bonus: 0, totalCommission: total, effectiveRate: structure.rate };
  }
  if (structure.type === "flat_profit") {
    // Profit-based; this overall rollup uses revenue × rate as a *placeholder*.
    // Per-job calc in computePerJobCommission is authoritative for flat_profit.
    const total = revenue * structure.rate;
    return { baseCommission: total, bonus: 0, totalCommission: total, effectiveRate: structure.rate };
  }
  const base = revenue * structure.base_rate;
  const effective = tierRateFor(revenue, structure);
  const total = revenue * effective;
  const bonus = total - base;
  return { baseCommission: base, bonus, totalCommission: total, effectiveRate: effective };
}

/**
 * Compute the commission earned on a single job for a given structure.
 * - quarterly_revenue_tiers: base rate × subTotal (retroactive bonus is applied at quarter rollup)
 * - flat_revenue:            rate × subTotal
 * - flat_profit:             rate × profit snapshot (null until costs are entered)
 *
 * Returns null when the inputs aren't sufficient (e.g., flat_profit before costs are entered).
 */
export function computePerJobCommission(
  structure: CommissionStructure,
  job: { subcontractorEstimateTotal: number | null; profitSnapshot: number | null }
): number | null {
  const sub = Number(job.subcontractorEstimateTotal ?? 0);
  if (structure.type === "quarterly_revenue_tiers") {
    return sub * structure.base_rate;
  }
  if (structure.type === "flat_revenue") {
    return sub * structure.rate;
  }
  // flat_profit
  if (job.profitSnapshot == null) return null;
  return Number(job.profitSnapshot) * structure.rate;
}

/** Convert a Date to a "YYYY-QN" quarter string in calendar time. */
export function quarterString(d: Date): string {
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

export function currentQuarterString(): string {
  return quarterString(new Date());
}

export function formatQuarter(q: string): string {
  return q.replace(/^(\d{4})-Q(\d)$/, "$2Q $1");
}
