// Rótulos de EXIBIÇÃO dos papéis. O valor interno continua "aprovador" em todo
// o código e no banco (RLS); aqui só traduzimos pra como aparece pro usuário.
// "aprovador" é o papel de acesso total → exibido como "Administrador".
export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case "aprovador":
      return "Administrador";
    case "comprador":
      return "Comprador";
    case "estoquista":
      return "Estoquista";
    case "motorista":
      return "Motorista";
    default:
      return role ?? "—";
  }
}
