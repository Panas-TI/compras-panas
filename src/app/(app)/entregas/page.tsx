import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function EntregasHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Entregas</h1>
        <p className="text-sm text-zinc-600">Módulo em construção. Etapa 0 (hub) concluída — próximas etapas em fila.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximas entregas a serem implementadas</CardTitle>
          <CardDescription>
            Esta área é apenas um placeholder. O módulo completo está em construção e ficará pronto nas próximas etapas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-zinc-700">
            <li>1. Schema + perfil motorista + RLS</li>
            <li>2. Lista do dia (/entregas/dia)</li>
            <li>3. Cadastro via OCR Claude (/entregas/novo)</li>
            <li>4. Painel do motorista (/motorista)</li>
            <li>5. Scanner de código de barras + check-in</li>
            <li>6. Confirmação de entrega (foto + assinatura + GPS)</li>
            <li>7. Modo offline</li>
            <li>8. Mapa (/entregas/mapa)</li>
            <li>9. Relatórios (/entregas/relatorios)</li>
          </ul>
        </CardContent>
      </Card>

      <div>
        <Link href="/" className="text-sm text-zinc-600 hover:underline">
          ← Voltar ao hub
        </Link>
      </div>
    </div>
  );
}
