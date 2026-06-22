"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import type {
  BenefitFormData, MeasurementFormData, BenefitItem, ProjectBenefitMetrics, PortfolioSummary, PortfolioChartData,
} from "@/lib/types/benefits"
import {
  computeProjectMetrics, computeFinancialRealized, computeRevenueRealized,
  computeHoursSaved, computeTotalEffective, buildTimelineData, annualizeValue, effectiveValue,
} from "@/lib/utils/benefits-calc"

const CAN_MANAGE = new Set(["ADMIN", "PROJECT_MANAGER"])

// ── Serialize helpers ──────────────────────────────────────────────────────────
function serializeBenefit(b: {
  id: string; projectId: string; category: string; type: string; description: string
  unit: string; plannedValue: number; realizedValue: number; frequency: string
  baselineDate: Date | null; realizationDate: Date | null; evidence: string | null
  status: string; customTypeName: string | null; createdById: string; createdAt: Date; updatedAt: Date
  measurements: { id: string; measuredAt: Date; measuredValue: number; notes: string | null; createdBy: { name: string }; createdAt: Date }[]
  attachments: { id: string; fileName: string; fileUrl: string; fileType: string; fileSize: number | null; uploadedAt: Date }[]
}): BenefitItem {
  return {
    id:              b.id,
    projectId:       b.projectId,
    category:        b.category as BenefitItem["category"],
    type:            b.type     as BenefitItem["type"],
    description:     b.description,
    unit:            b.unit,
    plannedValue:    b.plannedValue,
    realizedValue:   b.realizedValue,
    frequency:       b.frequency as BenefitItem["frequency"],
    baselineDate:    b.baselineDate    ? b.baselineDate.toISOString()    : null,
    realizationDate: b.realizationDate ? b.realizationDate.toISOString() : null,
    evidence:        b.evidence,
    status:          b.status as BenefitItem["status"],
    customTypeName:  b.customTypeName,
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
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: BENEFIT_INCLUDE,
    }),
    db.project.findUnique({ where: { id: projectId }, select: { id: true, title: true, projectArea: true, status: true, investment: true } }),
  ])

  if (!project) throw new Error("Project not found")

  const benefits = rawBenefits.map(serializeBenefit)

  // Portfolio refs for normalization — use project's own values as cap
  const financialMax = computeFinancialRealized(benefits) || 1
  const revenueMax   = computeRevenueRealized(benefits) || 1

  const metrics = computeProjectMetrics(
    { ...project, benefits },
    financialMax,
    revenueMax,
  )

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
  if (filters?.areas?.length)    projectWhere.projectArea = { in: filters.areas }
  if (filters?.statuses?.length) projectWhere.status      = { in: filters.statuses }
  if (filters?.managerIds?.length) {
    projectWhere.members = { some: { userId: { in: filters.managerIds } } }
  }

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
      benefits: {
        where: benefitWhere,
        include: BENEFIT_INCLUDE,
      },
    },
  })

  // Deduplicate — Prisma can return the same project row more than once when
  // relation filters (members) produce an implicit join in certain DB drivers
  const seenIds = new Set<string>()
  const allProjects = rawProjects
    .filter((p) => { if (seenIds.has(p.id)) return false; seenIds.add(p.id); return true })
    .map((p) => ({ ...p, benefits: p.benefits.map(serializeBenefit) }))

  // Portfolio max values for score normalization
  const portfolioMaxFinancial = Math.max(1, ...allProjects.map((p) => computeFinancialRealized(p.benefits)))
  const portfolioMaxRevenue   = Math.max(1, ...allProjects.map((p) => computeRevenueRealized(p.benefits)))

  const projectMetrics = allProjects.map((p) =>
    computeProjectMetrics(p, portfolioMaxFinancial, portfolioMaxRevenue),
  )

  // Summary KPIs
  const totalEconomy    = allProjects.reduce((s, p) => s + computeTotalEffective(p.benefits), 0)
  const totalRevenue    = allProjects.reduce((s, p) => s + computeRevenueRealized(p.benefits), 0)
  const totalHours      = allProjects.reduce((s, p) => s + computeHoursSaved(p.benefits), 0)
  const totalRealized   = projectMetrics.reduce((s, p) => s + p.totalRealized, 0)
  const totalInvestment = projectMetrics.reduce((s, p) => s + p.investment, 0)
  const rois            = projectMetrics.filter((p) => p.roi !== null).map((p) => p.roi!)
  const averageRoi      = rois.length > 0 ? rois.reduce((a, b) => a + b, 0) / rois.length : null
  const scores          = projectMetrics.filter((p) => p.benefitCount > 0).map((p) => p.impactScore)
  const averageImpactScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null

  // Top projects chart — sort by totalPlanned to show pipeline value
  const topProjects = [...projectMetrics]
    .sort((a, b) => b.totalPlanned - a.totalPlanned)
    .slice(0, 10)
    .map((p) => ({ name: p.projectTitle, value: p.totalPlanned, roi: p.roi }))

  // Category breakdown — effective value (planned or realized)
  const catFinancial   = allProjects.reduce((s, p) => s + computeFinancialRealized(p.benefits), 0)
  const catOperational = allProjects.reduce((s, p) =>
    s + p.benefits
      .filter((b) => b.category === "OPERATIONAL")
      .reduce((ss, b) => ss + annualizeValue(effectiveValue(b), b.frequency), 0),
    0,
  )
  const catStrategic = allProjects.reduce((s, p) =>
    s + p.benefits
      .filter((b) => b.category === "STRATEGIC")
      .reduce((ss, b) => ss + annualizeValue(effectiveValue(b), b.frequency), 0),
    0,
  )

  return {
    summary: {
      totalEconomy, totalRevenue, totalHours, averageRoi, averageImpactScore,
      totalRealized, totalInvestment,
      projectCount: allProjects.length,
      realizedProjectCount: projectMetrics.filter((p) => p.realizedCount > 0).length,
    },
    charts: {
      topProjects,
      byCategory: [
        { name: "Financeiro",   value: catFinancial,   color: "#10B981" },
        { name: "Operacional",  value: catOperational, color: "#3B82F6" },
        { name: "Estratégico",  value: catStrategic,   color: "#8B5CF6" },
      ],
      timeline: buildTimelineData(allProjects),
    },
    projects: projectMetrics,
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export async function createBenefit(projectId: string, data: BenefitFormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  if (!CAN_MANAGE.has(session.user.role ?? "")) throw new Error("Forbidden")

  await db.projectBenefit.create({
    data: {
      projectId,
      createdById:     session.user.id,
      category:        data.category,
      type:            data.type,
      description:     data.description,
      unit:            data.unit,
      plannedValue:    data.plannedValue,
      realizedValue:   data.realizedValue,
      frequency:       data.frequency,
      baselineDate:    data.baselineDate    ? new Date(data.baselineDate)    : null,
      realizationDate: data.realizationDate ? new Date(data.realizationDate) : null,
      evidence:        data.evidence,
      status:          data.status,
      customTypeName:  data.type === "OTHER" ? (data.customTypeName ?? null) : null,
    },
  })

  revalidatePath(`/projects/${projectId}/benefits`)
  revalidatePath("/benefits")
}

export async function updateBenefit(benefitId: string, data: Partial<BenefitFormData>) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  if (!CAN_MANAGE.has(session.user.role ?? "")) throw new Error("Forbidden")

  const benefit = await db.projectBenefit.findUnique({ where: { id: benefitId }, select: { projectId: true } })
  if (!benefit) throw new Error("Not found")

  await db.projectBenefit.update({
    where: { id: benefitId },
    data: {
      ...data,
      baselineDate:    data.baselineDate    ? new Date(data.baselineDate)    : undefined,
      realizationDate: data.realizationDate ? new Date(data.realizationDate) : undefined,
      // Only touch customTypeName when type is explicitly provided in the update
      ...(data.type !== undefined
        ? { customTypeName: data.type === "OTHER" ? (data.customTypeName ?? null) : null }
        : {}),
    },
  })

  revalidatePath(`/projects/${benefit.projectId}/benefits`)
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
      createdById:  session.user.id,
      measuredAt:   new Date(data.measuredAt),
      measuredValue: data.measuredValue,
      notes:        data.notes,
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
    data: {
      benefitId,
      fileName: file.fileName,
      fileUrl:  file.fileUrl,
      fileType: file.fileType,
      fileSize: file.fileSize,
    },
  })

  revalidatePath(`/projects/${benefit.projectId}/benefits`)
}

export async function deleteBenefitAttachment(attachmentId: string, projectId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  await db.attachment.delete({ where: { id: attachmentId } })
  revalidatePath(`/projects/${projectId}/benefits`)
}
