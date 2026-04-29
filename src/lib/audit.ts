// Append-only audit logging. NEVER update or delete rows in AuditLog (spec §5.15 / §15.11).
import { prisma } from "@/lib/prisma";
import type { AuditActionType, AuditEntityType, Prisma } from "@prisma/client";

export interface AuditInput {
  userId: string | null;
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}

export async function recordAudit(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? undefined,
      actionType: input.actionType,
      entityType: input.entityType,
      entityId: input.entityId ?? undefined,
      oldValue: (input.oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
      newValue: (input.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
      reason: input.reason ?? undefined,
    },
  });
}
