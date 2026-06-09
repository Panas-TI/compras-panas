"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { salvarEntregaAction, type DadosEntrega, type ItemPedido } from "./actions";

type MediaType = "image/jpeg" | "image/png" | "image/webp";

type FotoOpcional = {
  base64: string;
  mediaType: MediaType;
  previewUrl: string;
  sizeKB: number;
};

const EMPTY: DadosEntrega = {
  codigo_queops: null,
  data_entrega: new Date().toISOString().slice(0, 10),
  hora_entrega: null,
  area_entrega: null,
  cliente_nome: null,
  cliente_telefone: null,
  contato_nome: null,
  endereco_rua: null,
  endereco_numero: null,
  endereco_complemento: null,
  bairro: null,
  cidade: null,
  uf: "RS",
  observacoes: null,
  valor_total: null,
  total_fisico: null,
  itens: [],
};

export function NovoForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<FotoOpcional | null>(null);
  const [dados, setDados] = useState<DadosEntrega>(EMPTY);
  const [erro, setErro] = useState<string | null>(null);
  const [contador, setContador] = useState<number>(0);
  const [salvando, startSalvar] = useTransition();

  const handleFotoFile = async (file: File) => {
    setErro(null);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: "image/jpeg",
        initialQuality: 0.8,
      });
      const buf = await compressed.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);
      setFoto({
        base64,
        mediaType: "image/jpeg",
        previewUrl: URL.createObjectURL(compressed),
        sizeKB: Math.round(compressed.size / 1024),
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const removerFoto = () => {
    setFoto(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const reset = () => {
    setFoto(null);
    setDados(EMPTY);
    setErro(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const salvar = () => {
    setErro(null);
    startSalvar(async () => {
      const res = await salvarEntregaAction(
        dados,
        foto?.base64 ?? null,
        foto?.mediaType ?? null
      );
      if (!res) return;
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      setContador((c) => c + 1);
      reset();
    });
  };

  const updateField = <K extends keyof DadosEntrega>(k: K, v: DadosEntrega[K]) => {
    setDados((d) => ({ ...d, [k]: v }));
  };

  const updateItem = (idx: number, patch: Partial<ItemPedido>) => {
    setDados((d) => ({
      ...d,
      itens: d.itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  };

  const addItem = () => {
    setDados((d) => ({
      ...d,
      itens: [...d.itens, { quantidade: null, codigo: null, nome: null, valor: null }],
    }));
  };

  const removeItem = (idx: number) => {
    setDados((d) => ({ ...d, itens: d.itens.filter((_, i) => i !== idx) }));
  };

  const podeSalvar =
    !!dados.codigo_queops && !!dados.cliente_nome && !!dados.data_entrega && !!dados.endereco_rua;

  return (
    <div className="flex flex-col gap-4">
      {contador > 0 && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          ✓ {contador} {contador === 1 ? "pedido cadastrado" : "pedidos cadastrados"} nesta sessão.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do pedido</CardTitle>
          <p className="text-xs text-zinc-500">Preencha os campos do pedido impresso do Queóps.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Código Queóps *"
              value={dados.codigo_queops}
              onChange={(v) => updateField("codigo_queops", v)}
              placeholder="C010022310554"
            />
            <Field
              label="Data entrega *"
              type="date"
              value={dados.data_entrega}
              onChange={(v) => updateField("data_entrega", v)}
            />
            <Field
              label="Hora"
              type="time"
              value={dados.hora_entrega}
              onChange={(v) => updateField("hora_entrega", v)}
            />
            <Field
              label="Área entrega"
              type="number"
              value={dados.area_entrega}
              onChange={(v) => updateField("area_entrega", v === null ? null : Number(v))}
            />
            <Field
              label="Cliente *"
              value={dados.cliente_nome}
              onChange={(v) => updateField("cliente_nome", v)}
              className="sm:col-span-2"
              placeholder="Razão social ou nome"
            />
            <Field
              label="Telefone"
              value={dados.cliente_telefone}
              onChange={(v) => updateField("cliente_telefone", v)}
              placeholder="(51) 9XXXX-XXXX"
            />
            <Field
              label="Contato (pessoa)"
              value={dados.contato_nome}
              onChange={(v) => updateField("contato_nome", v)}
            />
            <Field
              label="Rua *"
              value={dados.endereco_rua}
              onChange={(v) => updateField("endereco_rua", v)}
              className="sm:col-span-2"
            />
            <Field
              label="Número"
              value={dados.endereco_numero}
              onChange={(v) => updateField("endereco_numero", v)}
            />
            <Field
              label="Complemento"
              value={dados.endereco_complemento}
              onChange={(v) => updateField("endereco_complemento", v)}
            />
            <Field
              label="Bairro"
              value={dados.bairro}
              onChange={(v) => updateField("bairro", v)}
            />
            <Field
              label="Cidade"
              value={dados.cidade}
              onChange={(v) => updateField("cidade", v)}
            />
            <Field
              label="UF"
              value={dados.uf}
              onChange={(v) => updateField("uf", v ? v.toUpperCase().slice(0, 2) : null)}
            />
            <Field
              label="Valor total (R$)"
              type="number"
              step="0.01"
              value={dados.valor_total}
              onChange={(v) => updateField("valor_total", v === null ? null : Number(v))}
            />
            <Field
              label="Total físico (un)"
              type="number"
              step="1"
              value={dados.total_fisico}
              onChange={(v) => updateField("total_fisico", v === null ? null : Number(v))}
            />
          </div>

          <div>
            <Label>Observações</Label>
            <textarea
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              rows={3}
              value={dados.observacoes ?? ""}
              onChange={(e) => updateField("observacoes", e.target.value || null)}
              placeholder="ENTREGAR DAS 07:30 AS 09:00, NAO COBRAR TAXA, etc"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Itens do pedido ({dados.itens.length})</Label>
              <button
                type="button"
                onClick={addItem}
                className="text-xs text-zinc-700 hover:underline"
              >
                + Adicionar linha
              </button>
            </div>
            {dados.itens.length > 0 && (
              <div className="mt-2 overflow-x-auto rounded-md border border-zinc-200">
                <table className="w-full min-w-[500px] text-xs">
                  <thead className="bg-zinc-50 text-left">
                    <tr>
                      <th className="px-2 py-1 font-medium">Qtd</th>
                      <th className="px-2 py-1 font-medium">Cód</th>
                      <th className="px-2 py-1 font-medium">Nome</th>
                      <th className="px-2 py-1 text-right font-medium">Valor</th>
                      <th className="px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.itens.map((it, i) => (
                      <tr key={i} className="border-t border-zinc-100">
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            step="0.001"
                            value={it.quantidade ?? ""}
                            onChange={(e) =>
                              updateItem(i, {
                                quantidade: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                            className="w-16 rounded border border-zinc-300 px-1 py-0.5"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            value={it.codigo ?? ""}
                            onChange={(e) => updateItem(i, { codigo: e.target.value || null })}
                            className="w-20 rounded border border-zinc-300 px-1 py-0.5 font-mono"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            value={it.nome ?? ""}
                            onChange={(e) => updateItem(i, { nome: e.target.value || null })}
                            className="w-full rounded border border-zinc-300 px-1 py-0.5"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            step="0.01"
                            value={it.valor ?? ""}
                            onChange={(e) =>
                              updateItem(i, { valor: e.target.value ? Number(e.target.value) : null })
                            }
                            className="w-20 rounded border border-zinc-300 px-1 py-0.5 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => removeItem(i)}
                            className="text-red-700 hover:underline"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Foto do pedido (opcional)</CardTitle>
          <p className="text-xs text-zinc-500">
            Anexa a foto do pedido impresso pra registro. Não é obrigatório.
          </p>
        </CardHeader>
        <CardContent>
          {!foto ? (
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFotoFile(f);
                }}
              />
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                📷 Anexar foto
              </Button>
              <span className="text-xs text-zinc-500">Câmera traseira no celular</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={foto.previewUrl}
                alt="Pedido"
                className="h-32 w-full rounded-md border border-zinc-200 object-contain sm:w-48"
              />
              <div className="flex flex-1 flex-col gap-2">
                <div className="text-xs text-zinc-600">{foto.sizeKB} KB · comprimida pra envio</div>
                <Button type="button" variant="outline" onClick={removerFoto}>
                  Remover foto
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {erro && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          ⚠ {erro}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-zinc-500">* campos obrigatórios</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={reset} disabled={salvando}>
            Limpar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/entregas/dia")}
            disabled={salvando}
          >
            Ver lista do dia
          </Button>
          <Button type="button" onClick={salvar} disabled={salvando || !podeSalvar}>
            {salvando ? "Salvando..." : "Salvar entrega"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
  className,
  placeholder,
}: {
  label: string;
  value: string | number | null;
  onChange: (v: string | null) => void;
  type?: string;
  step?: string;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <Label>{label}</Label>
      <Input
        type={type}
        step={step}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      />
    </div>
  );
}
