"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  criarProdutoAction,
  salvarProdutoAction,
  alternarAtivoAction,
  TIPOS,
  UNIDADES,
  type FormState,
} from "./actions";

export type ProdutoLinha = {
  id: string;
  nome: string;
  tipo: string;
  categoria: string;
  unidade_producao: string;
  estoque_seguranca: number | null;
  ativo: boolean;
};

const ROTULO_TIPO: Record<string, string> = {
  final: "Produto acabado",
  intermediario: "Recheio ou massa",
};

/** Unidade que veio numérica da importação não é unidade — é lixo a corrigir. */
function unidadeSuspeita(u: string) {
  return /\d/.test(u);
}

export function TabelaProdutos({
  linhas,
  categorias,
  podeEscrever,
}: {
  linhas: ProdutoLinha[];
  categorias: string[];
  podeEscrever: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [estado, criar, criando] = useActionState<FormState, FormData>(criarProdutoAction, null);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(
      (l) =>
        (mostrarInativos || l.ativo) &&
        (tipoFiltro === "todos" || l.tipo === tipoFiltro) &&
        (!q || l.nome.toLowerCase().includes(q) || l.categoria.toLowerCase().includes(q))
    );
  }, [linhas, busca, tipoFiltro, mostrarInativos]);

  const suspeitas = linhas.filter((l) => l.ativo && unidadeSuspeita(l.unidade_producao));

  return (
    <div className="flex flex-col gap-3">
      {suspeitas.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>{suspeitas.length}</strong>{" "}
          {suspeitas.length === 1 ? "produto está" : "produtos estão"} com número no lugar da
          unidade ({suspeitas.map((s) => s.unidade_producao).join(", ")}) — sobra da importação.
          Abra e escolha a unidade certa: {suspeitas.map((s) => s.nome).join(", ")}.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou categoria…"
          className="h-9 min-w-56 flex-1 rounded border border-zinc-300 px-3 text-sm"
        />
        <select
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value)}
          className="h-9 rounded border border-zinc-300 px-2 text-sm"
        >
          <option value="todos">Todos os tipos</option>
          {TIPOS.map((t) => (
            <option key={t.v} value={t.v}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={mostrarInativos}
            onChange={(e) => setMostrarInativos(e.target.checked)}
          />
          mostrar desativados
        </label>
        {podeEscrever && (
          <Button onClick={() => setNovo((v) => !v)} variant={novo ? "outline" : "default"}>
            {novo ? "Cancelar" : "Novo produto"}
          </Button>
        )}
      </div>

      {novo && podeEscrever && (
        <Card>
          <CardContent className="p-4">
            <form action={criar} className="flex flex-col gap-3">
              <Campos categorias={categorias} />
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={criando}>
                  {criando ? "Salvando…" : "Cadastrar"}
                </Button>
                {estado?.error && <span className="text-sm text-red-600">{estado.error}</span>}
                {estado?.ok && <span className="text-sm text-emerald-700">{estado.ok}</span>}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-zinc-600">
        {visiveis.length} {visiveis.length === 1 ? "produto" : "produtos"}.
        {" "}Produto acabado aparece na aba <strong>Produtos acabados</strong> do PCP; recheio e
        massa, na aba <strong>Recheios e massas</strong>.
      </p>

      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">Onde aparece</th>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Unidade</th>
              <th className="px-3 py-2 text-right">Estoque ideal</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) =>
              editando === l.id ? (
                <tr key={l.id} className="border-t border-zinc-100 bg-zinc-50">
                  <td colSpan={6} className="p-3">
                    <LinhaEdicao
                      linha={l}
                      categorias={categorias}
                      aoFechar={() => setEditando(null)}
                      aoSalvar={() => {
                        setEditando(null);
                        router.refresh();
                      }}
                    />
                  </td>
                </tr>
              ) : (
                <tr
                  key={l.id}
                  className={`border-t border-zinc-100 ${l.ativo ? "" : "opacity-50"}`}
                >
                  <td className="px-3 py-2 font-medium">
                    {l.nome}
                    {!l.ativo && <span className="ml-2 text-xs text-zinc-500">desativado</span>}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{ROTULO_TIPO[l.tipo] ?? l.tipo}</td>
                  <td className="px-3 py-2 text-zinc-600">{l.categoria}</td>
                  <td className="px-3 py-2">
                    {unidadeSuspeita(l.unidade_producao) ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
                        {l.unidade_producao} ⚠
                      </span>
                    ) : (
                      <span className="text-zinc-600">{l.unidade_producao}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {l.estoque_seguranca ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {podeEscrever && (
                      <button
                        onClick={() => setEditando(l.id)}
                        className="text-sm text-zinc-600 hover:underline"
                      >
                        editar
                      </button>
                    )}
                  </td>
                </tr>
              )
            )}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                  Nenhum produto com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Campos({ categorias, linha }: { categorias: string[]; linha?: ProdutoLinha }) {
  const [categoriaNova, setCategoriaNova] = useState(
    linha ? !categorias.includes(linha.categoria) : false
  );
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <label className="flex flex-col gap-1 text-xs text-zinc-600 lg:col-span-2">
        Nome
        <input
          name="nome"
          defaultValue={linha?.nome ?? ""}
          required
          placeholder="CASQUINHA"
          className="h-9 rounded border border-zinc-300 px-2 text-sm uppercase"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Onde aparece no PCP
        <select
          name="tipo"
          defaultValue={linha?.tipo ?? "final"}
          className="h-9 rounded border border-zinc-300 px-2 text-sm"
        >
          {TIPOS.map((t) => (
            <option key={t.v} value={t.v}>
              {t.label} — {t.ajuda}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Categoria
        {categoriaNova ? (
          <input
            name="categoria"
            defaultValue={linha?.categoria ?? ""}
            required
            placeholder="MASSA"
            className="h-9 rounded border border-zinc-300 px-2 text-sm uppercase"
          />
        ) : (
          <select
            name="categoria"
            defaultValue={linha?.categoria ?? categorias[0] ?? ""}
            className="h-9 rounded border border-zinc-300 px-2 text-sm"
          >
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => setCategoriaNova((v) => !v)}
          className="self-start text-[11px] text-zinc-500 hover:underline"
        >
          {categoriaNova ? "escolher uma existente" : "criar categoria nova"}
        </button>
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-600">
          Unidade
          <select
            name="unidade"
            defaultValue={
              linha && !/\d/.test(linha.unidade_producao) ? linha.unidade_producao : "UN"
            }
            className="h-9 rounded border border-zinc-300 px-2 text-sm"
          >
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-600">
          Estoque ideal
          <input
            name="estoque_seguranca"
            defaultValue={linha?.estoque_seguranca ?? ""}
            inputMode="decimal"
            placeholder="opcional"
            className="h-9 w-full rounded border border-zinc-300 px-2 text-sm"
          />
        </label>
      </div>
    </div>
  );
}

function LinhaEdicao({
  linha,
  categorias,
  aoFechar,
  aoSalvar,
}: {
  linha: ProdutoLinha;
  categorias: string[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await salvarProdutoAction(linha.id, fd);
          if (r.error) setErro(r.error);
          else aoSalvar();
        })
      }
      className="flex flex-col gap-3"
    >
      <Campos categorias={categorias} linha={linha} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
        <button type="button" onClick={aoFechar} className="text-sm text-zinc-600 hover:underline">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            startTransition(async () => {
              const r = await alternarAtivoAction(linha.id, !linha.ativo);
              if (r.error) setErro(r.error);
              else aoSalvar();
            })
          }
          className="text-sm text-zinc-600 hover:underline"
        >
          {linha.ativo ? "Desativar" : "Reativar"}
        </button>
        <span className="text-xs text-zinc-500">
          Desativar tira das listas novas e mantém o histórico de produção.
        </span>
        {erro && <span className="text-sm text-red-600">{erro}</span>}
      </div>
    </form>
  );
}
