import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session so RSCs get fresh tokens
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/login" ||
    path.startsWith("/auth") ||
    path === "/_next" ||
    path.startsWith("/_next/") ||
    path.startsWith("/favicon");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Restrição de rotas por papel
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, ativo")
      .eq("id", user.id)
      .maybeSingle();

    // Estoquista: recebimento, contagem e a folha do PCP que ele preenche.
    if (profile?.role === "estoquista" && profile.ativo) {
      const estoquistaAllowed =
        path === "/" ||
        path === "/estoque" ||
        path === "/recebimento" ||
        path.startsWith("/recebimento/") ||
        path === "/contagem" ||
        path.startsWith("/contagem/") ||
        path === "/pcp" ||
        path.startsWith("/pcp/");
      if (!estoquistaAllowed) {
        const url = request.nextUrl.clone();
        url.pathname = "/recebimento";
        return NextResponse.redirect(url);
      }
    }

    // Gestor de produção: o módulo Estoque inteiro, e só ele. Usuários,
    // Entregas e Vendas ficam de fora.
    if (profile?.role === "gestor_producao" && profile.ativo) {
      const ESTOQUE = [
        "/estoque",
        "/solicitacoes",
        "/recebimento",
        "/contagem",
        "/pcp",
        "/itens",
        "/mrp",
        "/cadastros",
        "/relatorios",
      ];
      const permitido =
        path === "/" || ESTOQUE.some((r) => path === r || path.startsWith(r + "/"));
      if (!permitido) {
        const url = request.nextUrl.clone();
        url.pathname = "/estoque";
        return NextResponse.redirect(url);
      }
    }

    // Atendimento (vendas): só o módulo Vendas e o hub
    if (profile?.role === "vendas" && profile.ativo) {
      const vendasAllowed =
        path === "/" || path === "/vendas" || path.startsWith("/vendas/");
      if (!vendasAllowed) {
        const url = request.nextUrl.clone();
        url.pathname = "/vendas";
        return NextResponse.redirect(url);
      }
    }
    // Financeiro: só a área de contagem (consulta de preço/fornecedor)
    if (profile?.role === "financeiro" && profile.ativo) {
      const finAllowed =
        path === "/" || path === "/contagem" || path.startsWith("/contagem/");
      if (!finAllowed) {
        const url = request.nextUrl.clone();
        url.pathname = "/contagem";
        return NextResponse.redirect(url);
      }
    }
    // MRP só pra aprovador/comprador
    if ((path === "/mrp" || path.startsWith("/mrp/")) &&
        profile?.role !== "aprovador" && profile?.role !== "comprador") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    // Motorista: só pode acessar /, /motorista, /entregas e /api/motorista/*
    if (profile?.role === "motorista" && profile.ativo) {
      const motoristaAllowed =
        path === "/" ||
        path === "/motorista" ||
        path.startsWith("/motorista/") ||
        path === "/entregas" ||
        path.startsWith("/entregas/") ||
        path.startsWith("/api/motorista/"); // rotas HTTP do painel dele
      if (!motoristaAllowed) {
        const url = request.nextUrl.clone();
        url.pathname = "/motorista";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}
