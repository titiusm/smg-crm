import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { finalizeImport } from "../../actions";

export default async function FinalizePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const { id } = await params;
  const imp = await prisma.csvImport.findUnique({ where: { id } });
  if (!imp) notFound();

  const newCount = await prisma.csvImportStagingRow.count({
    where: { importId: id, action: "IMPORT_NEW" },
  });

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Finalize import</h1>
      <Card>
        <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
        <CardBody className="space-y-2 text-sm">
          <p>File: <strong>{imp.filename}</strong></p>
          <p>Total rows parsed: {imp.rowsTotal.toLocaleString()}</p>
          <p>Will be created as new companies: {newCount.toLocaleString()}</p>
          <p>Duplicates detected: {imp.duplicatesFound.toLocaleString()}</p>
          <form action={finalizeImport} className="pt-2">
            <input type="hidden" name="importId" value={id} />
            <div className="flex justify-end gap-2">
              <Link href="/import"><Button variant="outline" type="button">Cancel</Button></Link>
              <Button type="submit">Finalize &amp; import</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
