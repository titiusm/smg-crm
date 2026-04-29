"use client";
import * as React from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useTheme } from "@/components/theme-provider";

export interface MapCompany {
  id: string;
  companyName: string;
  latitude: number;
  longitude: number;
  status: string;
  statusLabel: string;
  addressCity: string | null;
  addressState: string | null;
  dnc: boolean;
}

// Tile providers — free Carto basemaps. Dark Matter for dark mode, Positron for light.
const TILES = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
} as const;

// Soft, status-aware palette.
function pinColorFor(status: string): string {
  if (
    status === "AGREED_TO_USE_US" ||
    status === "FIRST_JOB_SENT" ||
    status === "REPEAT_CUSTOMER"
  ) return "#14B8A6"; // teal — warm leads / customers
  if (status === "CONTACTED" || status === "INTERESTED") return "#F59E0B"; // amber
  if (status === "CLOSED_INACTIVE") return "#9CA3AF"; // grey
  return "#64748B"; // cold (slate)
}

/** Build a small circular divIcon with a white halo + optional red DNC outline. */
function circleIcon(color: string, dnc: boolean): L.DivIcon {
  const size = 14;
  const outline = dnc ? "#ef4444" : "#ffffff";
  const ring = dnc ? 2.5 : 2;
  return L.divIcon({
    className: "smg-marker",
    html: `<span style="
      display:inline-block;
      width:${size}px;
      height:${size}px;
      border-radius:9999px;
      background:${color};
      box-shadow: 0 0 0 ${ring}px ${outline}, 0 1px 3px rgba(0,0,0,0.25);
    "></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Cluster layer — subscribes to company list, manages a
 * `L.markerClusterGroup` on the map imperatively. React-side, we
 * only render the <MapContainer>/<TileLayer>; markers live in leaflet.
 */
function ClusterLayer({ companies }: { companies: MapCompany[] }) {
  const map = useMap();
  React.useEffect(() => {
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (c) => {
        const count = c.getChildCount();
        const size = count < 10 ? 32 : count < 100 ? 38 : 46;
        return L.divIcon({
          className: "smg-cluster",
          html: `<div style="
            width:${size}px; height:${size}px; line-height:${size - 4}px;
            border-radius:9999px;
            background: rgba(20,184,166,0.85);
            color:#fff; font-weight:600; text-align:center;
            font-size: ${count < 100 ? 13 : 11}px;
            border: 2px solid rgba(255,255,255,0.85);
            box-shadow: 0 2px 6px rgba(0,0,0,0.25);
          ">${count}</div>`,
          iconSize: [size, size],
        });
      },
    });

    for (const c of companies) {
      const marker = L.marker([c.latitude, c.longitude], {
        icon: circleIcon(pinColorFor(c.status), c.dnc),
      });
      // Popup content — kept as HTML strings so we don't need a React portal.
      const location = [c.addressCity, c.addressState].filter(Boolean).join(", ") || "—";
      marker.bindPopup(`
        <div style="min-width:200px">
          <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(c.companyName)}</div>
          <div style="font-size:11px;color:#64748b;margin-bottom:6px;">${escapeHtml(location)}</div>
          <div style="font-size:11px;margin-bottom:6px;">Status: <strong>${escapeHtml(c.statusLabel)}</strong>${c.dnc ? ' · <span style="color:#ef4444">DNC</span>' : ""}</div>
          <a href="/companies/${c.id}" style="color:#0f766e;font-size:12px;text-decoration:none;">Open company →</a>
        </div>
      `);
      cluster.addLayer(marker);
    }

    map.addLayer(cluster);

    if (companies.length > 0) {
      const bounds = L.latLngBounds(companies.map((c) => [c.latitude, c.longitude]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    }

    return () => {
      map.removeLayer(cluster);
    };
  }, [map, companies]);

  return null;
}

export function CompaniesMap({ companies }: { companies: MapCompany[] }) {
  const { resolved } = useTheme();
  const tiles = resolved === "dark" ? TILES.dark : TILES.light;

  const center: [number, number] = companies.length > 0
    ? [companies[0].latitude, companies[0].longitude]
    : [32.7355, -97.1081]; // Arlington, TX default

  return (
    <div className="relative h-[600px] w-full overflow-hidden rounded-[14px] border border-(--color-border)">
      <MapContainer
        center={center}
        zoom={9}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
        preferCanvas
      >
        <TileLayer
          key={resolved}
          attribution={tiles.attribution}
          url={tiles.url}
          subdomains={["a", "b", "c", "d"]}
        />
        <ClusterLayer companies={companies} />
      </MapContainer>

      <MapLegend />
    </div>
  );
}

function MapLegend() {
  return (
    <div
      className="pointer-events-none absolute bottom-3 right-3 flex flex-col gap-1 rounded-[10px] border border-(--color-border) bg-(--color-card)/95 p-2 text-[11px] backdrop-blur"
      style={{ zIndex: 1000 }}
    >
      <LegendRow color="#14B8A6" label="Warm (Agreed / Job sent / Repeat)" />
      <LegendRow color="#F59E0B" label="Contacted / Interested" />
      <LegendRow color="#64748B" label="Cold" />
      <LegendRow color="#9CA3AF" label="Closed / Inactive" />
      <div className="flex items-center gap-1.5 pl-0.5 pt-1 border-t border-(--color-border) mt-1">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{
            background: "#14B8A6",
            boxShadow: "0 0 0 2.5px #ef4444",
          }}
        />
        <span>Red ring = DNC flagged</span>
      </div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 pl-0.5">
      <span
        className="inline-block h-3 w-3 rounded-full"
        style={{ background: color, boxShadow: "0 0 0 1.5px rgba(255,255,255,0.9)" }}
      />
      <span>{label}</span>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
