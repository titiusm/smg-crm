import Link from "next/link";
import { requireRole } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { uploadCsv } from "./actions";
import { format } from "date-fns";

export default async function ImportPage() {
  await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const recent = await prisma.csvImport.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: { importedBy: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CSV Import</h1>
        <p className="text-sm text-(--color-muted-foreground)">
          Upload a CSV of roofing companies. Map the fields, review any potential duplicates,
          then finalize — nothing is ever auto-merged.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload CSV</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={uploadCsv} className="space-y-3">
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="block w-full text-sm file:mr-3 file:rounded-[10px] file:border file:border-(--color-border) file:bg-(--color-muted) file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-(--color-border)"
            />
            <p className="text-xs text-(--color-muted-foreground)">
              We&apos;ll auto-detect Outscraper columns. You can change the mapping on the next step.
            </p>
            <Button type="submit">Upload &amp; continue</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent imports</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {recent.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-(--color-muted-foreground)">
              No imports yet.
            </div>
          ) : (
            <ul className="divide-y divide-(--color-border) text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.filename}</div>
                    <div className="text-[11px] text-(--color-muted-foreground)">
                      {r.importedBy.firstName} {r.importedBy.lastName} · {format(r.createdAt, "MMM d, yyyy p")} ·
                      {" "}{r.rowsTotal.toLocaleString()} rows
                      {r.status === "FINALIZED"
                        ? ` · ${r.rowsImported} imported, ${r.rowsSkipped} skipped, ${r.duplicatesFound} duplicates`
                        : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.status === "FINALIZED" ? "success" : r.status === "STAGED" ? "warning" : "muted"}>
                      {r.status}
                    </Badge>
                    {r.status === "STAGED" ? (
                      <Link href={`/import/${r.id}/map`}>
                        <Button variant="outline" size="sm">Resume</Button>
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
