// Adaptador Cronograma v2 -> forma "legado" — Fase 4.1 do plano de adoção.
//
// Os três "cérebros" de cálculo (project-progress.ts, schedule-status.ts,
// schedule-cascade.ts) e as telas que os chamam (Analytics, Indicadores,
// Status Report, Curva S, Dashboard, Priorização, Histórico, Encerramento,
// Go-Live) foram escritos contra o formato do ScheduleTask legado. Em vez
// de reescrever essa matemática, este arquivo traduz uma lista de
// ScheduleV2Item (+ dependências) para o MESMO formato de campos que esse
// código já espera — assim a lógica continua sendo uma peça só, e as duas
// fontes de dados (legado congelado, v2 vivo) produzem resultados
// comparáveis.
//
// Mapeamentos que exigem uma decisão de produto (não são 1:1 óbvios):
// - "Área" (WbsArea legado, com cor/peso) não existe no v2 — decisão do
//   time: o ANCESTRAL DE TOPO de cada item representa a área dele
//   (topLevelAncestorId). wbsAreaColor sempre null (v2 não tem cor de
//   área) — quem consome já tem fallback de cor própria.
// - `status` do v2 é um vocabulário de 4 valores (A_INICIAR/EM_ANDAMENTO/
//   CONCLUIDO/ATRASADO); o legado usa o enum TaskStatus (7 valores). Como
//   TODO o código consumidor compara contra strings do enum legado
//   (`status === "COMPLETED"`, `status in [...]`), a tradução V2_STATUS_TO_LEGACY
//   converte para o valor mais próximo do enum legado — mantém o código
//   consumidor 100% inalterado.
// - `completedAt` não existe no v2 — aproximado por `terminoReal` quando
//   status = CONCLUIDO (mesma função prática: "quando de fato terminou").
// - `riskStatus` (risco por tarefa) não existe no v2 — não é usado em
//   nenhum cálculo hoje (confirmado: só aparece no tipo, nunca lido pelos
//   clients), então é derivado por heurística do próprio status de prazo
//   só para preencher o campo sem quebrar o tipo.

// Vocabulário de status do v2 — 6 valores, espelhando 1:1 o TaskStatus
// legado (exceto INITIATIVE, que colapsa em A_INICIAR — nenhuma tela usava
// esse valor separadamente). Decisão do time (Fase 5): o Kanban precisa das
// 6 colunas reais (incl. "Em Validação" e "Pausada"), não só das 4 que o
// dropdown do Cronograma v2 tinha originalmente — então o campo já-livre
// `ScheduleV2Item.status` passou a aceitar os 6 valores, sem precisar de
// migração de schema (sempre foi String, nunca enum).
export const V2_STATUS_TO_LEGACY: Record<string, string> = {
  A_INICIAR: "PLANNING",
  EM_ANDAMENTO: "IN_PROGRESS",
  VALIDACAO: "VALIDATION",
  CONCLUIDO: "COMPLETED",
  PAUSADO: "ON_HOLD",
  ATRASADO: "DELAYED",
}

// Inverso — 1:1 com o legado (nenhuma perda de granularidade). Mesma tabela
// usada pela migração de dados (Fase 2, scripts/migrate-scheduletask-to-v2.ts).
export const LEGACY_STATUS_TO_V2: Record<string, string> = {
  INITIATIVE: "A_INICIAR",
  PLANNING: "A_INICIAR",
  IN_PROGRESS: "EM_ANDAMENTO",
  VALIDATION: "VALIDACAO",
  COMPLETED: "CONCLUIDO",
  ON_HOLD: "PAUSADO",
  DELAYED: "ATRASADO",
}

