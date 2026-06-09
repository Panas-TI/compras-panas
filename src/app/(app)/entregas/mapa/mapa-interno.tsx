"use client";

import { useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { formatCurrencyBRL } from "@/lib/utils";
import type { EntregaPin } from "./mapa-cliente";

// Paleta pra cores por motorista — 10 cores distinguíveis
const PALETTE = [
  "#dc2626", // red
  "#2563eb", // blue
  "#16a34a", // green
  "#9333ea", // purple
  "#ea580c", // orange
  "#0891b2", // cyan
  "#db2777", // pink
  "#65a30d", // lime
  "#7c3aed", // violet
  "#0d9488", // teal
];

function hashToIdx(s: string, n: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
}

function makeIcon(color: string): L.DivIcon {
  // Pin SVG colorido (40x40 viewBox) com sombra leve
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="32" height="32">
    <defs>
      <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.5"/>
      </filter>
    </defs>
    <g filter="url(#s)">
      <path d="M20 2 C 11 2 5 8 5 16 C 5 28 20 38 20 38 C 20 38 35 28 35 16 C 35 8 29 2 20 2 Z"
            fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="20" cy="15" r="5" fill="white"/>
    </g>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 30],
    popupAnchor: [0, -28],
  });
}

function FitBounds({ pins }: { pins: EntregaPin[] }) {
  const map = useMap();
  useMemo(() => {
    if (pins.length === 0) return;
    if (pins.length === 1) {
      map.setView([pins[0].lat, pins[0].lng], 15);
      return;
    }
    const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [pins, map]);
  return null;
}

export function MapaInterno({ pins }: { pins: EntregaPin[] }) {
  // Mapeia motorista_id (ou "—" pra sem motorista) → cor
  const motoristas = useMemo(() => {
    const map = new Map<string, { nome: string; cor: string }>();
    for (const p of pins) {
      const key = p.motoristaId ?? "—";
      if (!map.has(key)) {
        const cor = PALETTE[hashToIdx(key, PALETTE.length)];
        map.set(key, { nome: p.motoristaNome ?? "Sem motorista", cor });
      }
    }
    return map;
  }, [pins]);

  // Centro inicial — Porto Alegre como fallback se sem pins, mas o componente só renderiza com pins
  const center: [number, number] = [pins[0].lat, pins[0].lng];

  return (
    <div className="flex flex-col gap-2">
      {/* Legenda */}
      {motoristas.size > 1 && (
        <div className="flex flex-wrap gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs">
          {Array.from(motoristas.entries()).map(([id, m]) => (
            <span key={id} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full border border-white"
                style={{ background: m.cor }}
              />
              {m.nome}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-zinc-200">
        <MapContainer
          center={center}
          zoom={13}
          style={{ height: 520, width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds pins={pins} />
          {pins.map((p) => {
            const cor = motoristas.get(p.motoristaId ?? "—")?.cor ?? "#52525b";
            return (
              <Marker key={p.id} position={[p.lat, p.lng]} icon={makeIcon(cor)}>
                <Popup>
                  <div className="flex flex-col gap-1 text-sm">
                    <div className="font-mono text-xs text-zinc-500">{p.codigo}</div>
                    {p.cliente && <div className="font-semibold">{p.cliente}</div>}
                    {p.bairro && <div className="text-zinc-600">{p.bairro}</div>}
                    {p.entregueAt && (
                      <div className="text-xs text-zinc-500">
                        Entregue às{" "}
                        {new Date(p.entregueAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                    {p.valor && Number(p.valor) > 0 && (
                      <div className="font-semibold tabular-nums">
                        {formatCurrencyBRL(Number(p.valor))}
                      </div>
                    )}
                    {p.motoristaNome && (
                      <div className="text-xs text-zinc-600">Motorista: {p.motoristaNome}</div>
                    )}
                    {p.precisaoM != null && (
                      <div className="text-xs text-zinc-400">Precisão GPS: ~{p.precisaoM}m</div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
