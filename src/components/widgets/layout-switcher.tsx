"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { ChevronDown, Plus, Trash2, Pencil, Check } from "lucide-react";
import {
  deleteLayout,
  renameLayout,
  saveLayoutAs,
  switchLayout,
} from "@/app/(app)/dashboard/actions";

export interface LayoutSummary {
  id: string;
  name: string;
  isDefault: boolean;
}

export function LayoutSwitcher({ layouts, activeId }: { layouts: LayoutSummary[]; activeId: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [saveAsOpen, setSaveAsOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const active = layouts.find((l) => l.id === activeId) ?? layouts[0];

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={() => setOpen((v) => !v)}
      >
        {active?.name ?? "Default"}
        <ChevronDown className="h-4 w-4" />
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-[12px] border border-(--color-border) bg-(--color-card) p-1 shadow-lg">
          <ul className="space-y-0.5">
            {layouts.map((l) => (
              <li key={l.id} className="flex items-center gap-1 rounded-[8px] px-1 py-0.5 hover:bg-(--color-muted)">
                {renamingId === l.id ? (
                  <form action={renameLayout} className="flex items-center gap-1 flex-1">
                    <input type="hidden" name="id" value={l.id} />
                    <Input name="name" defaultValue={l.name} autoFocus className="h-7 text-xs" />
                    <Button type="submit" size="icon" variant="ghost" onClick={() => setRenamingId(null)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </form>
                ) : (
                  <>
                    <form action={switchLayout} className="flex-1">
                      <input type="hidden" name="id" value={l.id} />
                      <button
                        type="submit"
                        className={
                          "flex w-full items-center justify-between rounded-[8px] px-2 py-1.5 text-sm hover:bg-(--color-muted) " +
                          (l.id === activeId ? "text-(--color-accent) font-medium" : "")
                        }
                      >
                        <span className="truncate">{l.name}</span>
                        {l.id === activeId ? <Check className="h-3.5 w-3.5" /> : null}
                      </button>
                    </form>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Rename"
                      onClick={() => setRenamingId(l.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {layouts.length > 1 ? (
                      <form action={deleteLayout}>
                        <input type="hidden" name="id" value={l.id} />
                        <Button type="submit" size="icon" variant="ghost" aria-label="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="border-t border-(--color-border) mt-1 pt-1">
            {saveAsOpen ? (
              <form action={saveLayoutAs} className="flex items-center gap-1 px-1">
                <Input name="name" placeholder="Layout name" autoFocus className="h-7 text-xs" />
                <Button type="submit" size="icon" variant="ghost" onClick={() => setSaveAsOpen(false)}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setSaveAsOpen(true)}
                className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm hover:bg-(--color-muted)"
              >
                <Plus className="h-3.5 w-3.5" /> Save current as new layout
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
