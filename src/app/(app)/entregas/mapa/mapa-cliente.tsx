"use client";

import dynamic from "next/dynamic";

// react-leaflet usa window — precisa ser carregado só no client.
const MapaInterno = dynamic(() => import("./mapa-interno").then((m) => m.MapaInterno), {
  ssr: false,
  loading: () => (
    <div className="flex h-[480px] items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
      Carregando mapa…
    </div>
  ),
});

export type EntregaPin = {
  id: string;
  codigo: string;
  cliente: string | null;
  bairro: string | null;
  valor: number | null;
  dataEntrega: string; // YYYY-MM-DD planejada
  entregueAt: string | null;
  lat: number;
  lng: number;
  precisaoM: number | null;
  motoristaId: string | null;
  motoristaNome: string | null;
};

export function MapaCliente({ pins }: { pins: EntregaPin[] }) {
  return <MapaInterno pins={pins} />;
}
