"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/login/actions";

type NavItem = { href: string; label: string };

const items: NavItem[] = [
  { href: "/", label: "Início" },
  { href: "/solicitacoes", label: "Solicitações" },
  { href: "/recebimento", label: "Recebimento" },
  { href: "/contagem", label: "Contagem" },
  { href: "/itens", label: "Itens" },
  { href: "/cadastros", label: "Cadastros" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/usuarios", label: "Usuários" },
];

const APROVADOR_ONLY = new Set(["/usuarios"]);
const ESTOQUISTA_ALLOWED = new Set(["/", "/recebimento", "/contagem"]);

export function Nav({ role, nome }: { role: "comprador" | "aprovador" | "estoquista"; nome: string }) {
  const path = usePathname();
  const visible =
    role === "estoquista"
      ? items.filter((i) => ESTOQUISTA_ALLOWED.has(i.href))
      : role === "aprovador"
        ? items
        : items.filter((i) => !APROVADOR_ONLY.has(i.href));

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="text-sm font-semibold">
          Compras Panas
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {visible.map((item) => {
            const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
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
