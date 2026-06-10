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

  // Restrição de rotas para estoquista — só pode acessar /, /recebimento, /contagem
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, ativo")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "estoquista" && profile.ativo) {
      const estoquistaAllowed =
        path === "/" ||
        path === "/estoque" ||
        path === "/recebimento" ||
        path.startsWith("/recebimento/") ||
        path === "/contagem" ||
        path.startsWith("/contagem/");
      if (!estoquistaAllowed) {
        const url = request.nextUrl.clone();
        url.pathname = "/recebimento";
        return NextResponse.redirect(url);
      }
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
