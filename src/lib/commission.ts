// Commission math — quarterly revenue tiers with retroactive bonus (spec §8).
// All reps use the same structure; stored as JSON on User for future flexibility.

export interface CommissionTier {
  min: number;          // minimum quarterly subcontractor revenue
  max: number | null;   // inclusive max; null = no ceiling
  rate: number;         // decimal (e.g., 0.12 for 12%)
}

export interface CommissionStructure {
  type: string;         // "quarterly_revenue_tiers"
  base_rate: number;    // decimal (e.g., 0.10)
  tiers: CommissionTier[];
}

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
  const s = json as Partial<CommissionStructure>;
  if (s.type !== "quarterly_revenue_tiers" || typeof s.base_rate !== "number" || !Array.isArray(s.tiers)) {
    return DEFAULT_STRUCTURE;
  }
  return s as CommissionStructure;
}

/** Effective rate for a given quarterly revenue total. */
export function tierRateFor(revenue: number, structure: CommissionStructure = DEFAULT_STRUCTURE): number {
  let rate = structure.base_rate;
  for (const tier of structure.tiers) {
    if (revenue >= tier.min && (tier.max === null || revenue <= tier.max)) {
      rate = tier.rate;
    }
  }
  return rate;
}

/** Returns { baseCommission, bonus, total } given an accumulated quarterly revenue. */
export function computeQuarterlyCommission(revenue: number, structure: CommissionStructure = DEFAULT_STRUCTURE) {
  const base = revenue * structure.base_rate;
  const effective = tierRateFor(revenue, structure);
  const total = revenue * effective;
  const bonus = total - base;
  return { baseCommission: base, bonus, totalCommission: total, effectiveRate: effective };
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
