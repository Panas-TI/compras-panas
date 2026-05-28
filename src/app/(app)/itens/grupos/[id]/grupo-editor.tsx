"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  renomearGrupoAction,
  addItemAoGrupoAction,
  updateItemDoGrupoAction,
  removerItemDoGrupoAction,
  moverItemAction,
} from "../actions";

export type GrupoItem = {
  id: string;
  ordem: number;
  secao: string | null;
  texto: string;
  item_id: string | null;
  item_nome: string | null;
  item_codigo: string | null;
};

export type CatalogItem = {
  id: string;
  nome: string;
  codigo: string | null;
};

export function GrupoEditor({
  grupoId,
  nomeInicial,
  descricaoInicial,
  ativoInicial,
  itensIniciais,
  catalogo,
}: {
  grupoId: string;
  nomeInicial: string;
  descricaoInicial: string | null;
  ativoInicial: boolean;
  itensIniciais: GrupoItem[];
  catalogo: CatalogItem[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <CabecalhoGrupo
        grupoId={grupoId}
        nome={nomeInicial}
        descricao={descricaoInicial}
        ativo={ativoInicial}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}

      <AdicionarItem grupoId={grupoId} catalogo={catalogo} onError={setError} />

      <ListaItens itens={itensIniciais} catalogo={catalogo} onError={setError} />
    </div>
  );
}

