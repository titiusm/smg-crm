"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-(--color-border) bg-(--color-card) text-(--color-card-foreground) shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pt-4 pb-3 border-b border-(--color-border)", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold tracking-tight", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-[10px] border border-(--color-border) bg-(--color-input) px-3 text-sm outline-none",
        "placeholder:text-(--color-muted-foreground)",
        "focus-visible:ring-2 focus-visible:ring-(--color-ring) focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-[10px] border border-(--color-border) bg-(--color-input) px-3 py-2 text-sm outline-none",
        "placeholder:text-(--color-muted-foreground)",
        "focus-visible:ring-2 focus-visible:ring-(--color-ring) focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-[10px] border border-(--color-border) bg-(--color-input) px-3 text-sm outline-none",
        "focus-visible:ring-2 focus-visible:ring-(--color-ring) focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-(--color-foreground)", className)} {...props} />;
}

type BadgeVariant = "default" | "accent" | "danger" | "warning" | "success" | "muted";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  const styles: Record<BadgeVariant, string> = {
    default:
      "border border-(--color-border) bg-(--color-muted) text-(--color-foreground)",
    accent: "bg-(--color-accent)/15 text-(--color-accent) border border-(--color-accent)/30",
    danger: "bg-(--color-danger)/15 text-(--color-danger) border border-(--color-danger)/30",
    warning: "bg-(--color-warning)/15 text-(--color-warning) border border-(--color-warning)/30",
    success: "bg-(--color-success)/15 text-(--color-success) border border-(--color-success)/30",
    muted: "bg-(--color-muted) text-(--color-muted-foreground) border border-(--color-border)",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border border-(--color-border) bg-(--color-input) text-(--color-accent) focus:ring-(--color-ring)",
        className
      )}
      {...props}
    />
  );
}

export function Spacer({ className }: { className?: string }) {
  return <div className={cn("h-4", className)} />;
}
