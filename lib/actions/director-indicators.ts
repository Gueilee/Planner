"use server"

// Indicadores da Diretoria — visão executiva do PORTFÓLIO INTEIRO (todos os
// projetos, de TODAS as filiais ativas), pedida pra abrir o Status Report
// antes de entrar projeto por projeto. Reaproveita as MESMAS funções
// canônicas de cálculo já usadas em Analytics/Cronograma/Status Report
// (computeProjectProgress, computeScheduleCascade) — só agrega o resultado
// por filial e por área em vez de mostrar por projeto. Sempre calculado na
// hora (sem cache/snapshot) — decisão do usuário: já está sempre em dia
// quando a tela abre, sem precisar de nenhum mecanismo de agendamento (que
// não existe hoje no Kronex).

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { computeProjectProgress } from "@/lib/utils/project-progress"
import { DEFAULT_RISK_THRESHOLD_PCT } from "@/lib/utils/schedule-status"
import { computeScheduleCascade, SCHEDULE_STATUS_SKIP_STATUSES, resolveProjectScheduleStatus } from "@/lib/utils/schedule-cascade"
import { toLegacyLikeTasks, areasFromV2 } from "@/lib/utils/schedule-v2-adapter"
import { ProjectStatus } from "@/lib/generated/prisma/enums"

// Só Diretor ou Admin — a única tela do sistema que agrega TODAS as
// filiais de uma vez, então o gate precisa ser explícito por role (não dá
// pra depender só de Perfil de Acesso por tela, que hoje nunca filtra por
// organização — ver requireScreenView em lib/permissions-guard.ts).
const CAN_VIEW_DIRECTOR_INDICATORS = new Set(["DIRECTOR", "ADMIN"])

export type DirectorBreakdownRow = {
  key: string
  label: string
  totalProjects: number
  avgProgress: number
  onTime: number
  atRisk: number
  delayed: number
  nd: number
}

export type DirectorIndicatorsData = {
  totalProjects: number
  avgProgress: number
  onTimePct: number
  atRiskPct: number
  delayedPct: number
  ndCount: number
  totalCriticalRisks: number
  totalHighRisks: number
  avgIdc: number | null
  totalEconomy: number
  totalBudget: number
  byOrg: DirectorBreakdownRow[]
  byArea: DirectorBreakdownRow[]
  generatedAt: string
}

type Row = {
  orgId: string
  orgName: string
  area: string
  progress: number
  scheduleStatus: "ON_TIME" | "AT_RISK" | "DELAYED" | "ND"
  idc: number | null
  critical: number
  high: number
  economy: number
  budget: number
}

function summarize(group: Row[]): Omit<DirectorBreakdownRow, "key" | "label"> {
  const totalProjects = group.length
  const avgProgress = totalProjects > 0 ? Math.round(group.reduce((s, r) => s + r.progress, 0) / totalProjects) : 0
  return {
    totalProjects,
    avgProgress,
    onTime:  group.filter((r) => r.scheduleStatus === "ON_TIME").length,
    atRisk:  group.filter((r) => r.scheduleStatus === "AT_RISK").length,
    delayed: group.filter((r) => r.scheduleStatus === "DELAYED").length,
    nd:      group.filter((r) => r.scheduleStatus === "ND").length,
  }
}

function groupBy(rows: Row[], keyFn: (r: Row) => string, labelFn: (r: Row) => string): DirectorBreakdownRow[] {
  const map = new Map<string, Row[]>()
  for (const r of rows) {
    const key = keyFn(r)
    map.set(key, [...(map.get(key) ?? []), r])
  }
  return Array.from(map.entries())
    .map(([key, group]) => ({ key, label: labelFn(group[0]), ...summarize(group) }))
    .sort((a, b) => b.totalProjects - a.totalProjects)
}

