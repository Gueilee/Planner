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
  // Atividade CANCELADA não conta no progresso do projeto — nem como 0%
  // (puxaria pra baixo indevidamente) nem como 100% (infla artificialmente).
  // Fica de fora do cálculo inteiro (numerador e denominador), igual a um
  // item "não agendado" (CLAUDE.md §3.10) — quem passa o status já traduz
  // pro vocabulário certo (v2 "CANCELADO" ou legado "CANCELLED").
  cancelled?: boolean
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

// Acha as tarefas-FOLHA (sem subtarefa) descendentes de um item — usada por
// computeProjectProgress abaixo pra reduzir cada ATIVIDADE MÃE (item de
// topo) a um único número antes de agregar ao projeto.
function collectLeaves(id: string, byId: Map<string, TaskForProgress>, childrenOf: Map<string, TaskForProgress[]>): TaskForProgress[] {
  const children = childrenOf.get(id) ?? []
  if (children.length === 0) {
    const self = byId.get(id)
    return self ? [self] : []
  }
  return children.flatMap((c) => collectLeaves(c.id, byId, childrenOf))
}

/**
 * Progresso do projeto = MÉDIA SIMPLES entre as ATIVIDADES MÃE (itens de
 * topo, parentId null) — cada uma reduzida antes a um único valor, ponderado
 * pela DURAÇÃO PLANEJADA das suas próprias tarefas-folha (taskWeight acima:
 * uma tarefa de 10 dias pesa 10x mais que uma de 1 dia, dentro da mesma
 * atividade mãe). Não pondera mais por duração direto entre TODAS as
 * tarefas-folha do projeto inteiro, achatando a árvore inteira num só
 * cálculo — decisão revertida depois de um incidente real (projeto
 * APTISSEN-CD2): uma única tarefa com término digitado errado (anos no
 * futuro por engano) tinha, sozinha, peso de duração maior que as ~78
 * tarefas restantes somadas, e dominou o projeto inteiro (91% mostrado,
 * correto seria ~59%) — nenhuma quantidade de tarefas "normais" ao redor
 * conseguia diluir esse peso. Com a média por atividade mãe, uma tarefa com
 * data ruim fica contida em, no máximo, 1/(nº de atividades mãe) do total —
 * nunca mais que isso, e nunca a maioria, mesmo no pior caso.
 *
 * Efeito colateral aceito e intencional: dentro de UMA MESMA atividade mãe, a
 * ponderação por duração continua valendo (tarefa grande pesa mais que
 * pequena); entre atividades mãe DIFERENTES, cada uma vale o mesmo peso — uma
 * atividade com 1 tarefa conta igual a uma com 20, igual à planilha de
 * referência do PMO (Excel) nesse ponto específico. Itens sem nenhum
 * agrupamento (todos com parentId null e sem filhos, ex.: cronograma
 * pequeno/plano) caem no mesmo caso: cada um é sua própria "atividade mãe"
 * de 1 tarefa só, com peso igual às demais.
 *
 * Esta é a função canônica: todo lugar que precisar do progresso do projeto
 * deve chamar esta função (com `progress` = % real OU % esperado, ver
 * computeScheduleCascade), nunca somar `.progress`/`.percentualCompleto` na
 * mão nem fazer um segundo cálculo paralelo — a mesma chamada em telas
 * diferentes (Cronograma, Status Report, Dashboard, Kanban, Analytics...)
 * tem que devolver sempre o mesmo número.
 */
export function computeProjectProgress(allTasks: TaskForProgress[]): number {
  // Cancelada (e toda a subárvore dela) fica de fora inteira — ver comentário
  // do campo `cancelled` em TaskForProgress.
  const tasks = allTasks.filter((t) => !t.cancelled)
  if (tasks.length === 0) return 0

  const byId = new Map(tasks.map((t) => [t.id, t]))
  const childrenOf = new Map<string, TaskForProgress[]>()
  for (const t of tasks) {
    if (t.parentId === null) continue
    const arr = childrenOf.get(t.parentId) ?? []
    arr.push(t)
    childrenOf.set(t.parentId, arr)
  }

  const topLevel = tasks.filter((t) => t.parentId === null)
  if (topLevel.length === 0) return 0

  const branchValues = topLevel.map((top) => {
    const leaves = collectLeaves(top.id, byId, childrenOf)
    if (leaves.length === 0) return top.progress
    const totalWeight = leaves.reduce((s, t) => s + taskWeight(t), 0)
    if (totalWeight === 0) return top.progress
    return leaves.reduce((s, t) => s + t.progress * taskWeight(t), 0) / totalWeight
  })

  return Math.round(branchValues.reduce((s, v) => s + v, 0) / branchValues.length)
}
