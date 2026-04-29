"use client";
import * as React from "react";
import { ReactGridLayout, type Layout } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import { saveLayout, resetLayout } from "@/app/(app)/dashboard/actions";
import type { LayoutItem, WidgetInstance } from "@/lib/widgets";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, RotateCcw } from "lucide-react";

interface Props {
  initialLayout: LayoutItem[];
  initialWidgets: WidgetInstance[];
  /** Pre-rendered widget content, keyed by widget id */
  widgetContent: Record<string, React.ReactNode>;
}

const COLS = 12;
const ROW_HEIGHT = 40;
const MARGIN = [12, 12] as const;

export function WidgetGrid({ initialLayout, initialWidgets, widgetContent }: Props) {
  const [editing, setEditing] = React.useState(false);
  const [layout, setLayout] = React.useState(initialLayout);
  const [width, setWidth] = React.useState(1200);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  async function persist(nextLayout: LayoutItem[]) {
    setLayout(nextLayout);
    const fd = new FormData();
    fd.set("layout", JSON.stringify(nextLayout));
    fd.set("widgets", JSON.stringify(initialWidgets));
    await saveLayout(fd);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <form action={resetLayout}>
          <Button variant="ghost" size="sm" type="submit">
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        </form>
        <Button
          variant={editing ? "primary" : "outline"}
          size="sm"
          onClick={() => setEditing((v) => !v)}
          type="button"
        >
          {editing ? (
            <>
              <Unlock className="h-4 w-4" /> Editing layout
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" /> Edit layout
            </>
          )}
        </Button>
      </div>
      <div ref={containerRef}>
        <ReactGridLayout
          className="layout"
          layout={layout as Layout}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          width={width}
          margin={MARGIN}
          isDraggable={editing}
          isResizable={editing}
          draggableHandle=".drag-handle"
          onLayoutChange={(next: Layout) => {
            if (!editing) return;
            persist(next as unknown as LayoutItem[]);
          }}
        >
          {initialWidgets.map((w) => (
            <div key={w.id} className="relative">
              {editing ? (
                <div className="drag-handle absolute inset-0 z-10 cursor-move rounded-[14px] border-2 border-dashed border-(--color-accent)/50 bg-(--color-accent)/5" />
              ) : null}
              <div className="h-full">{widgetContent[w.id]}</div>
            </div>
          ))}
        </ReactGridLayout>
      </div>
    </div>
  );
}
