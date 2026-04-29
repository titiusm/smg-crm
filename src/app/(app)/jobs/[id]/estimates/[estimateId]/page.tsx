import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Badge, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { isScopedToOwnCompanies } from "@/lib/rbac";
import {
  addLineItem,
  updateLineItem,
  deleteLineItem,
  versionUp,
  markEstimateSent,
  applyMaximize,
} from "../actions";
import { maximizeSuggestions } from "@/lib/estimates";
import { FileDown, Plus, Trash2, History, Wand2 } from "lucide-react";
import { format } from "date-fns";

export default async function EstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; estimateId: string }>;
  searchParams: Promise<{ compare?: string }>;
}) {
  const session = await auth();
  if (!session) return null;
  const { id: jobId, estimateId } = await params;
  const { compare: compareVersion } = await searchParams;

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      job: { include: { company: true } },
    },
  });
  if (!estimate || estimate.jobId !== jobId) notFound();
  if (isScopedToOwnCompanies(session.user.role) && estimate.job.company.assignedRepId !== session.user.id) {
    redirect("/jobs");
  }

  const [menu, versions, suggestions] = await Promise.all([
    prisma.lineItemMenu.findMany({ where: { isActive: true }, orderBy: { itemName: "asc" } }),
    prisma.estimate.findMany({
      where: { jobId, estimateType: estimate.estimateType },
      orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true, totalAmount: true, createdAt: true, isCurrentVersion: true },
    }),
    estimate.estimateType === "INSURANCE_RETAIL"
      ? maximizeSuggestions(estimate.id)
      : Promise.resolve([]),
  ]);

  const comparePrevious = compareVersion
    ? await prisma.estimate.findFirst({
        where: { jobId, estimateType: estimate.estimateType, versionNumber: Number(compareVersion) },
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
      })
    : null;

  const typeLabel = estimate.estimateType === "INSURANCE_RETAIL" ? "Insurance Retail" : "Subcontractor";
  const otherType = estimate.estimateType === "INSURANCE_RETAIL" ? "SUBCONTRACTOR" : "INSURANCE_RETAIL";
  const otherLabel = estimate.estimateType === "INSURANCE_RETAIL" ? "Subcontractor" : "Insurance Retail";
  const otherCurrent = await prisma.estimate.findFirst({
    where: { jobId, estimateType: otherType, isCurrentVersion: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href={`/jobs/${jobId}`} className="text-xs text-(--color-muted-foreground) hover:text-(--color-foreground)">
            ← Back to job
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {typeLabel} Estimate <span className="text-(--color-muted-foreground) text-base font-normal">· v{estimate.versionNumber}</span>
          </h1>
          <div className="flex items-center gap-2 text-xs text-(--color-muted-foreground)">
            <span>{estimate.job.company.companyName}</span>
            {estimate.isCurrentVersion ? <Badge variant="accent">Current</Badge> : <Badge variant="muted">Archived</Badge>}
            {estimate.dateSent ? (
              <Badge variant="success">Sent {format(estimate.dateSent, "MMM d")}</Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {otherCurrent ? (
            <Link href={`/jobs/${jobId}/estimates/${otherCurrent.id}`}>
              <Button variant="outline" size="sm">Switch to {otherLabel}</Button>
            </Link>
          ) : null}
          <Link href={`/api/estimates/${estimate.id}/pdf`} target="_blank">
            <Button variant="outline" size="sm"><FileDown className="h-4 w-4" /> PDF</Button>
          </Link>
          <form action={versionUp}>
            <input type="hidden" name="estimateId" value={estimate.id} />
            <Button variant="secondary" size="sm" type="submit">
              <History className="h-4 w-4" /> New version
            </Button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Line items */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Line items</CardTitle>
            <div className="text-right">
              <div className="text-xs text-(--color-muted-foreground) uppercase tracking-wide">Total</div>
              <div className="text-xl font-semibold">
                ${Number(estimate.totalAmount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {estimate.lineItems.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-(--color-muted-foreground)">
                No line items yet. Add from the menu or create a custom one.
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-12 border-b border-(--color-border) bg-(--color-muted)/40 px-4 py-2 text-left text-xs uppercase tracking-wide text-(--color-muted-foreground)">
                  <div className="col-span-5">Item</div>
                  <div className="col-span-2">Qty</div>
                  <div className="col-span-2">Unit $</div>
                  <div className="col-span-2 text-right">Total</div>
                  <div className="col-span-1" />
                </div>
                <ul className="divide-y divide-(--color-border)">
                  {estimate.lineItems.map((li) => (
                    <li key={li.id} className="grid grid-cols-12 items-center gap-2 px-4 py-2">
                      <form
                        action={updateLineItem}
                        className="contents"
                      >
                        <input type="hidden" name="id" value={li.id} />
                        <div className="col-span-5">
                          <Input name="itemName" defaultValue={li.itemName} />
                        </div>
                        <div className="col-span-2">
                          <Input
                            name="quantity"
                            type="number"
                            step="0.01"
                            min={0}
                            defaultValue={Number(li.quantity).toString()}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            name="unitPrice"
                            type="number"
                            step="0.01"
                            min={0}
                            defaultValue={Number(li.unitPrice).toString()}
                          />
                        </div>
                        <div className="col-span-2 text-right text-sm font-medium">
                          ${Number(li.total).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        <div className="col-span-1 flex justify-end gap-1">
                          <Button type="submit" variant="outline" size="sm">
                            Save
                          </Button>
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
                            formAction={deleteLineItem}
                            formNoValidate
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          {/* Add from menu / custom */}
          <Card>
            <CardHeader><CardTitle>Add line item</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              <form action={addLineItem} className="space-y-2">
                <input type="hidden" name="estimateId" value={estimate.id} />
                <input type="hidden" name="isCustom" value="false" />
                <Label>From menu</Label>
                <MenuItemSelect menu={menu} panelCount={estimate.job.panelCount ?? 0} />
                <div className="flex justify-end">
                  <Button type="submit" size="sm"><Plus className="h-4 w-4" /> Add</Button>
                </div>
              </form>
              <div className="border-t border-(--color-border) pt-3">
                <form action={addLineItem} className="space-y-2">
                  <input type="hidden" name="estimateId" value={estimate.id} />
                  <input type="hidden" name="isCustom" value="true" />
                  <Label>Custom</Label>
                  <Input name="itemName" placeholder="Custom item name" required />
                  <div className="grid grid-cols-2 gap-2">
                    <Input name="quantity" type="number" step="0.01" min={0} defaultValue="1" placeholder="Qty" />
                    <Input name="unitPrice" type="number" step="0.01" min={0} placeholder="Unit price" />
                  </div>
                  <Textarea name="description" rows={2} placeholder="Description (optional)" />
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" variant="outline"><Plus className="h-4 w-4" /> Add custom</Button>
                  </div>
                </form>
              </div>
            </CardBody>
          </Card>

          {/* Maximize Insurance Estimate (only for insurance retail) */}
          {estimate.estimateType === "INSURANCE_RETAIL" ? (
            <Card>
              <CardHeader><CardTitle>Maximize insurance estimate</CardTitle></CardHeader>
              <CardBody>
                {suggestions.length === 0 ? (
                  <div className="text-xs text-(--color-muted-foreground)">
                    All common add-ons are already on this estimate.
                  </div>
                ) : (
                  <form action={applyMaximize} className="space-y-2">
                    <input type="hidden" name="estimateId" value={estimate.id} />
                    <p className="text-xs text-(--color-muted-foreground)">
                      Commonly-billable items that aren&apos;t yet on this estimate. Select any to add at default prices.
                    </p>
                    <div className="space-y-1">
                      {suggestions.map((s) => (
                        <label key={s.menuItemId} className="flex items-start gap-2 text-sm">
                          <input type="checkbox" name="accepted" value={s.menuItemId} defaultChecked />
                          <span>
                            <span className="font-medium">{s.itemName}</span>
                            <span className="text-[11px] text-(--color-muted-foreground) block">
                              ${s.defaultUnitPrice.toFixed(2)} · {s.unitType}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <input type="hidden" name="accepted" value="" />
                    <div className="flex justify-end">
                      <Button type="submit" size="sm"><Wand2 className="h-4 w-4" /> Apply selected</Button>
                    </div>
                    <p className="text-[11px] text-(--color-muted-foreground)">
                      Note: the checkbox group posts <code>accepted</code> once per checked item.
                    </p>
                  </form>
                )}
              </CardBody>
            </Card>
          ) : null}

          {/* Versions + compare */}
          <Card>
            <CardHeader><CardTitle>Versions</CardTitle></CardHeader>
            <CardBody className="p-0">
              <ul className="divide-y divide-(--color-border) text-sm">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between px-4 py-2">
                    <div>
                      <Link
                        href={`/jobs/${jobId}/estimates/${v.id}`}
                        className={
                          "font-medium " + (v.id === estimate.id ? "text-(--color-accent)" : "hover:text-(--color-accent)")
                        }
                      >
                        v{v.versionNumber}
                      </Link>
                      <div className="text-[11px] text-(--color-muted-foreground)">
                        {format(v.createdAt, "MMM d, yyyy")} · ${Number(v.totalAmount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    {v.id !== estimate.id ? (
                      <Link href={`/jobs/${jobId}/estimates/${estimate.id}?compare=${v.versionNumber}`}>
                        <Button variant="ghost" size="sm">Compare</Button>
                      </Link>
                    ) : v.isCurrentVersion ? <Badge variant="accent">Current</Badge> : null}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {/* Send */}
          <Card>
            <CardHeader><CardTitle>Send estimate</CardTitle></CardHeader>
            <CardBody>
              <form action={markEstimateSent} className="space-y-2">
                <input type="hidden" name="id" value={estimate.id} />
                <Label>Send to</Label>
                <Select name="sentTo" defaultValue="ROOFING_COMPANY">
                  <option value="ROOFING_COMPANY">Roofing company</option>
                  <option value="INSURANCE_COMPANY">Insurance company</option>
                </Select>
                <p className="text-[11px] text-(--color-muted-foreground)">
                  Records the send date. Actual SendGrid delivery arrives in Phase 1C.
                </p>
                <div className="flex justify-end">
                  <Button type="submit" size="sm">Mark as sent</Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Compare table */}
      {comparePrevious ? (
        <Card>
          <CardHeader><CardTitle>Comparison: v{comparePrevious.versionNumber} → v{estimate.versionNumber}</CardTitle></CardHeader>
          <CardBody className="p-0">
            <CompareTable previous={comparePrevious.lineItems} current={estimate.lineItems} />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function MenuItemSelect({
  menu,
  panelCount,
}: {
  menu: Array<{ id: string; itemName: string; defaultUnitPrice: { toString: () => string }; unitType: string }>;
  panelCount: number;
}) {
  return (
    <>
      <Select name="itemName" defaultValue="">
        <option value="" disabled>— pick an item —</option>
        {menu.map((m) => (
          <option key={m.id} value={m.itemName}>
            {m.itemName} · ${Number(m.defaultUnitPrice).toFixed(2)} · {m.unitType}
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-2">
        <Input name="quantity" type="number" step="0.01" min={0} defaultValue={panelCount || 1} placeholder="Qty" />
        <Input name="unitPrice" type="number" step="0.01" min={0} placeholder="Unit price (optional — defaults to menu)" />
      </div>
    </>
  );
}

function CompareTable({
  previous,
  current,
}: {
  previous: Array<{ id: string; itemName: string; quantity: { toString: () => string }; unitPrice: { toString: () => string }; total: { toString: () => string } }>;
  current: Array<{ id: string; itemName: string; quantity: { toString: () => string }; unitPrice: { toString: () => string }; total: { toString: () => string } }>;
}) {
  const prevByName = new Map(previous.map((p) => [p.itemName.toLowerCase(), p]));
  const curByName = new Map(current.map((p) => [p.itemName.toLowerCase(), p]));
  const allNames = new Set<string>([...prevByName.keys(), ...curByName.keys()]);
  const rows = [...allNames].sort().map((name) => ({
    name,
    prev: prevByName.get(name),
    cur: curByName.get(name),
  }));
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-(--color-border) bg-(--color-muted)/40">
        <tr className="text-left text-xs uppercase tracking-wide text-(--color-muted-foreground)">
          <th className="px-3 py-2">Item</th>
          <th className="px-3 py-2 text-right">Previous</th>
          <th className="px-3 py-2 text-right">Current</th>
          <th className="px-3 py-2 text-right">Delta</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-(--color-border)">
        {rows.map((r) => {
          const prevTotal = r.prev ? Number(r.prev.total) : 0;
          const curTotal = r.cur ? Number(r.cur.total) : 0;
          const delta = curTotal - prevTotal;
          const status = !r.prev ? "added" : !r.cur ? "removed" : prevTotal !== curTotal ? "changed" : "same";
          return (
            <tr key={r.name}>
              <td className="px-3 py-2">
                {r.cur?.itemName ?? r.prev?.itemName}{" "}
                {status === "added" ? <Badge variant="success" className="text-[10px]">added</Badge> : null}
                {status === "removed" ? <Badge variant="danger" className="text-[10px]">removed</Badge> : null}
                {status === "changed" ? <Badge variant="warning" className="text-[10px]">changed</Badge> : null}
              </td>
              <td className="px-3 py-2 text-right">{r.prev ? `$${prevTotal.toFixed(2)}` : "—"}</td>
              <td className="px-3 py-2 text-right">{r.cur ? `$${curTotal.toFixed(2)}` : "—"}</td>
              <td className={"px-3 py-2 text-right " + (delta > 0 ? "text-(--color-success)" : delta < 0 ? "text-(--color-danger)" : "")}>
                {delta === 0 ? "—" : `${delta > 0 ? "+" : ""}$${delta.toFixed(2)}`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
