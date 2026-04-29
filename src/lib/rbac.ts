// Role-based access control helpers (spec §4).
// Gate every API route + server action through these — NOT just the UI.
import type { Role } from "@prisma/client";

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  LIMITED_ADMIN: "Limited Admin",
  SALES_REP: "Sales Rep",
  REGIONAL_MANAGER: "Regional Manager",
};

/** True if the role has owner-equivalent privileges. */
export function isOwner(role: Role | undefined | null): boolean {
  return role === "OWNER";
}

/** True if the role can see cost/margin/profit data. Reps NEVER see these. */
export function canSeeCosts(role: Role | undefined | null, permissions?: unknown): boolean {
  if (role === "OWNER") return true;
  if (role === "LIMITED_ADMIN" && isPermissionGranted(permissions, "can_see_costs")) return true;
  return false;
}

/** True if the role can delete company records. */
export function canDeleteCompany(role: Role | undefined | null, permissions?: unknown): boolean {
  if (role === "OWNER") return true;
  if (role === "LIMITED_ADMIN" && isPermissionGranted(permissions, "can_delete_companies")) return true;
  return false;
}

/** True if the role can invite new users and change roles. Owner-only by default. */
export function canManageUsers(role: Role | undefined | null): boolean {
  return role === "OWNER";
}

/** True if the role can view the audit log. Owner-only by default. */
export function canViewAuditLog(role: Role | undefined | null): boolean {
  return role === "OWNER";
}

/** True if the role can edit global settings. */
export function canEditGlobalSettings(role: Role | undefined | null, permissions?: unknown): boolean {
  if (role === "OWNER") return true;
  if (role === "LIMITED_ADMIN" && isPermissionGranted(permissions, "can_edit_settings")) return true;
  return false;
}

/** True if the role can edit/create deals. */
export function canManageDeals(role: Role | undefined | null): boolean {
  return role === "OWNER" || role === "LIMITED_ADMIN" || role === "SALES_REP";
}

/** True if the role must only see their assigned companies. */
export function isScopedToOwnCompanies(role: Role | undefined | null): boolean {
  return role === "SALES_REP";
}

function isPermissionGranted(permissions: unknown, key: string): boolean {
  if (!permissions || typeof permissions !== "object") return false;
  const v = (permissions as Record<string, unknown>)[key];
  return v === true;
}
