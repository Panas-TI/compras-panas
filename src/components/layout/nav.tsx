"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/login/actions";

type NavItem = { href: string; label: string };
type Role = "comprador" | "aprovador" | "estoquista" | "motorista";

// Itens do módulo Estoque
const ESTOQUE_ITEMS: NavItem[] = [
  { href: "/estoque", label: "Início" },
  { href: "/solicitacoes", label: "Solicitações" },
  { href: "/recebimento", label: "Recebimento" },
  { href: "/contagem", label: "Contagem" },
  { href: "/itens", label: "Itens" },
  { href: "/cadastros", label: "Cadastros" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/usuarios", label: "Usuários" },
];

// Itens do módulo Entregas
const ENTREGAS_ITEMS: NavItem[] = [
  { href: "/entregas", label: "Início" },
  { href: "/entregas/dia", label: "Dia" },
  { href: "/entregas/novo", label: "Novo" },
  { href: "/entregas/mapa", label: "Mapa" },
  { href: "/entregas/relatorios", label: "Relatórios" },
];

const APROVADOR_ONLY = new Set(["/usuarios"]);
const ESTOQUISTA_ALLOWED = new Set(["/estoque", "/recebimento", "/contagem"]);

function detectModulo(path: string): "hub" | "estoque" | "entregas" | "motorista" {
  if (path === "/") return "hub";
  if (path === "/motorista" || path.startsWith("/motorista/")) return "motorista";
  if (path === "/entregas" || path.startsWith("/entregas/")) return "entregas";
  return "estoque";
}

export function Nav({ role, nome }: { role: Role; nome: string }) {
  const path = usePathname();
  const modulo = detectModulo(path);

  // Hub minimalista — só logo + sair
  if (modulo === "hub") {
    return (
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <span className="text-sm font-semibold">Compras Panas</span>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-zinc-600 sm:inline">
              {nome} ({role})
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-50"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
    );
  }

  // Painel do motorista — nav própria mínima (apenas título + sair)
  if (modulo === "motorista") {
    return (
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <span className="text-sm font-semibold">🚚 Entregas</span>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-zinc-600 sm:inline">{nome}</span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-50"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
    );
  }

  // Estoque ou Entregas (admin/aprovador navegando)
  const allItems = modulo === "entregas" ? ENTREGAS_ITEMS : ESTOQUE_ITEMS;

  const visible =
    role === "estoquista"
      ? allItems.filter((i) => ESTOQUISTA_ALLOWED.has(i.href))
      : role === "aprovador"
        ? allItems
        : allItems.filter((i) => !APROVADOR_ONLY.has(i.href));

  const moduloLabel = modulo === "entregas" ? "🚚 Entregas" : "📦 Estoque";

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="text-sm font-semibold" title="Voltar ao hub">
          {moduloLabel}
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {visible.map((item) => {
            const active =
              item.href === "/estoque"
                ? path === "/estoque"
                : item.href === "/entregas"
                  ? path === "/entregas"
                  : path.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            title="Voltar ao hub para trocar de módulo"
          >
            ← Trocar módulo
          </Link>
          <span className="hidden text-zinc-600 sm:inline">
            {nome} ({role})
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-50"
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
