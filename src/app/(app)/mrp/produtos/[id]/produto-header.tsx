"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { atualizarProdutoAction } from "../actions";

type Produto = {
  id: string;
  codigo_queops: string | null;
  nome: string;
  categoria: string;
  unidade_producao: string;
  rendimento_padrao: number;
  ativo: boolean;
};

const CATEGORIAS = [
  "EMPANADA TRADICIONAL",
  "EMPANADA ESPECIAL",
  "EMPANADA DOCE",
  "EMPANADA INTEGRAL",
  "EMPANADA",
  "OUTRO",
];

const UNIDADES = ["UN", "KG", "L", "PCT", "FARDO"];

export function ProdutoHeader({ produto }: { produto: Produto }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(produto.nome);
  const [categoria, setCategoria] = useState(produto.categoria);
  const [unidade, setUnidade] = useState(produto.unidade_producao);
  const [salvando, startSalvar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const salvar = () => {
    setErro(null);
    startSalvar(async () => {
      const res = await atualizarProdutoAction(produto.id, {
        nome,
        categoria,
        unidade_producao: unidade,
      });
      if (res.error) {
        setErro(res.error);
        return;
      }
      setEditando(false);
    });
  };

  const toggleAtivo = () => {
    startSalvar(async () => {
      await atualizarProdutoAction(produto.id, { ativo: !produto.ativo });
    });
  };

  if (editando) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-zinc-600">Nome</label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">Categoria</label>
              <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">Unidade de produção</label>
              <Select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <div className="flex gap-2">
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
            <Button variant="outline" onClick={() => setEditando(false)} disabled={salvando}>
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 className="text-2xl font-semibold">
          {produto.nome}
          {!produto.ativo && (
            <span className="ml-2 rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700">
              INATIVO
            </span>
          )}
        </h1>
        <p className="text-sm text-zinc-600">
          {produto.codigo_queops && (
            <span className="mr-3 font-mono text-xs">{produto.codigo_queops}</span>
          )}
          {produto.categoria} · 1 ficha produz {produto.rendimento_padrao} {produto.unidade_producao}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setEditando(true)}>
          Editar dados
        </Button>
        <Button variant="outline" onClick={toggleAtivo} disabled={salvando}>
          {produto.ativo ? "Inativar" : "Reativar"}
        </Button>
      </div>
    </div>
  );
}
