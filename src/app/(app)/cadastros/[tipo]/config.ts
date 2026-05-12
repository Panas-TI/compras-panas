export type LookupTipo = "fornecedores" | "classificacoes" | "unidades-medida" | "formas-pagamento";

export const LOOKUP_CONFIG: Record<
  LookupTipo,
  { label: string; singular: string; table: "fornecedores" | "classificacoes" | "unidades_medida" | "formas_pagamento" }
> = {
  fornecedores: { label: "Fornecedores", singular: "Fornecedor", table: "fornecedores" },
  classificacoes: { label: "Classificações", singular: "Classificação", table: "classificacoes" },
  "unidades-medida": { label: "Unidades de medida", singular: "Unidade de medida", table: "unidades_medida" },
  "formas-pagamento": { label: "Formas de pagamento", singular: "Forma de pagamento", table: "formas_pagamento" },
};

export function isLookupTipo(value: string): value is LookupTipo {
  return value in LOOKUP_CONFIG;
}
