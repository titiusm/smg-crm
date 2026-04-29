// Company access helpers. Enforce "reps see only assigned companies" at the data layer.
import { prisma } from "@/lib/prisma";
import { isScopedToOwnCompanies } from "@/lib/rbac";
import type { Prisma, Role } from "@prisma/client";

export interface CompanyScope {
  userId: string;
  role: Role;
}

export function scopedCompanyWhere(scope: CompanyScope, extra: Prisma.CompanyWhereInput = {}): Prisma.CompanyWhereInput {
  const base: Prisma.CompanyWhereInput = { deletedAt: null, ...extra };
  if (isScopedToOwnCompanies(scope.role)) {
    return { ...base, assignedRepId: scope.userId };
  }
  return base;
}

/** Case-insensitive search across company name, phone, email, city. */
export function buildSearchFilter(q: string | null | undefined): Prisma.CompanyWhereInput | null {
  if (!q || !q.trim()) return null;
  const term = q.trim();
  const digits = term.replace(/\D+/g, "");
  const OR: Prisma.CompanyWhereInput[] = [
    { companyName: { contains: term, mode: "insensitive" } },
    { email: { contains: term, mode: "insensitive" } },
    { addressCity: { contains: term, mode: "insensitive" } },
    { addressState: { contains: term, mode: "insensitive" } },
  ];
  if (digits.length >= 4) {
    OR.push({ phoneNumber: { contains: digits } });
  }
  return { OR };
}

export const COMPANY_STATUS_LABEL: Record<string, string> = {
  COLD: "Cold",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  AGREED_TO_USE_US: "Agreed to Use Us",
  FIRST_JOB_SENT: "First Job Sent",
  REPEAT_CUSTOMER: "Repeat Customer",
  CLOSED_INACTIVE: "Closed/Inactive",
};

export const COMPANY_STATUS_ORDER = [
  "COLD",
  "CONTACTED",
  "INTERESTED",
  "AGREED_TO_USE_US",
  "FIRST_JOB_SENT",
  "REPEAT_CUSTOMER",
  "CLOSED_INACTIVE",
] as const;

export const DEAL_FLOW_TIER_LABEL: Record<string, string> = {
  HIGH_VOLUME: "High Volume",
  MEDIUM_VOLUME: "Medium Volume",
  LOW_VOLUME: "Low Volume",
  NEW_UNKNOWN: "New / Unknown",
};
