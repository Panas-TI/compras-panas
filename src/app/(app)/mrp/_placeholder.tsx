import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MrpPlaceholder({
  titulo,
  descricao,
  etapa,
}: {
  titulo: string;
  descricao: string;
  etapa: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{titulo}</h1>
        <p className="text-sm text-zinc-600">{descricao}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">⏳ Em construção (Etapa {etapa})</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-700">
            Esta tela ainda não foi implementada. O banco já tem os dados (importados do
            Queóps na Etapa 2), só falta a interface.
          </p>
          <Link href="/mrp" className="mt-3 inline-block text-sm text-zinc-900 underline-offset-4 hover:underline">
            ← Voltar pro início do MRP
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
