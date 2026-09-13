// Matriz de risco — especificação funcional 11.09 (Millena). Grau do Risco
// = Consequência × Probabilidade (1-25); Status é DERIVADO do grau por
// faixa, não escolhido à mão — usado tanto no formulário (preview ao
// vivo) quanto no servidor (lib/actions/projects.ts), pra nunca divergir.
import type { RiskLevel } from "@/lib/generated/prisma/enums"

export type RiskScaleOption = { value: number; label: string; hint: string }

export const CONSEQUENCE_LEVELS: RiskScaleOption[] = [
  { value: 5, label: "Muito Alta", hint: "Gera danos à imagem ou perda financeira" },
  { value: 4, label: "Alta",       hint: "Insatisfação do cliente externo" },
  { value: 3, label: "Moderada",   hint: "Impacto significativo no processo" },
  { value: 2, label: "Baixa",      hint: "Impacto não significativo no processo" },
  { value: 1, label: "Muito Baixa",hint: "Não impacta no processo" },
]

export const PROBABILITY_LEVELS: RiskScaleOption[] = [
  { value: 5, label: "Muito Alta", hint: "Sempre ocorre" },
  { value: 4, label: "Alta",       hint: "É provável que ocorra muitas vezes" },
  { value: 3, label: "Moderada",   hint: "Tem histórico de acontecimentos recentes" },
  { value: 2, label: "Baixa",      hint: "Aconteceu poucas vezes no passado" },
  { value: 1, label: "Muito Baixa",hint: "Não constam ocorrências anteriores" },
]

export type TreatmentStrategy = "MITIGAR" | "COMPARTILHAR" | "TRANSFERIR" | "ELIMINAR" | "JUSTIFICAR"

export const TREATMENT_STRATEGIES: { value: TreatmentStrategy; label: string; hint: string }[] = [
  { value: "MITIGAR",      label: "Mitigar",      hint: "Reduz a probabilidade ou consequência" },
  { value: "COMPARTILHAR", label: "Compartilhar", hint: "Dividir com outra área" },
  { value: "TRANSFERIR",   label: "Transferir",   hint: "Transfere a responsabilidade para que outra execute a ação" },
  { value: "ELIMINAR",     label: "Eliminar",     hint: "Eliminar a fonte do risco" },
  { value: "JUSTIFICAR",   label: "Justificar",   hint: "Inserir apenas em riscos \"não significativos\"" },
]

export function computeRiskGrade(consequenceLevel: number, probabilityLevel: number): number {
  return consequenceLevel * probabilityLevel
}

/**
 * Status derivado do grau (1-25), faixas de um mapa de risco 5x5 padrão.
 * Substitui a escolha manual de nível que existia antes — nunca diverge
 * do grau calculado.
 */
export function computeRiskStatus(riskGrade: number): RiskLevel {
  if (riskGrade >= 20) return "CRITICAL"
  if (riskGrade >= 12) return "HIGH"
  if (riskGrade >= 6)  return "MEDIUM"
  return "LOW"
}
