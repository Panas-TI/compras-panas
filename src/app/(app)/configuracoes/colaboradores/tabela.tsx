"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDateBR } from "@/lib/utils";
import {
  salvarColaboradorAction,
  alternarAtivoColaboradorAction,
  type EstadoColaborador,
} from "./actions";

export type Colaborador = {
  id: string;
  nome: string;
  cargo: string | null;
  setor: string | null;
  telefone: string | null;
  email: string | null;
  data_admissao: string | null;
  data_desligamento: string | null;
  observacoes: string | null;
  ativo: boolean;
};

/** Sugestões, não lista fechada: setor novo aparece sem precisar mexer no código. */
const SETORES = ["Produção", "Cozinha", "Estoque", "Entregas", "Vendas", "Administrativo", "Loja"];

export function TabelaColaboradores({ colaboradores }: { colaboradores: Colaborador[] }) {
  const [estado, formAction, salvando] = useActionState<EstadoColaborador, FormData>(
    salvarColaboradorAction,
    null
  );
  const [editando, setEditando] = useState<Colaborador | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [busca, setBusca] = useState("");
  const [verInativos, setVerInativos] = useState(false);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return colaboradores.filter((c) => {
      if (!verInativos && !c.ativo) return false;
      if (!q) return true;
      return [c.nome, c.cargo, c.setor, c.email, c.telefone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [colaboradores, busca, verInativos]);

  const inativos = colaboradores.filter((c) => !c.ativo).length;
  const porSetor = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of colaboradores) if (c.ativo) m.set(c.setor ?? "sem setor", (m.get(c.setor ?? "sem setor") ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [colaboradores]);

  const abrirNovo = () => {
    setEditando(null);
    setMostrarForm(true);
  };
  const abrirEdicao = (c: Colaborador) => {
    setEditando(c);
    setMostrarForm(true);
  };

  return (
    <div className="flex flex-col gap-4">
      {estado?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {estado.error}
        </div>
      )}
      {estado?.ok && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {estado.ok}
        </div>
      )}

      {mostrarForm && (
        <form
          action={formAction}
          className="rounded-md border border-zinc-200 bg-white p-4"
          onSubmit={() => setTimeout(() => setMostrarForm(false), 100)}
        >
          <h2 className="mb-3 text-base font-semibold">
            {editando ? `Editar ${editando.nome}` : "Novo colaborador"}
          </h2>
          {editando && <input type="hidden" name="id" value={editando.id} />}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" name="nome" required maxLength={80} defaultValue={editando?.nome ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cargo">Cargo</Label>
              <Input id="cargo" name="cargo" maxLength={60} defaultValue={editando?.cargo ?? ""} placeholder="Ex: Auxiliar de produção" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="setor">Setor</Label>
              <Input id="setor" name="setor" list="setores" maxLength={40} defaultValue={editando?.setor ?? ""} />
              <datalist id="setores">
                {SETORES.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" name="telefone" maxLength={20} defaultValue={editando?.telefone ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" maxLength={120} defaultValue={editando?.email ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="data_admissao">Admissão</Label>
              <Input id="data_admissao" name="data_admissao" type="date" defaultValue={editando?.data_admissao ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="data_desligamento">Desligamento</Label>
              <Input id="data_desligamento" name="data_desligamento" type="date" defaultValue={editando?.data_desligamento ?? ""} />
              <span className="text-xs text-zinc-500">Preenchido, desmarque &ldquo;ativo&rdquo;.</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="observacoes">Observações</Label>
              <Input id="observacoes" name="observacoes" maxLength={300} defaultValue={editando?.observacoes ?? ""} />
            </div>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" name="ativo" defaultChecked={editando ? editando.ativo : true} />
            Colaborador ativo
          </label>

          <div className="mt-3 flex gap-2">
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMostrarForm(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, cargo, setor..."
          className="h-9 min-w-[240px] flex-1"
        />
        {inativos > 0 && (
          <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-zinc-600">
            <input type="checkbox" checked={verInativos} onChange={(e) => setVerInativos(e.target.checked)} />
            Mostrar desligados ({inativos})
          </label>
        )}
        {!mostrarForm && <Button onClick={abrirNovo}>+ Novo colaborador</Button>}
      </div>

      {porSetor.length > 0 && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
          {porSetor.map(([s, n]) => (
            <span key={s}>{s}: <strong className="text-zinc-700">{n}</strong></span>
          ))}
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Cargo</th>
              <th className="px-3 py-2">Setor</th>
              <th className="px-3 py-2">Contato</th>
              <th className="px-3 py-2">Admissão</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <Linha key={c.id} c={c} onEditar={() => abrirEdicao(c)} />
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-zinc-500">
                  {colaboradores.length === 0
                    ? "Nenhum colaborador cadastrado ainda."
                    : "Nenhum colaborador com esse filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Linha({ c, onEditar }: { c: Colaborador; onEditar: () => void }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const alternar = () => {
    iniciar(async () => {
      const r = await alternarAtivoColaboradorAction(c.id, !c.ativo);
      if (r.error) setErro(r.error);
    });
  };

  return (
    <tr className={`border-b border-zinc-50 last:border-0 ${c.ativo ? "" : "opacity-50"}`}>
      <td className="px-3 py-2 font-medium">
        {c.nome}
        {!c.ativo && (
          <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">
            desligado{c.data_desligamento ? ` em ${formatDateBR(c.data_desligamento)}` : ""}
          </span>
        )}
        {erro && <p className="text-xs text-red-600">{erro}</p>}
      </td>
      <td className="px-3 py-2 text-zinc-600">{c.cargo ?? "—"}</td>
      <td className="px-3 py-2 text-zinc-600">{c.setor ?? "—"}</td>
      <td className="px-3 py-2 text-zinc-600">
        {c.telefone ?? ""}
        {c.telefone && c.email && <br />}
        {c.email && <span className="text-xs">{c.email}</span>}
        {!c.telefone && !c.email && "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
        {c.data_admissao ? formatDateBR(c.data_admissao) : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-2">
          <button onClick={onEditar} className="text-xs text-zinc-700 hover:underline">
            Editar
          </button>
          <button
            onClick={alternar}
            disabled={pendente}
            className="text-xs text-red-700 hover:underline disabled:opacity-50"
          >
            {c.ativo ? "Desligar" : "Reativar"}
          </button>
        </div>
      </td>
    </tr>
  );
}
