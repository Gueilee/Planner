export type TaskForProgress  = { progress: number; parentId: string | null }
export type AreaForProgress  = { id: string; weight: number | null }

/**
 * Progresso do projeto = média simples do progresso das tarefas de TOPO
 * (sem parentId).
 *
 * Antes esta função ponderava por módulo WBS (peso do módulo). Módulos foram
 * removidos do produto (Cronograma não os usa mais), mas projetos antigos
 * ainda têm WbsArea com peso salvo no banco — se essa função continuasse
 * lendo esses pesos, uma tela que buscasse `wbsAreas` do banco mostraria um %
 * diferente de uma tela que não buscasse, mesmo depois de unificado o
 * critério de tarefa-de-topo. Foi exatamente essa a causa de o mesmo projeto
 * mostrar 3 números diferentes (Cronograma, Kanban, Detalhes/Status Report).
 * Por isso módulo/peso não entram mais aqui, para nenhum resquício de dado
 * legado voltar a causar divergência.
 *
 * Tarefas de topo já refletem, cada uma, a média das suas próprias
 * subtarefas (recalculado a cada alteração — ver propagateParentUp em
 * lib/actions/schedule.ts), então somar mãe e filhas juntas contaria o mesmo
 * avanço duas vezes.
 *
 * Esta é a função canônica: todo lugar que precisar do progresso do projeto
 * deve chamar esta função, nunca somar `.progress` na mão.
 */
export function computeProjectProgress(tasks: TaskForProgress[]): number {
  const topLevel = tasks.filter((t) => !t.parentId)
  if (topLevel.length === 0) return 0
  return Math.round(topLevel.reduce((s, t) => s + t.progress, 0) / topLevel.length)
}
