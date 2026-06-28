"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import type {
  BenefitFormData, MeasurementFormData, BenefitItem,
  ProjectBenefitMetrics, PortfolioSummary, PortfolioChartData,
} from "@/lib/types/benefits"
import {
  computeProjectMetrics, computeFinancialRealized, computeRevenueRealized,
  computeHoursSaved, computeTotalEffective, computeTotalPlanned,
  computeEconomyMonthly, buildTimelineData, annualizeValue, effectiveValue,
} from "@/lib/utils/benefits-calc"

const CAN_MANAGE = new Set(["ADMIN", "PROJECT_MANAGER"])

// ── Serialize helpers ──────────────────────────────────────────────────────────
function serializeBenefit(b: {
  id: string; projectId: string; category: string; type: string; name: string; description: string
  indicator: string | null; formula: string | null
  unit: string; plannedValue: number; realizedValue: number; frequency: string
  periodicity: string; monitoringMonths: number
  baselineDate: Date | null; targetDate: Date | null; realizationDate: Date | null
  evidence: string | null; notes: string | null
  status: string; customTypeName: string | null
  responsibleId: string | null
  responsible: { name: string } | null
  timeBeforeMinutes: number | null; timeAfterMinutes: number | null
  executionsPerMonth: number | null; hourlyRate: number | null
  strategicWeight: number
  createdById: string; createdAt: Date; updatedAt: Date
  measurements: { id: string; measuredAt: Date; measuredValue: number; notes: string | null; createdBy: { name: string }; createdAt: Date }[]
  attachments: { id: string; fileName: string; fileUrl: string; fileType: string; fileSize: number | null; uploadedAt: Date }[]
}): BenefitItem {
  return {
    id:              b.id,
    projectId:       b.projectId,
    category:        b.category as BenefitItem["category"],
    type:            b.type     as BenefitItem["type"],
    name:            b.name,
    description:     b.description,
    indicator:       b.indicator,
    formula:         b.formula,
    unit:            b.unit,
    plannedValue:    b.plannedValue,
    realizedValue:   b.realizedValue,
    frequency:       b.frequency    as BenefitItem["frequency"],
    periodicity:     b.periodicity  as BenefitItem["periodicity"],
    monitoringMonths: b.monitoringMonths,
    baselineDate:    b.baselineDate    ? b.baselineDate.toISOString()    : null,
    targetDate:      b.targetDate      ? b.targetDate.toISOString()      : null,
    realizationDate: b.realizationDate ? b.realizationDate.toISOString() : null,
    evidence:        b.evidence,
    notes:           b.notes,
    status:          b.status as BenefitItem["status"],
    customTypeName:  b.customTypeName,
    responsibleId:   b.responsibleId,
    responsibleName: b.responsible?.name ?? null,
    timeBeforeMinutes:  b.timeBeforeMinutes,
    timeAfterMinutes:   b.timeAfterMinutes,
    executionsPerMonth: b.executionsPerMonth,
    hourlyRate:         b.hourlyRate,
    strategicWeight:    b.strategicWeight,
    createdById:     b.createdById,
    createdAt:       b.createdAt.toISOString(),
    updatedAt:       b.updatedAt.toISOString(),
    measurements:    b.measurements.map((m) => ({
      id: m.id, measuredAt: m.measuredAt.toISOString(),
      measuredValue: m.measuredValue, notes: m.notes,
      createdBy: m.createdBy,
    })),
    attachments: b.attachments.map((a) => ({
      id: a.id, fileName: a.fileName, fileUrl: a.fileUrl,
      fileType: a.fileType, fileSize: a.fileSize, uploadedAt: a.uploadedAt.toISOString(),
    })),
  }
}

const BENEFIT_INCLUDE = {
  responsible: { select: { name: true } },
  measurements: {
    orderBy: { measuredAt: "desc" as const },
    include: { createdBy: { select: { name: true } } },
  },
  attachments: {
    select: { id: true, fileName: true, fileUrl: true, fileType: true, fileSize: true, uploadedAt: true },
  },
} as const

