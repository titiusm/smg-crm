"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/primitives";
import { X, Plus, Trash2 } from "lucide-react";
import { updateUserCommission } from "./actions";
import type { CommissionStructure } from "@/lib/commission";

interface Props {
  userId: string;
  userName: string;
  current: CommissionStructure;
}

export function CommissionEditor({ userId, userName, current }: Props) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" size="sm" type="button" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open ? (
        <Modal title={`Commission — ${userName}`} onClose={() => setOpen(false)}>
          <Editor userId={userId} initial={current} onDone={() => setOpen(false)} />
        </Modal>
      ) : null}
    </>
  );
}

function Editor({
  userId,
  initial,
  onDone,
}: {
  userId: string;
  initial: CommissionStructure;
  onDone: () => void;
}) {
  const [type, setType] = React.useState<CommissionStructure["type"]>(initial.type);
  const [ratePercent, setRatePercent] = React.useState<string>(
    initial.type === "flat_revenue" || initial.type === "flat_profit"
      ? (initial.rate * 100).toString()
      : "20"
  );
  const [basePercent, setBasePercent] = React.useState<string>(
    initial.type === "quarterly_revenue_tiers" ? (initial.base_rate * 100).toString() : "10"
  );
  const [tiers, setTiers] = React.useState<Array<{ min: string; max: string; ratePct: string }>>(
    initial.type === "quarterly_revenue_tiers"
      ? initial.tiers.map((t) => ({
          min: String(t.min),
          max: t.max == null ? "" : String(t.max),
          ratePct: String(t.rate * 100),
        }))
      : [
          { min: "250000", max: "374999", ratePct: "12" },
          { min: "375000", max: "499999", ratePct: "13" },
          { min: "500000", max: "", ratePct: "14" },
        ]
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      formData.set("id", userId);
      formData.set("type", type);
      if (type === "flat_revenue" || type === "flat_profit") {
        formData.set("ratePercent", ratePercent);
      } else {
        formData.set("basePercent", basePercent);
        const tiersForJson = tiers
          .filter((t) => t.min !== "" || t.max !== "" || t.ratePct !== "")
          .map((t) => ({
            min: Number(t.min) || 0,
            max: t.max === "" ? null : Number(t.max),
            rate: Number(t.ratePct) / 100,
          }));
        formData.set("tiersJson", JSON.stringify(tiersForJson));
      }
      await updateUserCommission(formData);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Structure type</Label>
        <Select value={type} onChange={(e) => setType(e.target.value as CommissionStructure["type"])}>
          <option value="flat_revenue">Flat % of revenue (per job)</option>
          <option value="flat_profit">Flat % of profit (per job)</option>
          <option value="quarterly_revenue_tiers">Quarterly revenue tiers (with retroactive bonus)</option>
        </Select>
      </div>

      {type === "flat_revenue" ? (
        <div className="space-y-1.5">
          <Label>Rate (% of subcontractor revenue)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={ratePercent}
              onChange={(e) => setRatePercent(e.target.value)}
              className="w-32"
              required
            />
            <span className="text-sm text-(--color-muted-foreground)">% of every job&apos;s subcontractor total</span>
          </div>
        </div>
      ) : null}

      {type === "flat_profit" ? (
        <div className="space-y-1.5">
          <Label>Rate (% of profit)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={ratePercent}
              onChange={(e) => setRatePercent(e.target.value)}
              className="w-32"
              required
            />
            <span className="text-sm text-(--color-muted-foreground)">% of profit snapshot per job</span>
          </div>
          <p className="text-[11px] text-(--color-muted-foreground)">
            Computed once costs are entered (subcontractor total − actual cost). Until then commission is null on that job.
          </p>
        </div>
      ) : null}

      {type === "quarterly_revenue_tiers" ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Base rate (%)</Label>
            <Input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={basePercent}
              onChange={(e) => setBasePercent(e.target.value)}
              className="w-32"
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Quarterly bonus tiers (revenue ≥ min → effective rate)</Label>
            <div className="space-y-1">
              {tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="min"
                    value={t.min}
                    onChange={(e) => {
                      const next = [...tiers];
                      next[i].min = e.target.value;
                      setTiers(next);
                    }}
                    className="w-32"
                  />
                  <span className="text-xs">to</span>
                  <Input
                    type="number"
                    placeholder="max (blank = ∞)"
                    value={t.max}
                    onChange={(e) => {
                      const next = [...tiers];
                      next[i].max = e.target.value;
                      setTiers(next);
                    }}
                    className="w-32"
                  />
                  <span className="text-xs">→</span>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="rate %"
                    value={t.ratePct}
                    onChange={(e) => {
                      const next = [...tiers];
                      next[i].ratePct = e.target.value;
                      setTiers(next);
                    }}
                    className="w-24"
                  />
                  <span className="text-xs">%</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remove tier"
                    onClick={() => setTiers(tiers.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setTiers([...tiers, { min: "", max: "", ratePct: "" }])}
              >
                <Plus className="h-3.5 w-3.5" /> Add tier
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[8px] border border-(--color-danger)/40 bg-(--color-danger)/10 px-3 py-2 text-xs text-(--color-danger)">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-2">
        <p className="text-[11px] text-(--color-muted-foreground)">
          Saving recomputes commissions on this rep&apos;s unlocked jobs. Locked / Paid jobs are preserved.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </form>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-2xl rounded-[14px] border border-(--color-border) bg-(--color-card) shadow-xl">
        <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

