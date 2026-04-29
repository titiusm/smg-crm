"use client";
import * as React from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Toggles the sidebar visibility on mobile. Uses CSS classes on <body>. */
export function MobileSidebarToggle() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    document.documentElement.classList.toggle("sidebar-open", open);
    return () => document.documentElement.classList.remove("sidebar-open");
  }, [open]);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={open ? "Close menu" : "Open menu"}
      onClick={() => setOpen((v) => !v)}
      className="md:hidden"
    >
      {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
    </Button>
  );
}