// ── Get benefits for a single project ─────────────────────────────────────────
export async function getProjectBenefits(projectId: string): Promise<{
  benefits: BenefitItem[]
  metrics: ProjectBenefitMetrics
  investment: number
}> {
  const [rawBenefits, project] = await Promise.all([
    db.projectBenefit.findMany({
      where:   { projectId },
      orderBy: { createdAt: "asc" },
      include: BENEFIT_INCLUDE,
    }),
    db.project.findUnique({
      where:  { id: projectId },
      select: { id: true, title: true, projectArea: true, status: true, investment: true },
    }),
  ])

  if (!project) throw new Error("Project not found")

  const benefits = rawBenefits.map(serializeBenefit)
  const financialMax = computeFinancialRealized(benefits) || 1
  const revenueMax   = computeRevenueRealized(benefits) || 1
  const metrics = computeProjectMetrics({ ...project, benefits }, financialMax, revenueMax)

  return { benefits, metrics, investment: project.investment }
}

// ── Portfolio dashboard data ───────────────────────────────────────────────────
export async function getPortfolioBenefits(filters?: {
  years?: number[]; areas?: string[]; statuses?: string[]; categories?: string[]; managerIds?: string[]
}): Promise<{
  summary: PortfolioSummary
  charts: PortfolioChartData
  projects: ProjectBenefitMetrics[]
}> {
  const projectWhere: Record<string, unknown> = {}
  if (filters?.areas?.length)      projectWhere.projectArea = { in: filters.areas }
  if (filters?.statuses?.length)   projectWhere.status      = { in: filters.statuses }
  if (filters?.managerIds?.length) projectWhere.members = { some: { userId: { in: filters.managerIds } } }

  const benefitWhere: Record<string, unknown> = {}
  if (filters?.categories?.length) benefitWhere.category = { in: filters.categories }
  if (filters?.years?.length) {
    benefitWhere.OR = filters.years.map((y) => ({
      createdAt: { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) },
    }))
  }

  const rawProjects = await db.project.findMany({
    where: projectWhere,
    select: {
      id: true, title: true, projectArea: true, status: true, investment: true,
      benefits: { where: benefitWhere, include: BENEFIT_INCLUDE },
    },
  })

  const seenIds = new Set<string>()
  const allProjects = rawProjects
    .filter((p) => { if (seenIds.has(p.id)) return false; seenIds.add(p.id); return true })
    .map((p) => ({ ...p, benefits: p.benefits.map(serializeBenefit) }))

  const portfolioMaxFinancial = Math.max(1, ...allProjects.map((p) => computeFinancialRealized(p.benefits)))
  const portfolioMaxRevenue   = Math.max(1, ...allProjects.map((p) => computeRevenueRealized(p.benefits)))

  const projectMetrics = allProjects.map((p) =>
    computeProjectMetrics(p, portfolioMaxFinancial, portfolioMaxRevenue),
  )

  // ── Summary ─────────────────────────────────────────────────────────────────
  const totalPlanned       = projectMetrics.reduce((s, p) => s + p.totalPlanned, 0)
  const totalRealized      = projectMetrics.reduce((s, p) => s + p.totalRealized, 0)
  const totalEconomy       = allProjects.reduce((s, p) => s + computeTotalEffective(p.benefits), 0)
  const totalRevenue       = allProjects.reduce((s, p) => s + computeRevenueRealized(p.benefits), 0)
  const totalHours         = allProjects.reduce((s, p) => s + computeHoursSaved(p.benefits), 0)
  const totalInvestment    = projectMetrics.reduce((s, p) => s + p.investment, 0)
  const economyMonthly     = allProjects.reduce((s, p) => s + computeEconomyMonthly(p.benefits), 0)
  const netValueGenerated  = totalRealized - totalInvestment
  const rois               = projectMetrics.filter((p) => p.roi !== null).map((p) => p.roi!)
  const averageRoi         = rois.length > 0 ? rois.reduce((a, b) => a + b, 0) / rois.length : null
  const paybacks           = projectMetrics.filter((p) => p.paybackMonths !== null).map((p) => p.paybackMonths!)
  const averagePayback     = paybacks.length > 0 ? paybacks.reduce((a, b) => a + b, 0) / paybacks.length : null
  const ivgs               = projectMetrics.filter((p) => p.benefitCount > 0).map((p) => p.ivg)
  const averageIvg         = ivgs.length > 0 ? ivgs.reduce((a, b) => a + b, 0) / ivgs.length : null

  const belowTargetCount    = projectMetrics.filter((p) => p.benefitCount > 0 && p.realizationRate < 50).length
  const noMeasurementCount  = allProjects.filter((p) => {
    const active = p.benefits.filter((b) => b.status === "IN_PROGRESS")
    return active.some((b) => b.measurements.length === 0)
  }).length
  const productivityCount   = allProjects.reduce((s, p) => {
    return s + p.benefits.filter((b) => b.category === "OPERATIONAL" && (b.status === "REALIZED" || b.status === "IN_PROGRESS")).length
  }, 0)

  // ── Charts ──────────────────────────────────────────────────────────────────
  const topProjects = [...projectMetrics]
    .sort((a, b) => b.totalPlanned - a.totalPlanned)
    .slice(0, 10)
    .map((p) => ({ name: p.projectTitle, planned: p.totalPlanned, realized: p.totalRealized, roi: p.roi, ivg: p.ivg }))

  const catFinancial   = projectMetrics.reduce((s, p) => s + p.financialRealized, 0)
  const catOperational = projectMetrics.reduce((s, p) => s + p.operationalRealized, 0)
  const catStrategic   = projectMetrics.reduce((s, p) => s + p.strategicRealized, 0)
  const catCompliance  = projectMetrics.reduce((s, p) => s + p.complianceRealized, 0)
  const catTotal       = catFinancial + catOperational + catStrategic + catCompliance || 1

  const revenueVsEconomy = topProjects.slice(0, 6).map((p) => {
    const proj = allProjects.find((x) => x.title === p.name)
    return {
      name:    p.name.length > 20 ? p.name.slice(0, 20) + "…" : p.name,
      revenue: proj ? computeRevenueRealized(proj.benefits) : 0,
      economy: proj ? computeFinancialRealized(proj.benefits) : 0,
    }
  })

  return {
    summary: {
      totalPlanned, totalRealized, totalEconomy, totalRevenue, totalHours,
      totalInvestment, netValueGenerated, economyMonthly, economyAnnual: economyMonthly * 12,
      averageRoi, averagePaybackMonths: averagePayback, averageIvg,
      projectCount:        allProjects.length,
      realizedProjectCount: projectMetrics.filter((p) => p.realizedCount > 0).length,
      belowTargetCount, noMeasurementCount, productivityCount,
    },
    charts: {
      topProjects,
      byCategory: [
        { name: "Financeiro",   value: catFinancial,   color: "#10B981", pct: Math.round(catFinancial   / catTotal * 100) },
        { name: "Operacional",  value: catOperational, color: "#3B82F6", pct: Math.round(catOperational / catTotal * 100) },
        { name: "Estratégico",  value: catStrategic,   color: "#8B5CF6", pct: Math.round(catStrategic   / catTotal * 100) },
        { name: "Compliance",   value: catCompliance,  color: "#F59E0B", pct: Math.round(catCompliance  / catTotal * 100) },
      ],
      timeline: buildTimelineData(allProjects),
      revenueVsEconomy,
    },
    projects: projectMetrics,
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export async function createBenefit(projectId: string, data: BenefitFormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  if (!CAN_MANAGE.has(session.user.role ?? "")) throw new Error("Forbidden")

  const benefit = await db.projectBenefit.create({
    data: {
      projectId,
      createdById:        session.user.id,
      category:           data.category,
      type:               data.type,
      name:               data.name,
      description:        data.description,
      indicator:          data.indicator ?? null,
      formula:            data.formula ?? null,
      unit:               data.unit,
      plannedValue:       data.plannedValue,
      realizedValue:      data.realizedValue,
      frequency:          data.frequency,
      periodicity:        data.periodicity,
      monitoringMonths:   data.monitoringMonths,
      baselineDate:       data.baselineDate    ? new Date(data.baselineDate)    : null,
      targetDate:         data.targetDate      ? new Date(data.targetDate)      : null,
      realizationDate:    data.realizationDate ? new Date(data.realizationDate) : null,
      evidence:           data.evidence ?? null,
      notes:              data.notes ?? null,
      status:             data.status,
      customTypeName:     data.type === "OTHER" ? (data.customTypeName ?? null) : null,
      responsibleId:      data.responsibleId ?? null,
      timeBeforeMinutes:  data.timeBeforeMinutes ?? null,
      timeAfterMinutes:   data.timeAfterMinutes ?? null,
      executionsPerMonth: data.executionsPerMonth ?? null,
      hourlyRate:         data.hourlyRate ?? null,
      strategicWeight:    data.strategicWeight ?? 0,
    },
  })

  // Audit log
  await db.benefitAuditLog.create({
    data: {
      benefitId: benefit.id,
      userId:    session.user.id,
      action:    "CREATED",
      newValue:  JSON.stringify({ category: data.category, type: data.type, plannedValue: data.plannedValue }),
    },
  })

  revalidatePath(`/projects/${projectId}/benefits`)
  revalidatePath("/benefits")
}

export async function updateBenefit(benefitId: string, data: Partial<BenefitFormData>) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  if (!CAN_MANAGE.has(session.user.role ?? "")) throw new Error("Forbidden")

  const existing = await db.projectBenefit.findUnique({
    where: { id: benefitId },
    select: { projectId: true, plannedValue: true, realizedValue: true, status: true },
  })
  if (!existing) throw new Error("Not found")

  await db.projectBenefit.update({
    where: { id: benefitId },
    data: {
      ...data,
      baselineDate:    data.baselineDate    ? new Date(data.baselineDate)    : undefined,
      targetDate:      data.targetDate      ? new Date(data.targetDate)      : undefined,
      realizationDate: data.realizationDate ? new Date(data.realizationDate) : undefined,
      ...(data.type !== undefined
        ? { customTypeName: data.type === "OTHER" ? (data.customTypeName ?? null) : null }
        : {}),
    },
  })

  // Audit log for value changes
  if (data.plannedValue !== undefined || data.realizedValue !== undefined || data.status !== undefined) {
    await db.benefitAuditLog.create({
      data: {
        benefitId,
        userId:   session.user.id,
        action:   "UPDATED",
        oldValue: JSON.stringify({ plannedValue: existing.plannedValue, realizedValue: existing.realizedValue, status: existing.status }),
        newValue: JSON.stringify({ plannedValue: data.plannedValue, realizedValue: data.realizedValue, status: data.status }),
      },
    })
  }

  revalidatePath(`/projects/${existing.projectId}/benefits`)
  revalidatePath("/benefits")
}

