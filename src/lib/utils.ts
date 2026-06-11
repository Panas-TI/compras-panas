import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrencyBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDateBR(value: string | Date | null | undefined): string {
  if (!value) return "—";
  // String de data pura "YYYY-MM-DD" (coluna DATE): formata direto, sem
  // conversão de fuso (evita o bug de cair pro dia anterior em UTC-3).
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, mo, d] = value.split("-");
    return `${d}/${mo}/${y}`;
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/**
 * Calcula atraso em dias entre a data planejada (YYYY-MM-DD) e a data real
 * de entrega (timestamp ISO). Considera timezone America/Sao_Paulo.
 *
 * - Retorna 0 se entregou no dia certo.
 * - Retorna N positivo se entregou N dias depois.
 * - Retorna N negativo se entregou N dias antes (raro mas possível).
 * - Retorna null se entregueAt for null/inválido.
 */
export function calcularAtrasoDias(
  dataEntrega: string | null,
  entregueAt: string | null
): number | null {
  if (!dataEntrega || !entregueAt) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEntrega)) return null;

  const realDt = new Date(entregueAt);
  if (Number.isNaN(realDt.getTime())) return null;

  // Data real em São Paulo (YYYY-MM-DD)
  // sv-SE produz formato ISO compatível
  const realLocal = realDt.toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  });

  // Diff em dias (ambos como datas locais sem hora)
  const realMidnight = new Date(realLocal + "T00:00:00").getTime();
  const planejadaMidnight = new Date(dataEntrega + "T00:00:00").getTime();
  return Math.round((realMidnight - planejadaMidnight) / 86_400_000);
}

export function parseNumberBR(value: string): number | null {
  // "1.234,56" → 1234.56
  if (!value || !value.trim()) return null;
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
