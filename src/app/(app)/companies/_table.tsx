"use client";
import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Ban } from "lucide-react";
import { formatPhoneForDisplay } from "@/lib/utils";
import { bulkAssignRep, bulkChangeStatus } from "./actions";
import type { CompanyStatus, DealFlowTier } from "@prisma/client";

export interface CompanyRow {
  id: string;
  companyName: string;
  status: CompanyStatus;
  dealFlowTier: DealFlowTier;
  addressCity: string | null;
  addressState: string | null;
  phoneNumber: string | null;
  email: string | null;
  googleReviewCount: number | null;
  googleRating: number | null;
  doNotCall: boolean;
  doNotEmail: boolean;
  doNotText: boolean;
  assignedRepLabel: string | null;
}

interface Props {
  rows: CompanyRow[];
  canBulkEdit: boolean; // owner / admin only
  statusLabels: Record<string, string>;
  tierLabels: Record<string, string>;
  reps: Array<{ id: string; label: string }>;
}

export function BulkCompaniesTable({ rows, canBulkEdit, statusLabels, tierLabels, reps }: Props) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const allIds = React.useMemo(() => rows.map((r) => r.id), [rows]);
  const allChecked = selected.size > 0 && selected.size === allIds.length;
  const someChecked = selected.size > 0 && !allChecked;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(selected.size === allIds.length ? new Set() : new Set(allIds));
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-(--color-border) bg-(--color-muted)/40">
            <tr className="text-left text-xs uppercase tracking-wide text-(--color-muted-foreground)">
              {canBulkEdit ? (
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={toggleAll}
                  />
                </th>
              ) : null}
              <th className="px-4 py-2">Company</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Tier</th>
              <th className="px-4 py-2">Location</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Assigned</th>
              <th className="px-4 py-2">Reviews</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-(--color-muted)/40">
                {canBulkEdit ? (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${c.companyName}`}
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                  </td>
                ) : null}
                <td className="px-4 py-2">
                  <Link href={`/companies/${c.id}`} className="font-medium hover:text-(--color-accent)">
                    {c.companyName}
                  </Link>
                  <div className="flex items-center gap-1.5 text-[11px] text-(--color-muted-foreground) mt-0.5">
                    {c.email ? (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {c.email}
                      </span>
                    ) : null}
                    {c.doNotCall || c.doNotEmail || c.doNotText ? (
                      <Badge variant="danger" className="text-[10px]">
                        <Ban className="h-3 w-3" /> DNC
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <Badge variant="muted">{statusLabels[c.status]}</Badge>
                </td>
                <td className="px-4 py-2">
                  <span className="text-xs">{tierLabels[c.dealFlowTier]}</span>
                </td>
                <td className="px-4 py-2 text-xs text-(--color-muted-foreground)">
                  {[c.addressCity, c.addressState].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-2 text-xs">
                  {c.phoneNumber ? (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {formatPhoneForDisplay(c.phoneNumber)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 text-xs">{c.assignedRepLabel ?? "—"}</td>
                <td className="px-4 py-2 text-xs">
                  {c.googleReviewCount != null ? c.googleReviewCount.toLocaleString() : "—"}
                  {c.googleRating ? ` · ${c.googleRating}★` : ""}
                </td>
                <td className="px-4 py-2">
                  <Link href={`/companies/${c.id}`}>
                    <Button variant="outline" size="sm">Open</Button>
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canBulkEdit ? 9 : 8} className="px-4 py-10 text-center text-sm text-(--color-muted-foreground)">
                  No companies match your filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canBulkEdit && selected.size > 0 ? (
        <BulkBar selected={selected} reps={reps} statusLabels={statusLabels} onClear={() => setSelected(new Set())} />
      ) : null}
    </>
  );
}

function BulkBar({
  selected,
  reps,
  statusLabels,
  onClear,
}: {
  selected: Set<string>;
  reps: Array<{ id: string; label: string }>;
  statusLabels: Record<string, string>;
  onClear: () => void;
}) {
  const ids = Array.from(selected).join(",");
  const exportHref = `/api/companies/export?ids=${encodeURIComponent(ids)}`;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-[12px] border border-(--color-border) bg-(--color-card) px-3 py-2 shadow-lg">
        <span className="text-sm font-medium pl-1 pr-2 border-r border-(--color-border)">
          {selected.size} selected
        </span>

        <form action={bulkAssignRep} className="flex items-center gap-2">
          <input type="hidden" name="ids" value={ids} />
          <select
            name="assignedRepId"
            className="h-8 rounded-[8px] border border-(--color-border) bg-(--color-input) px-2 text-xs"
            defaultValue=""
          >
            <option value="">Unassign</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline">Assign</Button>
        </form>

        <div className="w-px h-6 bg-(--color-border)" />

        <form action={bulkChangeStatus} className="flex items-center gap-2">
          <input type="hidden" name="ids" value={ids} />
          <select
            name="status"
            className="h-8 rounded-[8px] border border-(--color-border) bg-(--color-input) px-2 text-xs"
            defaultValue="CONTACTED"
          >
            {Object.entries(statusLabels).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline">Set status</Button>
        </form>

        <div className="w-px h-6 bg-(--color-border)" />

        <Link href={exportHref} target="_blank">
          <Button type="button" size="sm" variant="outline">Export CSV</Button>
        </Link>

        <Button type="button" size="sm" variant="ghost" onClick={onClear}>Clear</Button>
      </div>
    </div>
  );
}
