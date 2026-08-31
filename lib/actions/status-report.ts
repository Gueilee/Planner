"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { startOfMonth, endOfMonth } from "date-fns"
import { notifyProjectMembers } from "@/lib/notify"

const CAN_CLOSE = new Set(["ADMIN", "PROJECT_MANAGER", "SPONSOR"])

export type MonthlySnapshotInput = {
  projectId:      string
  tasksTotal:     number
  tasksCompleted: number
  tasksPending:   number
  tasksDelayed:   number
  budgetUsed:     number | null
  overallStatus:  string
  highlights:     string | null
  risks:          string | null
  nextSteps:      string | null
}

export type StatusReportHistoryItem = {
  id:             string
  periodStart:    string
  periodEnd:      string
  overallStatus:  string
  tasksTotal:     number
  tasksCompleted: number
  tasksPending:   number
  tasksDelayed:   number
  budgetUsed:     number | null
  highlights:     string | null
  risks:          string | null
  nextSteps:      string | null
  createdAt:      string
  createdByName:  string | null
}

// ─── Fecha o mês corrente para um ou mais projetos (idempotente por mês) ──────

export async function closeMonthlyStatusReports(
  snapshots: MonthlySnapshotInput[]
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Não autorizado" }
  if (!CAN_CLOSE.has(session.user.role ?? "")) {
    return { success: false, error: "Apenas Administradores, Gerentes de Projeto e Sponsors podem fechar o Status Report do mês." }
  }
  if (snapshots.length === 0) return { success: true, count: 0 }

  const now         = new Date()
  const periodStart = startOfMonth(now)
  const periodEnd   = endOfMonth(now)

  for (const s of snapshots) {
    await db.statusReport.upsert({
      where: { projectId_periodStart: { projectId: s.projectId, periodStart } },
      create: {
        projectId:      s.projectId,
        periodStart,
        periodEnd,
        createdById:    session.user.id,
        overallStatus:  s.overallStatus,
        tasksTotal:     s.tasksTotal,
        tasksCompleted: s.tasksCompleted,
        tasksPending:   s.tasksPending,
        tasksDelayed:   s.tasksDelayed,
        budgetUsed:     s.budgetUsed,
        highlights:     s.highlights,
        risks:          s.risks,
        nextSteps:      s.nextSteps,
      },
      update: {
        periodEnd,
        createdById:    session.user.id, // quem fechou (ou re-fechou) por último
        overallStatus:  s.overallStatus,
        tasksTotal:     s.tasksTotal,
        tasksCompleted: s.tasksCompleted,
        tasksPending:   s.tasksPending,
        tasksDelayed:   s.tasksDelayed,
        budgetUsed:     s.budgetUsed,
        highlights:     s.highlights,
        risks:          s.risks,
        nextSteps:      s.nextSteps,
      },
    })

    // Governança de Capex: custo real ultrapassou o orçamento aprovado do projeto
    if (s.budgetUsed !== null) {
      const project = await db.project.findUnique({
        where:  { id: s.projectId },
        select: { title: true, budget: true },
      })
      if (project?.budget && s.budgetUsed > project.budget) {
        const overPct = Math.round(((s.budgetUsed - project.budget) / project.budget) * 100)
        await notifyProjectMembers(s.projectId, "budgetExceeded", {
          type:    "budget_exceeded",
          title:   "Orçamento ultrapassado",
          message: `O custo real do projeto "${project.title}" (R$ ${s.budgetUsed.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}) ultrapassou o orçamento aprovado (R$ ${project.budget.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}) em ${overPct}%.`,
          link:    `/projects/${s.projectId}`,
        })
      }
    }
  }

  revalidatePath("/status-report")
  return { success: true, count: snapshots.length }
}

// ─── Histórico de meses já fechados de um projeto ─────────────────────────────

export async function getStatusReportHistory(projectId: string): Promise<StatusReportHistoryItem[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const rows = await db.statusReport.findMany({
    where:   { projectId },
    orderBy: { periodStart: "desc" },
    include: { createdBy: { select: { name: true } } },
  })

  return rows.map((r) => ({
    id:             r.id,
    periodStart:    r.periodStart.toISOString(),
    periodEnd:      r.periodEnd.toISOString(),
    overallStatus:  r.overallStatus,
    tasksTotal:     r.tasksTotal,
    tasksCompleted: r.tasksCompleted,
    tasksPending:   r.tasksPending,
    tasksDelayed:   r.tasksDelayed,
    budgetUsed:     r.budgetUsed,
    highlights:     r.highlights,
    risks:          r.risks,
    nextSteps:      r.nextSteps,
    createdAt:      r.createdAt.toISOString(),
    createdByName:  r.createdBy?.name ?? null,
  }))
}
