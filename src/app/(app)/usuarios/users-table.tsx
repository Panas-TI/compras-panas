"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  criarUsuarioAction,
  toggleAtivoAction,
  alterarRoleAction,
  resetarSenhaAction,
  type CreateUserState,
} from "./actions";

type Role = "comprador" | "aprovador" | "estoquista" | "motorista";

export type UserRow = {
  id: string;
  nome: string;
  role: "comprador" | "aprovador" | "estoquista" | "motorista";
  ativo: boolean;
};

export function UsersTable({ currentUserId, users }: { currentUserId: string; users: UserRow[] }) {
  const [state, formAction, isPending] = useActionState<CreateUserState, FormData>(criarUsuarioAction, null);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold">Criar novo usuário</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" required maxLength={60} placeholder="Ex: Maria" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="maria@empresa.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="senha">Senha inicial</Label>
            <Input id="senha" name="senha" type="text" required minLength={6} placeholder="mínimo 6 caracteres" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role">Perfil</Label>
            <Select id="role" name="role" defaultValue="comprador">
              <option value="comprador">Comprador (solicitações + entregas)</option>
              <option value="aprovador">Aprovador (acesso total)</option>
              <option value="estoquista">Estoquista (recebimento + contagem)</option>
              <option value="motorista">Motorista (só entregas)</option>
            </Select>
          </div>
        </div>
        {state?.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
        {state?.ok && <p className="mt-3 text-sm text-emerald-700">{state.ok}</p>}
        <div className="mt-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Criando..." : "Criar usuário"}
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Nome</th>
              <th className="px-3 py-2 font-medium">Perfil</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserTr key={u.id} user={u} isSelf={u.id === currentUserId} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserTr({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggleAtivo = () => {
    startTransition(async () => {
      const res = await toggleAtivoAction(user.id, !user.ativo);
      if (res.error) setError(res.error);
    });
  };

  const changeRole = (novo: Role) => {
    if (novo === user.role) return;
    startTransition(async () => {
      const res = await alterarRoleAction(user.id, novo);
      if (res.error) setError(res.error);
    });
  };

  const resetPwd = () => {
    const nova = window.prompt(`Nova senha para ${user.nome} (mínimo 6 caracteres):`);
    if (!nova) return;
    startTransition(async () => {
      const res = await resetarSenhaAction(user.id, nova);
      if (res.error) setError(res.error);
      else alert("Senha redefinida.");
    });
  };

  return (
    <tr className="border-b border-zinc-100 last:border-0">
      <td className="px-3 py-2 font-medium">
        {user.nome}
        {isSelf && <span className="ml-2 text-xs text-zinc-500">(você)</span>}
      </td>
      <td className="px-3 py-2 text-zinc-600">
        {isSelf ? (
          user.role
        ) : (
          <Select
            value={user.role}
            onChange={(e) => changeRole(e.target.value as Role)}
            disabled={isPending}
            className="h-8 max-w-[180px] text-xs"
          >
            <option value="comprador">comprador</option>
            <option value="aprovador">aprovador</option>
            <option value="estoquista">estoquista</option>
            <option value="motorista">motorista</option>
          </Select>
        )}
      </td>
      <td className="px-3 py-2">
        {user.ativo ? (
          <span className="text-xs text-emerald-700">ativo</span>
        ) : (
          <span className="text-xs text-zinc-500">inativo</span>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={resetPwd}
            disabled={isPending}
            className="text-xs text-zinc-700 hover:underline disabled:opacity-50"
          >
            Resetar senha
          </button>
          <button
            type="button"
            onClick={toggleAtivo}
            disabled={isPending || isSelf}
            className="text-xs text-red-700 hover:underline disabled:opacity-50"
          >
            {user.ativo ? "Inativar" : "Ativar"}
          </button>
        </div>
      </td>
    </tr>
  );
}
