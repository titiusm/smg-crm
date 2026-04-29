import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Badge, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { finalizeImport, setRowAction } from "../../actions";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const { id } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
  const pageSize = 25;

  const imp = await prisma.csvImport.findUnique({ where: { id } });
  if (!imp) notFound();

  const [totalDupes, rows] = await Promise.all([
    prisma.csvImportStagingRow.count({ where: { importId: id, isDuplicate: true } }),
    prisma.csvImportStagingRow.findMany({
      where: { importId: id, isDuplicate: true },
      orderBy: { rowIndex: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Fetch matched companies for display
  const matchIds = rows.map((r) => r.matchCompanyId).filter((x): x is string => !!x);
  const matches = await prisma.company.findMany({
    where: { id: { in: matchIds } },
  });
  const matchMap = new Map(matches.map((m) => [m.id, m]));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <Link href="/import" className="text-xs text-(--color-muted-foreground) hover:text-(--color-foreground)">
          ← Back to imports
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Review duplicates</h1>
        <p className="text-sm text-(--color-muted-foreground)">
          {totalDupes.toLocaleString()} potential duplicates detected. Choose an action for each —
          nothing is auto-merged.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Potential duplicates</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-(--color-border) bg-(--color-muted)/40">
                <tr className="text-left text-xs uppercase tracking-wide text-(--color-muted-foreground)">
                  <th className="px-4 py-2">Incoming row</th>
                  <th className="px-4 py-2">Existing match</th>
                  <th className="px-4 py-2">Match on</th>
                  <th className="px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {rows.map((r) => {
                  const d = r.mappedData as Record<string, string | number | null>;
                  const m = r.matchCompanyId ? matchMap.get(r.matchCompanyId) : undefined;
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2 align-top">
                        <div className="font-medium">{String(d.companyName ?? "")}</div>
                        <div className="text-[11px] text-(--color-muted-foreground)">
                          {[d.addressCity, d.addressState].filter(Boolean).join(", ") || "—"}
                          {d.phoneNumber ? ` · ${String(d.phoneNumber)}` : ""}
                          {d.email ? ` · ${String(d.email)}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-2 align-top">
                        {m ? (
                          <Link href={`/companies/${m.id}`} className="font-medium hover:text-(--color-accent)">
                            {m.companyName}
                            <div className="text-[11px] text-(--color-muted-foreground) font-normal">
                              {[m.addressCity, m.addressState].filter(Boolean).join(", ") || "—"}
                              {m.phoneNumber ? ` · ${m.phoneNumber}` : ""}
                              {m.email ? ` · ${m.email}` : ""}
                            </div>
                          </Link>
                        ) : (
                          <span className="text-(--color-muted-foreground)">unknown</span>
                        )}
                      </td>
                      <td className="px-4 py-2 align-top">
                        <Badge variant="warning">{r.matchReason?.replace(/_/g, " ") ?? "—"}</Badge>
                      </td>
                      <td className="px-4 py-2 align-top">
                        <form action={setRowAction} className="flex items-center gap-2">
                          <input type="hidden" name="rowId" value={r.id} />
                          <Select name="action" defaultValue={r.action}>
                            <option value="MERGE_WITH_EXISTING">Merge with existing</option>
                            <option value="IMPORT_NEW">Import as new</option>
                            <option value="SKIP">Skip</option>
                          </Select>
                          <Button type="submit" variant="outline" size="sm">Save</Button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-(--color-border) px-4 py-2 text-xs text-(--color-muted-foreground)">
            <div>Page {page} of {Math.max(1, Math.ceil(totalDupes / pageSize))}</div>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={`/import/${id}/review?page=${page - 1}`}><Button variant="outline" size="sm">Prev</Button></Link>
              ) : null}
              {page * pageSize < totalDupes ? (
                <Link href={`/import/${id}/review?page=${page + 1}`}><Button variant="outline" size="sm">Next</Button></Link>
              ) : null}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex items-center justify-between">
          <div className="text-sm text-(--color-muted-foreground)">
            Ready to finalize? Everything marked <strong>Import as new</strong> or
            <strong> Merge</strong> will be applied. Skips are preserved on the import record.
          </div>
          <form action={finalizeImport}>
            <input type="hidden" name="importId" value={id} />
            <Button type="submit">Finalize import</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
