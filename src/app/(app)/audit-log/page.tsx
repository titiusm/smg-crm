import { requireRole } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { format } from "date-fns";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole(["OWNER"]);
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
  const pageSize = 100;

  const [total, rows] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: true },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-(--color-muted-foreground)">
          Append-only record of financial, permission, and DNC changes. Owner-only.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Entries</CardTitle></CardHeader>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-(--color-muted-foreground)">
              No audit entries yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-(--color-border) bg-(--color-muted)/40">
                <tr className="text-left text-xs uppercase tracking-wide text-(--color-muted-foreground)">
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Actor</th>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">Entity</th>
                  <th className="px-4 py-2">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 text-xs text-(--color-muted-foreground) whitespace-nowrap">
                      {format(r.createdAt, "MMM d, yyyy HH:mm")}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {r.user ? `${r.user.firstName} ${r.user.lastName}` : "System"}
                    </td>
                    <td className="px-4 py-2"><Badge variant="muted">{r.actionType.replace(/_/g, " ")}</Badge></td>
                    <td className="px-4 py-2 text-xs">
                      {r.entityType}
                      {r.entityId ? <span className="text-(--color-muted-foreground)"> · {r.entityId.slice(0, 8)}</span> : null}
                    </td>
                    <td className="px-4 py-2">
                      {r.oldValue || r.newValue ? (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-(--color-accent)">view diff</summary>
                          <pre className="mt-1 max-h-48 overflow-auto rounded-[8px] bg-(--color-muted) p-2 text-[11px]">
{JSON.stringify({ old: r.oldValue, new: r.newValue }, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-[11px] text-(--color-muted-foreground)">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex items-center justify-between border-t border-(--color-border) px-4 py-2 text-xs text-(--color-muted-foreground)">
            <div>{total.toLocaleString()} entries · page {page}</div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
