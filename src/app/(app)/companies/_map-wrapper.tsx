"use client";
import dynamic from "next/dynamic";
import type { MapCompany } from "./_map";

const CompaniesMap = dynamic(() => import("./_map").then((m) => m.CompaniesMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[540px] items-center justify-center rounded-[14px] border border-(--color-border) text-sm text-(--color-muted-foreground)">
      Loading map…
    </div>
  ),
});

export function CompaniesMapWrapper({ companies }: { companies: MapCompany[] }) {
  return <CompaniesMap companies={companies} />;
}
