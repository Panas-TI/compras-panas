"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  renomearGrupoAction,
  addItemAoGrupoAction,
  updateItemDoGrupoAction,
  removerItemDoGrupoAction,
  reordenarItensAction,
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

      <ListaItens grupoId={grupoId} itens={itensIniciais} catalogo={catalogo} onError={setError} />
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
  grupoId,
  itens,
  catalogo,
  onError,
}: {
  grupoId: string;
  itens: GrupoItem[];
  catalogo: CatalogItem[];
  onError: (s: string | null) => void;
}) {
  const router = useRouter();
  // Lista local pra drag & drop otimista; re-sincroniza quando o server atualiza
  const [lista, setLista] = useState(itens);
  useEffect(() => setLista(itens), [itens]);

  // Estado do drag: qual item está "armado" (mouse na alça), qual está sendo
  // arrastado e sobre qual linha o cursor está (antes/depois)
  const [armedId, setArmedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; pos: "antes" | "depois" } | null>(null);
  const [, startTransition] = useTransition();

  const soltar = (targetId: string) => {
    if (!dragId || !over || dragId === targetId) return;
    const dragged = lista.find((l) => l.id === dragId);
    const target = lista.find((l) => l.id === targetId);
    if (!dragged || !target) return;

    // Remove o arrastado, insere na posição do alvo e herda a seção do alvo
    const sem = lista.filter((l) => l.id !== dragId);
    const idx = sem.findIndex((l) => l.id === targetId);
    const insertAt = over.pos === "antes" ? idx : idx + 1;
    const movido = { ...dragged, secao: target.secao };
    const novo = [...sem.slice(0, insertAt), movido, ...sem.slice(insertAt)].map((l, i) => ({
      ...l,
      ordem: i + 1,
    }));

    const anterior = lista;
    setLista(novo);
    setDragId(null);
    setOver(null);
    setArmedId(null);

    // Persiste só o que mudou
    const mudancas = novo
      .filter((n) => {
        const o = anterior.find((x) => x.id === n.id);
        return !o || o.ordem !== n.ordem || o.secao !== n.secao;
      })
      .map((n) => ({ id: n.id, ordem: n.ordem, secao: n.secao }));
    onError(null);
    startTransition(async () => {
      const res = await reordenarItensAction(grupoId, mudancas);
      if (res.error) {
        setLista(anterior); // desfaz visual se falhou
        onError(res.error);
      } else {
        router.refresh();
      }
    });
  };

  if (lista.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 bg-white px-3 py-10 text-center text-sm text-zinc-500">
        Nenhum item no grupo. Use o formulário acima.
      </div>
    );
  }

  // Agrupa por seção (mantendo ordem)
  const grupos: { secao: string | null; itens: GrupoItem[] }[] = [];
  for (const it of lista) {
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
            <SecaoHeader
              grupoId={grupoId}
              secao={g.secao}
              catalogo={catalogo}
              onError={onError}
            />
          )}
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 text-left text-xs text-zinc-500">
              <tr>
                <th className="w-12 px-2 py-1 text-right">#</th>
                <th className="w-24 px-2 py-1">Código</th>
                <th className="px-2 py-1">Item</th>
                <th className="w-44 px-2 py-1 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {g.itens.map((it) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  catalogo={catalogo}
                  onError={onError}
                  dnd={{
                    armed: armedId === it.id,
                    dragging: dragId === it.id,
                    over: over?.id === it.id ? over.pos : null,
                    onArm: () => setArmedId(it.id),
                    onDisarm: () => setArmedId(null),
                    onDragStart: () => setDragId(it.id),
                    onDragEnd: () => {
                      setDragId(null);
                      setOver(null);
                      setArmedId(null);
                    },
                    onDragOver: (e: React.DragEvent) => {
                      if (!dragId || dragId === it.id) return;
                      e.preventDefault();
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const pos = e.clientY < r.top + r.height / 2 ? "antes" : "depois";
                      setOver((cur) =>
                        cur?.id === it.id && cur.pos === pos ? cur : { id: it.id, pos }
                      );
                    },
                    onDrop: (e: React.DragEvent) => {
                      e.preventDefault();
                      soltar(it.id);
                    },
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

type DndProps = {
  armed: boolean;
  dragging: boolean;
  over: "antes" | "depois" | null;
  onArm: () => void;
  onDisarm: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
};

function SecaoHeader({
  grupoId,
  secao,
  catalogo,
  onError,
}: {
  grupoId: string;
  secao: string;
  catalogo: CatalogItem[];
  onError: (s: string | null) => void;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [itemId, setItemId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pickerKey, setPickerKey] = useState(0);

  const adicionar = () => {
    if (!itemId) return;
    onError(null);
    startTransition(async () => {
      const res = await addItemAoGrupoAction(grupoId, itemId, secao);
      if (res.error) {
        onError(res.error);
        return;
      }
      setItemId(null);
      setPickerKey((k) => k + 1);
      router.refresh();
    });
  };

  return (
    <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-800">{secao}</span>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-zinc-100"
        >
          {aberto ? "Fechar" : "+ Adicionar item nesta seção"}
        </button>
      </div>
      {aberto && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-zinc-200 bg-white p-2">
          <div className="flex flex-1 min-w-[260px] flex-col gap-1">
            <Label className="text-xs">Item do cadastro</Label>
            <ItemDropdown key={pickerKey} catalogo={catalogo} value={itemId} onChange={setItemId} autoFocus />
          </div>
          <Button onClick={adicionar} disabled={isPending || !itemId} size="sm">
            {isPending ? "..." : "Adicionar"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAberto(false);
              setItemId(null);
            }}
          >
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  catalogo,
  onError,
  dnd,
}: {
  item: GrupoItem;
  catalogo: CatalogItem[];
  onError: (s: string | null) => void;
  dnd: DndProps;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Nome a mostrar: prioriza item do cadastro vinculado; senão usa o texto legacy
  const displayName = item.item_nome ?? item.texto;
  const displayCode = item.item_codigo;

  const persistLink = (newId: string | null) => {
    if (newId === item.item_id || !newId) return;
    onError(null);
    startTransition(async () => {
      // Ao vincular, atualiza também o texto pro nome do catálogo
      const patch: { item_id: string; texto?: string } = { item_id: newId };
      const found = catalogo.find((c) => c.id === newId);
      if (found) patch.texto = found.nome;
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

  // Feedback visual: linha arrastada fica translúcida; alvo ganha borda azul
  const rowClass = [
    "border-b border-zinc-100 last:border-0",
    item.item_id ? "" : "bg-amber-50/30",
    dnd.dragging ? "opacity-40" : "",
    dnd.over === "antes" ? "border-t-2 border-t-blue-500" : "",
    dnd.over === "depois" ? "border-b-2 border-b-blue-500" : "",
  ].join(" ");

  return (
    <tr
      className={rowClass}
      draggable={dnd.armed}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        dnd.onDragStart();
      }}
      onDragEnd={dnd.onDragEnd}
      onDragOver={dnd.onDragOver}
      onDrop={dnd.onDrop}
    >
      <td className="px-2 py-1.5 text-right text-xs text-zinc-400">{item.ordem}</td>
      {item.item_id ? (
        <>
          <td className="px-2 py-1.5 font-mono text-xs">
            {displayCode ?? <span className="text-amber-600">—</span>}
          </td>
          <td className="px-2 py-1.5">{displayName}</td>
        </>
      ) : (
        <>
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
        </>
      )}
      <td className="px-2 py-1.5">
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={remover}
            disabled={isPending}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            Remover
          </button>
          {/* Alça de arrastar: segura aqui e arrasta pra cima/baixo ou pra outra seção */}
          <span
            onMouseDown={dnd.onArm}
            onMouseUp={dnd.onDisarm}
            title="Segure e arraste pra mover (funciona entre seções)"
            className="cursor-grab select-none rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 active:cursor-grabbing"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
        </div>
      </td>
    </tr>
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
