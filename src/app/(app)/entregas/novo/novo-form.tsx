"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScannerCodigo } from "@/components/scanner/scanner-codigo";
import { cadastrarPorCodigoAction } from "./actions";

type Lancamento = {
  codigo: string;
  status: "novo" | "duplicado" | "erro";
  detalhe?: string;
  ts: number;
};

export function NovoForm() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [manualCodigo, setManualCodigo] = useState("");
  const [salvando, startSalvar] = useTransition();

  const lancar = (codigo: string) => {
    const codigoLimpo = codigo.trim();
    if (!codigoLimpo) return;

    startSalvar(async () => {
      const res = await cadastrarPorCodigoAction(codigoLimpo);
      if (!res) return;
      if (!res.ok) {
        setLancamentos((arr) => [
          { codigo: codigoLimpo, status: "erro", detalhe: res.error, ts: Date.now() },
          ...arr,
        ]);
        return;
      }
      if (res.jaExistia) {
        setLancamentos((arr) => [
          {
            codigo: codigoLimpo,
            status: "duplicado",
            detalhe: `Já estava cadastrado (${res.status}) em ${res.data_entrega}`,
            ts: Date.now(),
          },
          ...arr,
        ]);
      } else {
        setLancamentos((arr) => [
          { codigo: codigoLimpo, status: "novo", ts: Date.now() },
          ...arr,
        ]);
      }
    });
  };

  const lancarManual = () => {
    if (!manualCodigo.trim()) return;
    lancar(manualCodigo);
    setManualCodigo("");
  };

  const contadores = {
    novos: lancamentos.filter((l) => l.status === "novo").length,
    duplicados: lancamentos.filter((l) => l.status === "duplicado").length,
    erros: lancamentos.filter((l) => l.status === "erro").length,
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Escanear código de barras</CardTitle>
          <p className="text-xs text-zinc-500">
            Aponta a câmera pro código de barras do pedido impresso (Code 128 do Queóps). Cada
            bipada cadastra um pedido pra hoje. Pode bipar vários em sequência.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ScannerCodigo onCodigo={lancar} continuo />
          <div className="flex items-end gap-2 border-t border-zinc-100 pt-3">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="manual" className="text-xs font-medium text-zinc-600">
                Ou digita o código manualmente
              </label>
              <Input
                id="manual"
                value={manualCodigo}
                onChange={(e) => setManualCodigo(e.target.value)}
                placeholder="C010022310554"
                onKeyDown={(e) => {
                  if (e.key === "Enter") lancarManual();
                }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={lancarManual}
              disabled={salvando || !manualCodigo.trim()}
            >
              Cadastrar
            </Button>
          </div>
        </CardContent>
      </Card>

      {lancamentos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Cadastrados nesta sessão ({lancamentos.length})
            </CardTitle>
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="text-emerald-700">✓ {contadores.novos} novo(s)</span>
              {contadores.duplicados > 0 && (
                <span className="text-amber-700">⚠ {contadores.duplicados} duplicado(s)</span>
              )}
              {contadores.erros > 0 && (
                <span className="text-red-700">✕ {contadores.erros} erro(s)</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-zinc-100">
              {lancamentos.map((l) => (
                <li key={`${l.ts}-${l.codigo}`} className="flex items-center justify-between gap-2 py-2">
                  <div className="flex items-center gap-2">
                    {l.status === "novo" && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                        ✓ novo
                      </span>
                    )}
                    {l.status === "duplicado" && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                        ⚠ já existe
                      </span>
                    )}
                    {l.status === "erro" && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                        ✕ erro
                      </span>
                    )}
                    <span className="font-mono text-sm">{l.codigo}</span>
                  </div>
                  {l.detalhe && <span className="text-xs text-zinc-500">{l.detalhe}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Link href="/entregas/dia">
          <Button variant="outline">Ver lista do dia →</Button>
        </Link>
      </div>
    </div>
  );
}
