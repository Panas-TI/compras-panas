import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyBRL } from "@/lib/utils";
import { AtribuirMotorista, ExcluirEntrega } from "./lista-client";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pendente: { label: "PENDENTE", cls: "bg-amber-100 text-amber-900 border-amber-300" },
  em_rota: { label: "EM ROTA", cls: "bg-blue-100 text-blue-900 border-blue-300" },
  entregue: { label: "ENTREGUE", cls: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  nao_entregue: { label: "NÃO ENTREGUE", cls: "bg-red-100 text-red-900 border-red-300" },
  cancelada: { label: "CANCELADA", cls: "bg-zinc-100 text-zinc-600 border-zinc-300" },
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function EntregasDiaPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const data = typeof sp.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : todayISO();
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const statusFilter = typeof sp.status === "string" ? sp.status : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: meProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAprovador = meProfile?.role === "aprovador";
  const isMotorista = meProfile?.role === "motorista";
  if (!isAprovador && !isMotorista) redirect("/");

  let query = supabase
    .from("entregas")
    .select(
      `
      id, codigo_queops, data_entrega, hora_entrega, area_entrega,
      cliente_nome, cliente_telefone, contato_nome,
      endereco_rua, endereco_numero, endereco_complemento, bairro, cidade, uf,
      observacoes, valor_total, status, motorista_id,
      checkin_at, entregue_at, foto_comprovante_url,
      motorista:profiles!entregas_motorista_id_fkey(nome)
    `
    )
    .eq("data_entrega", data)
    .order("hora_entrega", { ascending: true, nullsFirst: false })
    .order("bairro");

  if (statusFilter && statusFilter in STATUS_LABEL) {
    query = query.eq("status", statusFilter);
  }
  if (q) {
    const safe = q.replace(/[(),]/g, " ").trim();
    if (safe) {
      query = query.or(
        `codigo_queops.ilike.%${safe}%,cliente_nome.ilike.%${safe}%,bairro.ilike.%${safe}%`
      );
    }
  }

  const [{ data: entregas, error }, { data: motoristas }] = await Promise.all([
    query,
    isAprovador
      ? supabase
          .from("profiles")
          .select("id, nome")
          .eq("role", "motorista")
          .eq("ativo", true)
          .order("nome")
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);

  // Gera URLs assinadas pras fotos de canhoto (bucket privado)
  const fotosUrls = new Map<string, string>();
  const comComprovante = (entregas ?? [])
    .map((e) => e.foto_comprovante_url)
    .filter((v): v is string => !!v);
  if (comComprovante.length > 0) {
    const { data: signed } = await supabase.storage
      .from("comprovantes")
      .createSignedUrls(comComprovante, 3600);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) fotosUrls.set(s.path, s.signedUrl);
    }
  }

  const totalValor = (entregas ?? []).reduce((acc, e) => acc + Number(e.valor_total ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Entregas do dia</h1>
          <p className="text-sm text-zinc-600">
            {entregas?.length ?? 0} entregas · total {formatCurrencyBRL(totalValor)}
          </p>
        </div>
        {isAprovador && (
          <Link href="/entregas/novo">
            <Button>+ Nova entrega (OCR)</Button>
          </Link>
        )}
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="data">
            Data
          </label>
          <Input id="data" name="data" type="date" defaultValue={data} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="status">
            Status
          </label>
          <Select id="status" name="status" defaultValue={statusFilter}>
            <option value="">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="em_rota">Em rota</option>
            <option value="entregue">Entregue</option>
            <option value="nao_entregue">Não entregue</option>
            <option value="cancelada">Cancelada</option>
          </Select>
        </div>
        <div className="flex flex-1 min-w-[200px] flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="q">
            Buscar
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="código, cliente ou bairro" />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      {error && <p className="text-sm text-red-600">Erro: {error.message}</p>}

      {!entregas?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            Nenhuma entrega para essa data.
            {isAprovador && (
              <>
                {" "}
                <Link href="/entregas/novo" className="text-zinc-900 underline-offset-4 hover:underline">
                  Cadastrar pela foto do pedido →
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {entregas.map((e) => {
            const st = STATUS_LABEL[e.status] ?? { label: e.status, cls: "bg-zinc-100 text-zinc-700 border-zinc-300" };
            const endFull = [
              e.endereco_rua,
              e.endereco_numero,
              e.endereco_complemento,
              e.bairro,
              e.cidade && `${e.cidade}${e.uf ? "/" + e.uf : ""}`,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <Card key={e.id} className="overflow-hidden">
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-xs font-bold tracking-wide ${st.cls}`}
                    >
                      {st.label}
                    </span>
                    <span className="font-mono text-xs text-zinc-500">{e.codigo_queops}</span>
                  </div>

                  <div>
                    <div className="font-semibold">
                      {e.cliente_nome ?? <span className="text-zinc-400">— sem cliente —</span>}
                    </div>
                    {e.contato_nome && (
                      <div className="text-xs text-zinc-500">Contato: {e.contato_nome}</div>
                    )}
                  </div>

                  {endFull && <div className="text-sm text-zinc-700">{endFull}</div>}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    {e.hora_entrega && (
                      <span className="tabular-nums text-zinc-700">⏰ {e.hora_entrega.slice(0, 5)}</span>
                    )}
                    <span className="font-semibold tabular-nums">
                      {formatCurrencyBRL(Number(e.valor_total ?? 0))}
                    </span>
                    {e.cliente_telefone && (
                      <a
                        href={`tel:${e.cliente_telefone.replace(/\D/g, "")}`}
                        className="text-xs text-zinc-600 underline-offset-4 hover:underline"
                      >
                        📞 {e.cliente_telefone}
                      </a>
                    )}
                  </div>

                  {e.observacoes && (
                    <div className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                      📝 {e.observacoes}
                    </div>
                  )}

                  {e.foto_comprovante_url && fotosUrls.get(e.foto_comprovante_url) && (
                    <a
                      href={fotosUrls.get(e.foto_comprovante_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-700 underline-offset-4 hover:underline"
                    >
                      📎 Ver foto do canhoto →
                    </a>
                  )}

                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2">
                    {isAprovador ? (
                      <AtribuirMotorista
                        entregaId={e.id}
                        motoristaId={e.motorista_id}
                        motoristas={motoristas ?? []}
                      />
                    ) : (
                      <span className="text-xs text-zinc-500">
                        {e.motorista?.nome ? `Motorista: ${e.motorista.nome}` : "Sem motorista"}
                      </span>
                    )}
                    {isAprovador && <ExcluirEntrega entregaId={e.id} codigo={e.codigo_queops} />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
