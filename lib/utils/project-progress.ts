export type TaskForProgress = {
  id:        string
  progress:  number
  parentId:  string | null
  // Aceitos por compatibilidade com quem já busca essas colunas — não
  // influenciam mais o cálculo (sem peso por duração/custo, por decisão).
  startDate?: Date | string | null
  endDate?:   Date | string | null
}

// Mantido por compatibilidade de import — não é mais usado por
// computeProjectProgress (módulos foram removidos do produto).
export type AreaForProgress = { id: string; weight: number | null }

/**
 * Progresso do projeto = média simples das tarefas-FOLHA (as que não têm
 * subtarefa) — cada tarefa-folha vale o mesmo peso, sem ponderar por dias,
 * horas ou custo.
 *
 * Por que folha, e não as "Atividades" de topo: uma Atividade de topo com 1
 * tarefa (ex.: "Reunião de Encerramento") contava IGUAL a uma Atividade com 6
 * tarefas substanciais (ex.: "Teste") — a média simples por fase inflava ou
 * derrubava o % conforme o projeto tivesse mais ou menos fases "vazias",
 * mascarando o quanto de trabalho real já foi feito.
 *
 * O progresso de uma Atividade de topo já é, por sua vez, a média simples
 * das suas próprias tarefas (recalculado automaticamente a cada alteração —
 * ver propagateParentUp em lib/actions/schedule.ts): tarefa → % da
 * atividade → % do projeto, sempre por média simples, sem peso em nenhum
 * nível.
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

  return Math.round(leafTasks.reduce((s, t) => s + t.progress, 0) / leafTasks.length)
}