export async function deleteBenefit(benefitId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  if (!CAN_MANAGE.has(session.user.role ?? "")) throw new Error("Forbidden")

  const benefit = await db.projectBenefit.findUnique({ where: { id: benefitId }, select: { projectId: true } })
  if (!benefit) throw new Error("Not found")

  await db.projectBenefit.delete({ where: { id: benefitId } })

  revalidatePath(`/projects/${benefit.projectId}/benefits`)
  revalidatePath("/benefits")
}

// ── Investment ────────────────────────────────────────────────────────────────
export async function updateProjectInvestment(projectId: string, investment: number) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  if (!CAN_MANAGE.has(session.user.role ?? "")) throw new Error("Forbidden")

  await db.project.update({ where: { id: projectId }, data: { investment } })

  revalidatePath(`/projects/${projectId}/benefits`)
  revalidatePath("/benefits")
}

// ── Measurements ──────────────────────────────────────────────────────────────
export async function addMeasurement(benefitId: string, data: MeasurementFormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  if (!CAN_MANAGE.has(session.user.role ?? "")) throw new Error("Forbidden")

  const benefit = await db.projectBenefit.findUnique({ where: { id: benefitId }, select: { projectId: true } })
  if (!benefit) throw new Error("Not found")

  await db.benefitMeasurement.create({
    data: {
      benefitId,
      createdById:   session.user.id,
      measuredAt:    new Date(data.measuredAt),
      measuredValue: data.measuredValue,
      notes:         data.notes,
    },
  })

  await db.benefitAuditLog.create({
    data: {
      benefitId,
      userId:   session.user.id,
      action:   "MEASURED",
      newValue: String(data.measuredValue),
    },
  })

  revalidatePath(`/projects/${benefit.projectId}/benefits`)
}

export async function deleteMeasurement(measurementId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  if (!CAN_MANAGE.has(session.user.role ?? "")) throw new Error("Forbidden")

  await db.benefitMeasurement.delete({ where: { id: measurementId } })
}

// ── Attachments ───────────────────────────────────────────────────────────────
export async function addBenefitAttachment(
  benefitId: string,
  file: { fileName: string; fileUrl: string; fileType: string; fileSize: number },
) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const benefit = await db.projectBenefit.findUnique({ where: { id: benefitId }, select: { projectId: true } })
  if (!benefit) throw new Error("Not found")

  await db.attachment.create({
    data: { benefitId, fileName: file.fileName, fileUrl: file.fileUrl, fileType: file.fileType, fileSize: file.fileSize },
  })

  revalidatePath(`/projects/${benefit.projectId}/benefits`)
}

export async function deleteBenefitAttachment(attachmentId: string, projectId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  await db.attachment.delete({ where: { id: attachmentId } })
  revalidatePath(`/projects/${projectId}/benefits`)
}
