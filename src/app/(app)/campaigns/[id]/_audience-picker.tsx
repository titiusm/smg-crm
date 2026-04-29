"use client";
import * as React from "react";
import { Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { startCampaign } from "../actions";

interface Props {
  campaignId: string;
  statusOrder: readonly string[];
  statusLabels: Record<string, string>;
  tierLabels: Record<string, string>;
  hasEmails: boolean;
  initialFilter: { status?: string; dealFlowTier?: string; assignedRepId?: string };
}

export function AudiencePicker({
  campaignId,
  statusOrder,
  statusLabels,
  tierLabels,
  hasEmails,
  initialFilter,
}: Props) {
  const [filter, setFilter] = React.useState(initialFilter);

  return (
    <form action={startCampaign} className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="targetFilter" value={JSON.stringify(filter)} />
      <p className="text-xs text-(--color-muted-foreground)">
        Filter which companies receive this campaign. DNC/unsubscribed contacts and companies without
        an email contact are excluded automatically.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <select
            value={filter.status ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value || undefined }))}
            className="h-9 w-full rounded-[10px] border border-(--color-border) bg-(--color-input) px-3 text-sm"
          >
            <option value="">Any</option>
            {statusOrder.map((s) => (
              <option key={s} value={s}>{statusLabels[s]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Deal-flow tier</Label>
          <select
            value={filter.dealFlowTier ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, dealFlowTier: e.target.value || undefined }))}
            className="h-9 w-full rounded-[10px] border border-(--color-border) bg-(--color-input) px-3 text-sm"
          >
            <option value="">Any</option>
            {Object.entries(tierLabels).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={!hasEmails}>
          {hasEmails ? "Launch campaign" : "Add an email first"}
        </Button>
      </div>
    </form>
  );
}
