export type TaskForProgress = {
  id:        string
  progress:  number
  parentId:  string | null
  // Duração planejada (início/término estimados) — usada como PESO no
  // cálculo abaixo (ver computeProjectProgress). Quando ausente (item ainda
  // não agendado), a tarefa entra com peso 1, igual ao comportamento antigo
  // (média simples) para esse item específico.
  startDate?: Date | string | null
  endDate?:   Date | string | null
}

// Mantido por compatibilidade de import — não é mais usado por
// computeProjectProgress (módulos foram removidos do produto).
export type AreaForProgress = { id: string; weight: number | null }

// Peso de uma tarefa-folha = sua duração planejada em dias corridos
// (término − início, inclusive — mesma convenção de "duração inclusiva" do
// motor de cronograma: início == término conta como 1 dia), com piso 1.
// Sem datas (item não agendado) ou datas inconsistentes: peso 1 (mesmo
// tratamento de antes, quando não havia peso nenhum).
function taskWeight(t: TaskForProgress): number {
  if (!t.startDate || !t.endDate) return 1
  const start = t.startDate instanceof Date ? t.startDate : new Date(t.startDate)
  const end   = t.endDate   instanceof Date ? t.endDate   : new Date(t.endDate)
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  return Number.isFinite(days) && days >= 1 ? days : 1
}

/**
 * Progresso do projeto = média das tarefas-FOLHA (as que não têm subtarefa),
 * ponderada pela DURAÇÃO PLANEJADA de cada uma (taskWeight acima) — uma
 * tarefa de 10 dias pesa 10x mais que uma de 1 dia. Antes era média simples
 * (todas com peso igual); mudança de decisão (relatado pela PMO): uma
 * tarefa pequena concluída adiantada empurrava o % do projeto pra cima na
 * mesma proporção de uma tarefa grande em risco de atraso, escondendo esse
 * risco atrás de um número "bom".
 *
 * Por que folha, e não as "Atividades" de topo: uma Atividade de topo com 1
 * tarefa (ex.: "Reunião de Encerramento") contava IGUAL a uma Atividade com 6
 * tarefas substanciais (ex.: "Teste") — a média por fase inflava ou derrubava
 * o % conforme o projeto tivesse mais ou menos fases "vazias", mascarando o
 * quanto de trabalho real já foi feito. Ponderar por duração no nível de
 * tarefa-folha já resolve isso automaticamente (uma fase com mais trabalho
 * pesa mais, sem precisar tratar fase separadamente).
 *
 * Esta é a função canônica: todo lugar que precisar do progresso do projeto
 * deve chamar esta função, nunca somar `.progress` na mão.
 */
export function computeProjectProgress(tasks: TaskForProgress[]): number {
  if (tasks.length === 0) return 0

  const parentIds = new Set(
    tasks.map((t) => t.parentId).filter((id): id is string => id !== null)
  )
  const leafTasks = tasks.filter((t) => !parentIds.has(t.id))
  if (leafTasks.length === 0) return 0

  const totalWeight = leafTasks.reduce((s, t) => s + taskWeight(t), 0)
  if (totalWeight === 0) return 0
  const weightedSum = leafTasks.reduce((s, t) => s + t.progress * taskWeight(t), 0)
  return Math.round(weightedSum / totalWeight)
}
