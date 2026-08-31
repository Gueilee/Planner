export type TaskForProgress = {
  id:        string
  progress:  number
  parentId:  string | null
  startDate: Date | string | null
  endDate:   Date | string | null
}

// Mantido por compatibilidade de import — não é mais usado por
// computeProjectProgress (módulos foram removidos do produto).
export type AreaForProgress = { id: string; weight: number | null }

function toDate(v: Date | string | null): Date | null {
  if (!v) return null
  return v instanceof Date ? v : new Date(v)
}

// Peso de uma tarefa-folha: duração planejada em dias (mínimo 1, para uma
// tarefa de 1 dia não desaparecer da conta). Sem as duas datas, cai para
// peso 1 — o mesmo de uma tarefa de 1 dia.
function taskWeight(t: TaskForProgress): number {
  const start = toDate(t.startDate)
  const end   = toDate(t.endDate)
  if (!start || !end) return 1
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  return Math.max(1, days)
}

/**
 * Progresso do projeto = média das tarefas-FOLHA (as que não têm subtarefa),
 * ponderada pela duração planejada de cada uma.
 *
 * Por que folha, e não as "Atividades" de topo: uma Atividade de topo com 1
 * tarefa (ex.: "Reunião de Encerramento") contava IGUAL a uma Atividade com 6
 * tarefas substanciais (ex.: "Teste") — a média simples por fase inflava ou
 * derrubava o % conforme o projeto tivesse mais ou menos fases "vazias",
 * mascarando o quanto de trabalho real já foi feito. Prática de EVM/PMBOK:
 * o % do projeto é a soma do valor agregado de cada pacote de trabalho real
 * (aqui, cada tarefa-folha), não uma média por fase.
 *
 * Por que ponderar por duração, e não contar tarefas 1 a 1: tarefas de
 * tamanhos muito diferentes (uma reunião de 1 dia vs. um ciclo de testes de
 * semanas) não representam a mesma fatia de esforço do projeto — contá-las
 * igual sub-pondera as fases mais longas. Duração planejada é o proxy de
 * esforço mais confiável disponível hoje (poucas tarefas têm custo/horas
 * estimadas preenchidos).
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

  let weightedSum  = 0
  let totalWeight  = 0
  for (const t of leafTasks) {
    const w = taskWeight(t)
    weightedSum += t.progress * w
    totalWeight += w
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
}