function CabecalhoGrupo({
  grupoId,
  nome,
  descricao,
  ativo,
}: {
  grupoId: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}) {
  const router = useRouter();
  const [nomeDraft, setNomeDraft] = useState(nome);
  const [descDraft, setDescDraft] = useState(descricao ?? "");
  const [isPending, startTransition] = useTransition();

  const salvar = () => {
    startTransition(async () => {
      await renomearGrupoAction(grupoId, { nome: nomeDraft, descricao: descDraft });
      router.refresh();
    });
  };

  const toggleAtivo = () => {
    startTransition(async () => {
      await renomearGrupoAction(grupoId, { ativo: !ativo });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex flex-1 min-w-[240px] flex-col gap-1.5">
        <Label htmlFor="nome">Nome do grupo</Label>
        <Input
          id="nome"
          value={nomeDraft}
          onChange={(e) => setNomeDraft(e.target.value)}
          onBlur={salvar}
        />
      </div>
      <div className="flex flex-1 min-w-[260px] flex-col gap-1.5">
        <Label htmlFor="desc">Descrição</Label>
        <Input
          id="desc"
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={salvar}
        />
      </div>
      <Button variant="outline" onClick={toggleAtivo} disabled={isPending}>
        {ativo ? "Inativar grupo" : "Ativar grupo"}
      </Button>
    </div>
  );
}

function AdicionarItem({
  grupoId,
  catalogo,
  onError,
}: {
  grupoId: string;
  catalogo: CatalogItem[];
  onError: (s: string | null) => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [secao, setSecao] = useState("");
  const [itemId, setItemId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onError(null);
    if (!texto.trim()) return;
    startTransition(async () => {
      const res = await addItemAoGrupoAction(grupoId, texto, secao || null, itemId);
      if (res.error) onError(res.error);
      else {
        setTexto("");
        setItemId(null);
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={submit} className="rounded-md border border-zinc-200 bg-white p-3">
      <h2 className="mb-2 text-sm font-semibold">Adicionar item ao grupo</h2>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-1 min-w-[240px] flex-col gap-1">
          <Label htmlFor="add-texto" className="text-xs">Texto (como aparece pro estoquista)</Label>
          <Input
            id="add-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex: ACEM / AGULHA CONGELADA  peça +/- 20kg"
            required
          />
        </div>
        <div className="flex w-44 flex-col gap-1">
          <Label htmlFor="add-secao" className="text-xs">Seção (opcional)</Label>
          <Input
            id="add-secao"
            value={secao}
            onChange={(e) => setSecao(e.target.value)}
            placeholder="ITENS CAMARA REFRIGERADA"
          />
        </div>
        <div className="flex flex-1 min-w-[240px] flex-col gap-1">
          <Label htmlFor="add-cat" className="text-xs">Item do cadastro (opcional)</Label>
          <ItemDropdown catalogo={catalogo} value={itemId} onChange={setItemId} />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "..." : "Adicionar"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Vincule ao item do cadastro pra puxar código Queóps automaticamente quando o estoquista enviar pra solicitação.
      </p>
    </form>
  );
}

function ListaItens({
  itens,
  catalogo,
  onError,
}: {
  itens: GrupoItem[];
  catalogo: CatalogItem[];
  onError: (s: string | null) => void;
}) {
  if (itens.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 bg-white px-3 py-10 text-center text-sm text-zinc-500">
        Nenhum item no grupo. Use o formulário acima.
      </div>
    );
  }

  // Agrupa por seção (mantendo ordem)
  const grupos: { secao: string | null; itens: GrupoItem[] }[] = [];
  for (const it of itens) {
    const last = grupos[grupos.length - 1];
    if (!last || last.secao !== it.secao) {
      grupos.push({ secao: it.secao, itens: [it] });
    } else {
      last.itens.push(it);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {grupos.map((g, gi) => (
        <div key={gi} className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          {g.secao && (
            <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800">
              {g.secao}
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 text-left text-xs text-zinc-500">
              <tr>
                <th className="w-12 px-2 py-1 text-right">#</th>
                <th className="px-2 py-1">Texto</th>
                <th className="px-2 py-1">Item do cadastro</th>
                <th className="w-44 px-2 py-1">Ações</th>
              </tr>
            </thead>
            <tbody>
              {g.itens.map((it) => (
                <ItemRow key={it.id} item={it} catalogo={catalogo} onError={onError} />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ItemRow({
  item,
  catalogo,
  onError,
}: {
  item: GrupoItem;
  catalogo: CatalogItem[];
  onError: (s: string | null) => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState(item.texto);
  const [secao, setSecao] = useState(item.secao ?? "");
  const [itemId, setItemId] = useState<string | null>(item.item_id);
  const [isPending, startTransition] = useTransition();

  const persistText = () => {
    if (texto === item.texto) return;
    startTransition(async () => {
      const res = await updateItemDoGrupoAction(item.id, { texto });
      if (res.error) onError(res.error);
      else router.refresh();
    });
  };

  const persistLink = (newId: string | null) => {
    setItemId(newId);
    startTransition(async () => {
      const res = await updateItemDoGrupoAction(item.id, { item_id: newId });
      if (res.error) onError(res.error);
      else router.refresh();
    });
  };

  const remover = () => {
    if (!confirm(`Remover "${item.texto}" do grupo?`)) return;
    startTransition(async () => {
      const res = await removerItemDoGrupoAction(item.id);
      if (res.error) onError(res.error);
      else router.refresh();
    });
  };

  const mover = (direcao: "cima" | "baixo") => {
    startTransition(async () => {
      const res = await moverItemAction(item.id, direcao);
      if (res.error) onError(res.error);
      else router.refresh();
    });
  };

  return (
    <tr className="border-b border-zinc-100 last:border-0">
      <td className="px-2 py-1.5 text-right text-xs text-zinc-400">{item.ordem}</td>
      <td className="px-2 py-1.5">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={persistText}
          className="h-8 w-full"
        />
      </td>
      <td className="px-2 py-1.5">
        <ItemDropdown catalogo={catalogo} value={itemId} onChange={persistLink} />
        {item.item_nome && (
          <div className="mt-0.5 text-xs text-zinc-500">
            {item.item_codigo ? (
              <span className="font-mono">{item.item_codigo}</span>
            ) : (
              <span className="text-amber-600">sem código</span>
            )}{" "}
            · {item.item_nome}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex gap-1">
          <button
            onClick={() => mover("cima")}
            disabled={isPending}
            className="text-xs text-zinc-600 hover:underline disabled:opacity-50"
          >
            ↑
          </button>
          <button
            onClick={() => mover("baixo")}
            disabled={isPending}
            className="text-xs text-zinc-600 hover:underline disabled:opacity-50"
          >
            ↓
          </button>
          <button
            onClick={remover}
            disabled={isPending}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            Remover
          </button>
        </div>
      </td>
    </tr>
  );
}

function ItemDropdown({
  catalogo,
  value,
  onChange,
}: {
  catalogo: CatalogItem[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [query, setQuery] = useState(() => {
    if (!value) return "";
    return catalogo.find((c) => c.id === value)?.nome ?? "";
  });
  const [open, setOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? catalogo
        .filter(
          (c) =>
            c.nome.toLowerCase().includes(q) ||
            (c.codigo ? c.codigo.toLowerCase().includes(q) : false)
        )
        .slice(0, 12)
    : catalogo.slice(0, 12);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar item..."
        className="flex h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-1"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setQuery("");
              setOpen(false);
              onChange(null);
            }}
            className="block w-full px-2 py-1.5 text-left text-xs italic text-zinc-500 hover:bg-zinc-50"
          >
            — desvincular —
          </button>
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setQuery(c.nome);
                setOpen(false);
                onChange(c.id);
              }}
              className="block w-full px-2 py-1.5 text-left text-xs hover:bg-zinc-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{c.nome}</span>
                <span className="font-mono text-[10px] text-zinc-500">{c.codigo ?? "—"}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
