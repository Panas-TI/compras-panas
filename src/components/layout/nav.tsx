"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/role-label";
import { logoutAction } from "@/app/login/actions";

type NavItem = { href: string; label: string; subItems?: NavItem[] };
type Role = "comprador" | "aprovador" | "estoquista" | "motorista";

// Sub-rotas do MRP (dropdown ao passar o mouse no item "MRP")
const MRP_SUB: NavItem[] = [
  { href: "/mrp", label: "Início" },
  { href: "/mrp/nova-projecao", label: "Nova projeção" },
  { href: "/mrp/projecoes", label: "Histórico" },
  { href: "/mrp/produtos", label: "Produtos" },
  { href: "/mrp/materias-primas", label: "Matérias-primas" },
  { href: "/mrp/estoque/contar", label: "Estoque atual" },
  { href: "/mrp/relatorios", label: "Relatórios MRP" },
];

// Itens do módulo Estoque (MRP é um sub-grupo)
const ESTOQUE_ITEMS: NavItem[] = [
  { href: "/estoque", label: "Início" },
  { href: "/solicitacoes", label: "Solicitações" },
  { href: "/recebimento", label: "Recebimento" },
  { href: "/contagem", label: "Contagem" },
  { href: "/itens", label: "Itens" },
  { href: "/mrp", label: "MRP", subItems: MRP_SUB },
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
const MRP_BLOQUEADOS_PRO = new Set<Role>(["estoquista"]);

function detectModulo(path: string): "hub" | "estoque" | "entregas" | "motorista" {
  if (path === "/") return "hub";
  if (path === "/motorista" || path.startsWith("/motorista/")) return "motorista";
  if (path === "/entregas" || path.startsWith("/entregas/")) return "entregas";
  // /mrp/* agora faz parte do módulo Estoque
  return "estoque";
}

function ItemComDropdown({
  item,
  path,
  role,
}: {
  item: NavItem;
  path: string;
  role: Role;
}) {
  const [aberto, setAberto] = useState(false);
  // Item ativo se a rota atual está dentro dele
  const ativo = path === item.href || path.startsWith(item.href + "/");

  const subItensVisiveis = (item.subItems ?? []).filter(() => {
    // Estoquista não vê MRP — mas vai filtrar no nível do item pai também
    if (MRP_BLOQUEADOS_PRO.has(role)) return false;
    return true;
  });

  return (
    <div
      className="relative"
      onMouseEnter={() => setAberto(true)}
      onMouseLeave={() => setAberto(false)}
    >
      <Link
        href={item.href}
        onClick={() => setAberto(false)}
        onFocus={() => setAberto(true)}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors inline-flex items-center gap-1",
          ativo ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50"
        )}
      >
        {item.label}
        <span className="text-[10px] text-zinc-500">▾</span>
      </Link>
      {aberto && subItensVisiveis.length > 0 && (
        <div className="absolute left-0 top-full z-50 w-56 pt-1">
          <div className="rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
            {subItensVisiveis.map((sub) => {
              const subAtivo = path === sub.href || path.startsWith(sub.href + "/");
              return (
                <Link
                  key={sub.href}
                  href={sub.href}
                  onClick={() => setAberto(false)}
                  className={cn(
                    "block px-3 py-2 text-sm transition-colors",
                    subAtivo
                      ? "bg-zinc-100 font-medium text-zinc-900"
                      : "text-zinc-700 hover:bg-zinc-50"
                  )}
                >
                  {sub.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
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
              {nome} ({roleLabel(role)})
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

  // Painel do motorista — nav própria mínima
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

  let visible: NavItem[] =
    role === "estoquista"
      ? allItems.filter((i) => ESTOQUISTA_ALLOWED.has(i.href))
      : role === "aprovador"
        ? allItems
        : allItems.filter((i) => !APROVADOR_ONLY.has(i.href));

  // Estoquista nunca vê MRP
  if (role === "estoquista") {
    visible = visible.filter((i) => i.href !== "/mrp");
  }

  const moduloLabel = modulo === "entregas" ? "🚚 Entregas" : "📦 Estoque";

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="text-sm font-semibold" title="Voltar ao hub">
          {moduloLabel}
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {visible.map((item) => {
            if (item.subItems && item.subItems.length > 0) {
              return (
                <ItemComDropdown key={item.href} item={item} path={path} role={role} />
              );
            }
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
            {nome} ({roleLabel(role)})
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