export async function getDirectorIndicators(): Promise<DirectorIndicatorsData> {
  const session = await auth()
  if (!session?.user || !CAN_VIEW_DIRECTOR_INDICATORS.has(session.user.role ?? "")) {
    throw new Error("Acesso restrito à Diretoria")
  }

  const today = new Date()

  const projectsRaw = await db.project.findMany({
    where: {
      status: { not: ProjectStatus.CANCELLED },
      organization: { active: true },
    },
    select: {
      id: true, status: true, projectArea: true, budget: true, economy: true,
      organizationId: true,
      organization: { select: { name: true, riskThresholdPct: true } },
      scheduleV2Items: {
        select: {
          id: true, parentId: true, title: true, status: true, percentualCompleto: true,
          inicioEstimado: true, terminoEstimado: true, inicioReal: true, terminoReal: true,
          esforcoEstimadoH: true, esforcoRealH: true, budgetedCost: true, actualCost: true,
          responsavelId: true, responsavelNome: true,
        },
      },
      risks: { select: { status: true } },
    },
  })

  const rows: Row[] = projectsRaw.map((p) => {
    const tasks   = toLegacyLikeTasks(p.scheduleV2Items)
    const areas   = areasFromV2(p.scheduleV2Items)
    const skipKpi = SCHEDULE_STATUS_SKIP_STATUSES.has(p.status)
    const riskThresholdPct = p.organization.riskThresholdPct ?? DEFAULT_RISK_THRESHOLD_PCT

    const progress = tasks.length > 0
      ? computeProjectProgress(tasks.map((t) => ({ ...t, cancelled: t.status === "CANCELLED" })))
      : p.status === "COMPLETED" ? 100 : 0

    const cascade = computeScheduleCascade(tasks, areas, riskThresholdPct, today)
    const scheduleStatus = resolveProjectScheduleStatus(p.status, cascade.scheduleStatus)

    let idc: number | null = null
    if (!skipKpi) {
      const earnedValue   = tasks.reduce((s, t) => s + (t.budgetedCost ?? 0) * (t.progress / 100), 0)
      const actualCostSum = tasks.reduce((s, t) => s + (t.actualCost  ?? 0), 0)
      if (actualCostSum > 0) idc = Math.round((earnedValue / actualCostSum) * 100) / 100
    }

    return {
      orgId:   p.organizationId,
      orgName: p.organization.name,
      area:    p.projectArea,
      progress,
      scheduleStatus,
      idc,
      critical: p.risks.filter((r) => r.status === "CRITICAL").length,
      high:     p.risks.filter((r) => r.status === "HIGH").length,
      economy:  p.economy ?? 0,
      budget:   p.budget ?? 0,
    }
  })

  const byOrg  = groupBy(rows, (r) => r.orgId, (r) => r.orgName)
  const byArea = groupBy(rows, (r) => r.area, (r) => r.area)

  const overall = summarize(rows)
  const idcValues = rows.map((r) => r.idc).filter((v): v is number => v !== null)

  return {
    totalProjects: overall.totalProjects,
    avgProgress:   overall.avgProgress,
    onTimePct:     overall.totalProjects > 0 ? Math.round((overall.onTime  / overall.totalProjects) * 100) : 0,
    atRiskPct:     overall.totalProjects > 0 ? Math.round((overall.atRisk  / overall.totalProjects) * 100) : 0,
    delayedPct:    overall.totalProjects > 0 ? Math.round((overall.delayed / overall.totalProjects) * 100) : 0,
    ndCount:       overall.nd,
    totalCriticalRisks: rows.reduce((s, r) => s + r.critical, 0),
    totalHighRisks:     rows.reduce((s, r) => s + r.high, 0),
    avgIdc:        idcValues.length > 0 ? Math.round((idcValues.reduce((s, v) => s + v, 0) / idcValues.length) * 100) / 100 : null,
    totalEconomy:  rows.reduce((s, r) => s + r.economy, 0),
    totalBudget:   rows.reduce((s, r) => s + r.budget, 0),
    byOrg,
    byArea,
    generatedAt: new Date().toISOString(),
  }
}
