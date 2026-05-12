"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrencyBRL } from "@/lib/utils";

const COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];

function compactBRL(n: number): string {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(1)}k`;
  return `R$ ${n.toFixed(0)}`;
}

export function GastoSemanaChart({ data }: { data: { semana: string; total: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis dataKey="semana" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={compactBRL} tick={{ fontSize: 12 }} width={70} />
        <Tooltip formatter={(v) => formatCurrencyBRL(Number(v))} labelFormatter={(l) => `Semana: ${l}`} />
        <Line type="monotone" dataKey="total" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GastoBarChart({
  data,
  dataKey = "total",
}: {
  data: { label: string; total: number }[];
  dataKey?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(250, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 80, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis type="number" tickFormatter={compactBRL} tick={{ fontSize: 12 }} />
        <YAxis dataKey="label" type="category" tick={{ fontSize: 12 }} width={140} />
        <Tooltip formatter={(v) => formatCurrencyBRL(Number(v))} />
        <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PrecoEvolucaoChart({ data }: { data: { data: string; preco: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis dataKey="data" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(n) => `R$ ${n.toFixed(2)}`} tick={{ fontSize: 12 }} width={80} />
        <Tooltip formatter={(v) => formatCurrencyBRL(Number(v))} />
        <Line type="monotone" dataKey="preco" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