export type V2ItemRow = {
  id: string
  parentId: string | null
  title: string
  status: string
  percentualCompleto: number
  inicioEstimado: Date | null
  terminoEstimado: Date | null
  inicioReal: Date | null
  terminoReal: Date | null
  esforcoEstimadoH: number
  esforcoRealH: number
  budgetedCost: number | null
  actualCost: number | null
  responsavelId: string | null
  responsavel?: { id: string; name: string; image?: string | null } | null
  // Nome digitado livremente quando a pessoa não é um usuário cadastrado
  // (ex.: alguém de fora, ou o cadastro ainda não foi feito) — nunca
  // coexiste com responsavelId/responsavel.
  responsavelNome?: string | null
}

export type LegacyLikeTask = {
  id: string
  title: string
  status: string
  progress: number
  riskStatus: string
  wbsAreaId: string | null
  wbsAreaName: string | null
  wbsAreaColor: string | null
  parentId: string | null
  startDate: Date | null
  endDate: Date | null
  actualStart: Date | null
  actualEnd: Date | null
  completedAt: Date | null
  estimatedEffort: number | null
  actualEffort: number | null
  budgetedCost: number | null
  actualCost: number | null
  responsibleId: string | null
  responsibleName: string | null
  responsibleImage: string | null
  order: number
}

/** Sobe a árvore até achar o item sem pai — essa raiz representa a "área". */
export function topLevelAncestorId(id: string, parentById: Map<string, string | null>): string {
  let cur = id
  let guard = 0
  while (guard++ < 1000) {
    const p = parentById.get(cur)
    if (!p) return cur
    cur = p
  }
  return cur // guarda contra ciclo acidental nos dados
}

function deriveRiskStatus(status: string): string {
  if (status === "ATRASADO") return "HIGH"
  if (status === "EM_ANDAMENTO") return "MEDIUM"
  return "LOW"
}

export function toLegacyLikeTasks(rows: V2ItemRow[]): LegacyLikeTask[] {
  const parentById = new Map(rows.map((r) => [r.id, r.parentId]))
  const titleById = new Map(rows.map((r) => [r.id, r.title]))

  return rows.map((r, i) => {
    const areaId = topLevelAncestorId(r.id, parentById)
    return {
      id: r.id,
      title: r.title,
      status: V2_STATUS_TO_LEGACY[r.status] ?? "PLANNING",
      progress: r.percentualCompleto,
      riskStatus: deriveRiskStatus(r.status),
      wbsAreaId: areaId,
      wbsAreaName: titleById.get(areaId) ?? null,
      wbsAreaColor: null,
      parentId: r.parentId,
      startDate: r.inicioEstimado,
      endDate: r.terminoEstimado,
      actualStart: r.inicioReal,
      actualEnd: r.terminoReal,
      completedAt: r.status === "CONCLUIDO" ? r.terminoReal : null,
      estimatedEffort: r.esforcoEstimadoH,
      actualEffort: r.esforcoRealH,
      budgetedCost: r.budgetedCost,
      actualCost: r.actualCost,
      responsibleId: r.responsavelId,
      responsibleName: r.responsavel?.name ?? r.responsavelNome ?? null,
      responsibleImage: r.responsavel?.image ?? null,
      order: i,
    }
  })
}

/** Itens de topo (sem pai) representam as "áreas" — equivalente a WbsArea. */
export function areasFromV2(rows: Pick<V2ItemRow, "id" | "parentId" | "title">[]): { id: string; name: string; color: string | null; weight: number | null }[] {
  return rows
    .filter((r) => !r.parentId)
    .map((r) => ({ id: r.id, name: r.title, color: null, weight: null }))
}

/**
 * Lista de IDs de predecessores por item, resolvida a partir de
 * ScheduleV2Dependency — equivalente ao antigo ScheduleTask.dependencies
 * (JSON flat de IDs), independente do tipo do vínculo (FS/SS/FF), para
 * preservar o mesmo comportamento do alerta "dependência quebrada" que já
 * existia (qualquer predecessor não concluído bloqueia).
 */
export function dependenciesById(deps: { successorId: string; predecessorId: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const d of deps) {
    map.set(d.successorId, [...(map.get(d.successorId) ?? []), d.predecessorId])
  }
  return map
}
