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
  const [error, setError] = useState<string | null>(null);

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
  const [itemId, setItemId] = useState<string | null>(null);
  const [secao, setSecao] = useState("");
  const [isPending, startTransition] = useTransition();
  const [pickerKey, setPickerKey] = useState(0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onError(null);
    if (!itemId) {
      onError("Selecione um item do cadastro.");
      return;
    }
    startTransition(async () => {
      const res = await addItemAoGrupoAction(grupoId, itemId, secao || null);
      if (res.error) onError(res.error);
      else {
        setItemId(null);
        setPickerKey((k) => k + 1);
        router.refresh();
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      className="sticky top-0 z-30 rounded-md border border-zinc-200 bg-white p-3 shadow-sm"
    >
      <h2 className="mb-2 text-sm font-semibold">Adicionar item ao grupo</h2>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-1 min-w-[300px] flex-col gap-1">
          <Label className="text-xs">Item do cadastro</Label>
          <ItemDropdown
            key={pickerKey}
            catalogo={catalogo}
            value={itemId}
            onChange={setItemId}
            autoFocus
          />
        </div>
        <div className="flex w-56 flex-col gap-1">
          <Label htmlFor="add-secao" className="text-xs">Seção (opcional)</Label>
          <Input
            id="add-secao"
            value={secao}
            onChange={(e) => setSecao(e.target.value)}
            placeholder="Ex: ITENS CAMARA REFRIGERADA"
          />
        </div>
        <Button type="submit" disabled={isPending || !itemId}>
          {isPending ? "..." : "Adicionar"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Busca por nome ou código Queóps. O item aparece pro estoquista exatamente como está no cadastro.
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
                <th className="w-24 px-2 py-1">Código</th>
                <th className="px-2 py-1">Item</th>
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
  const [isPending, startTransition] = useTransition();

  // Nome a mostrar: prioriza item do cadastro vinculado; senão usa o texto legacy
  const displayName = item.item_nome ?? item.texto;
  const displayCode = item.item_codigo;

  const persistLink = (newId: string | null) => {
    if (newId === item.item_id) return;
    onError(null);
    startTransition(async () => {
      // Se ligar a um item do cadastro, atualiza também o texto pro nome do catálogo
      let patch: { item_id: string | null; texto?: string } = { item_id: newId };
      if (newId) {
        const found = catalogo.find((c) => c.id === newId);
        if (found) patch.texto = found.nome;
      }
      const res = await updateItemDoGrupoAction(item.id, patch);
      if (res.error) onError(res.error);
      else router.refresh();
    });
  };

  const remover = () => {
    if (!confirm(`Remover "${displayName}" do grupo?`)) return;
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

  // Se item não está linkado ao catálogo, mostra modo "vincular"
  if (!item.item_id) {
    return (
      <tr className="border-b border-zinc-100 bg-amber-50/30 last:border-0">
        <td className="px-2 py-1.5 text-right text-xs text-zinc-400">{item.ordem}</td>
        <td className="px-2 py-1.5 text-xs text-amber-700">sem cadastro</td>
        <td className="px-2 py-1.5">
          <div className="mb-1 text-sm">{item.texto}</div>
          <ItemDropdown
            catalogo={catalogo}
            value={null}
            onChange={persistLink}
            placeholder="Vincular ao item do cadastro..."
          />
        </td>
        <td className="px-2 py-1.5">
          <AcoesItem mover={mover} remover={remover} isPending={isPending} />
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-zinc-100 last:border-0">
      <td className="px-2 py-1.5 text-right text-xs text-zinc-400">{item.ordem}</td>
      <td className="px-2 py-1.5 font-mono text-xs">
        {displayCode ?? <span className="text-amber-600">—</span>}
      </td>
      <td className="px-2 py-1.5">{displayName}</td>
      <td className="px-2 py-1.5">
        <AcoesItem mover={mover} remover={remover} isPending={isPending} />
      </td>
    </tr>
  );
}

function AcoesItem({
  mover,
  remover,
  isPending,
}: {
  mover: (d: "cima" | "baixo") => void;
  remover: () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex gap-2">
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
  );
}

function ItemDropdown({
  catalogo,
  value,
  onChange,
  autoFocus,
  placeholder,
}: {
  catalogo: CatalogItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  autoFocus?: boolean;
  placeholder?: string;
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
        .slice(0, 15)
    : catalogo.slice(0, 15);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? "Buscar nome ou código Queóps..."}
        className="flex h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-1"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg">
          {value && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setQuery("");
                setOpen(false);
                onChange(null);
              }}
              className="block w-full px-3 py-1.5 text-left text-xs italic text-zinc-500 hover:bg-zinc-50"
            >
              — desvincular —
            </button>
          )}
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
              className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{c.nome}</span>
                <span className="shrink-0 font-mono text-xs text-zinc-500">
                  {c.codigo ?? "—"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
