/**
 * IDP médio do portfólio ponderado por tamanho do projeto — em vez da média
 * aritmética simples (que dá o mesmo peso a um projeto de R$ 20 mil e a um
 * de R$ 2 milhões), pesa cada IDP pelo orçamento do projeto. Usado no
 * Resumo do Portfólio (Status Report).
 *
 * Peso = Project.budget; quando não preenchido, soma de budgetedCost das
 * tarefas; quando nenhum dos dois existir, peso 1 — nunca 0, para não
 * excluir silenciosamente o projeto da média (um peso 0 equivaleria a
 * "esse projeto não conta", o que não é a intenção de "sem dado de
 * orçamento").
 */
export function computeWeightedIdp(
  entries: { idp: number | null; budget: number | null; tasksBudgetedCostSum: number }[]
): number | null {
  const valid = entries.filter((e): e is typeof e & { idp: number } => e.idp !== null)
  if (valid.length === 0) return null

  const weighted = valid.map((e) => ({
    idp: e.idp,
    weight: e.budget && e.budget > 0 ? e.budget : e.tasksBudgetedCostSum > 0 ? e.tasksBudgetedCostSum : 1,
  }))
  const totalWeight = weighted.reduce((s, e) => s + e.weight, 0)
  if (totalWeight <= 0) return null

  const sum = weighted.reduce((s, e) => s + e.idp * e.weight, 0)
  return Math.round((sum / totalWeight) * 100) / 100
}
