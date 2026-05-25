"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { ProjectStatus } from "@/lib/generated/prisma/enums"

export async function createProjectRequest(data: {
  title: string
  area: string
  sponsorId: string
  areaSolicitante: string
  origin: string
  stakeholders: string[]
  scope: string
  asIs: string
  toBe: string
  assumptions: string
  restrictions: string
  expectedStart: string
  expectedEnd: string
  economy?: number
  estimatedCosts?: number
  budget?: number
  risks: Array<{ description: string; level: string; mitigation: string }>
  files: Array<{ name: string; url: string; size: number }>
}) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const memberIds = [session.user.id]
  if (data.sponsorId !== session.user.id) memberIds.push(data.sponsorId)

  const project = await db.project.create({
    data: {
      title:          data.title,
      description:    data.scope || null,
      status:         ProjectStatus.PENDING_GO_NO_GO,
      origin:         data.origin || null,
      scope:          data.scope || null,
      asIs:           data.asIs || null,
      toBe:           data.toBe || null,
      assumptions:    data.assumptions || null,
      restrictions:   data.restrictions || null,
      budget:         data.budget         ?? null,
      estimatedCosts: data.estimatedCosts ?? null,
      economy:        data.economy        ?? null,
      expectedStart:  data.expectedStart ? new Date(data.expectedStart) : null,
      expectedEnd:    data.expectedEnd   ? new Date(data.expectedEnd)   : null,
      sponsorId:      data.sponsorId || null,
      roadmapYear:    new Date().getFullYear(),
      roadmapQuarter: Math.ceil((new Date().getMonth() + 1) / 3),
      members: {
        create: memberIds.map((userId, i) => ({
          userId,
          role: i === 0 ? "Gerente de Projetos" : "Solicitante / Sponsor",
        })),
      },
      risks: data.risks.length > 0
        ? {
            create: data.risks.map((r) => ({
              description: r.description,
              probability: "MEDIUM",
              impact:      r.level,
              mitigation:  r.mitigation || null,
              status:      (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(r.level) ? r.level : "MEDIUM") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
            })),
          }
        : undefined,
    },
  })

  revalidatePath("/projects")
  revalidatePath("/dashboard")
  return { id: project.id }
}
