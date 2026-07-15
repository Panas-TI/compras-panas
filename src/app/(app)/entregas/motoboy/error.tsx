"use client";

export default function MotoboyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Motoboy — auditoria de km</h1>
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p className="font-medium">Algo deu errado ao processar o relatório.</p>
        <p className="mt-1 text-red-700">{error.message}</p>
      </div>
      <button
        onClick={reset}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
      >
        Tentar de novo
      </button>
    </div>
  );
}
