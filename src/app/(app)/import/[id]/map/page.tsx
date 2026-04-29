import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { applyMapping } from "../../actions";
import { SYSTEM_FIELDS, guessMapping, type SystemFieldKey } from "@/lib/csv-mapping";

export default async function MapPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const { id } = await params;
  const imp = await prisma.csvImport.findUnique({ where: { id } });
  if (!imp) notFound();
  const meta = imp.fieldMapping as { headers: string[]; mapping: Record<string, SystemFieldKey | ""> };
  const stored = meta.mapping ?? {};
  const guessed = guessMapping(meta.headers);
  const effective = Object.fromEntries(
    meta.headers.map((h) => [h, stored[h] ?? guessed[h] ?? ""])
  ) as Record<string, SystemFieldKey | "">;

  // Show a few sample rows for context
  const sample = await prisma.csvImportStagingRow.findMany({
    where: { importId: id },
    orderBy: { rowIndex: "asc" },
    take: 3,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <Link href="/import" className="text-xs text-(--color-muted-foreground) hover:text-(--color-foreground)">
          ← Back to imports
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Map CSV fields</h1>
        <p className="text-sm text-(--color-muted-foreground)">
          File: <span className="font-medium text-(--color-foreground)">{imp.filename}</span> ·
          {" "}{imp.rowsTotal.toLocaleString()} rows · {meta.headers.length} columns
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Column mapping</CardTitle></CardHeader>
        <CardBody>
          <form action={applyMapping} className="space-y-4">
            <input type="hidden" name="importId" value={imp.id} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-(--color-muted-foreground)">
                    <th className="pb-2 pr-4">CSV column</th>
                    <th className="pb-2 pr-4">Sample values</th>
                    <th className="pb-2">Map to</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border)">
                  {meta.headers.map((h) => (
                    <tr key={h}>
                      <td className="py-2 pr-4 font-mono text-xs">{h}</td>
                      <td className="py-2 pr-4 text-xs text-(--color-muted-foreground) max-w-[320px]">
                        <div className="truncate">
                          {sample
                            .map((r) => (r.rawData as Record<string, string>)[h])
                            .filter(Boolean)
                            .slice(0, 3)
                            .join(" | ") || "—"}
                        </div>
                      </td>
                      <td className="py-2">
                        <Select name={`map__${h}`} defaultValue={effective[h]}>
                          <option value="">— Don&apos;t import —</option>
                          {SYSTEM_FIELDS.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}{f.required ? " *" : ""}
                            </option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Link href="/import"><Button variant="outline" type="button">Cancel</Button></Link>
              <Button type="submit">Apply mapping &amp; detect duplicates</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
