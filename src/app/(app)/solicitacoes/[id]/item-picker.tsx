"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export type PickableItem = {
  id: string;
  nome: string;
  codigo_queops: string | null;
};

export function ItemPicker({
  items,
  onPick,
  disabledIds,
  placeholder = "Buscar item por nome ou código...",
}: {
  items: PickableItem[];
  onPick: (item: PickableItem) => void;
  disabledIds?: Set<string>;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items
        .filter(
          (i) =>
            i.nome.toLowerCase().includes(q) ||
            (i.codigo_queops ? i.codigo_queops.toLowerCase().includes(q) : false)
        )
        .slice(0, 12)
    : items.slice(0, 12);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pick = (item: PickableItem) => {
    onPick(item);
    setQuery("");
    setOpen(false);
    setHighlight(0);
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[highlight]) pick(filtered[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg">
          {filtered.map((item, idx) => {
            const disabled = disabledIds?.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (!disabled) pick(item);
                }}
                onMouseEnter={() => setHighlight(idx)}
                className={cn(
                  "block w-full px-3 py-2 text-left text-sm transition-colors",
                  idx === highlight && !disabled ? "bg-zinc-100" : "hover:bg-zinc-50",
                  disabled && "cursor-not-allowed opacity-50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{item.nome}</span>
                  <span className="font-mono text-xs text-zinc-500">
                    {item.codigo_queops ?? "—"}
                    {disabled && " · já adicionado"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
