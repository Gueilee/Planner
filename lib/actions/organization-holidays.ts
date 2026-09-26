"use server"

// Feriados extras por FILIAL (estadual/municipal) — pedido da analista de
// projetos: os feriados nacionais já são auto-semeados por projeto
// (ensureCalendarSeeded em lib/actions/schedule-v2.ts), mas um projeto numa
// filial de outro estado pode ter feriados próprios (ex.: aniversário do
// município, feriado estadual) que hoje precisariam ser cadastrados
// manualmente projeto a projeto. Aqui, uma vez cadastrado na filial, entra
// automaticamente no cálculo de dias úteis de TODOS os projetos dela (ver
// loadCalendar em lib/actions/schedule-v2.ts, que soma esses feriados aos
// do calendário do projeto).

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export type OrganizationHolidayRow = {
  id: string
  dia: string // "YYYY-MM-DD"
  descricao: string
}

function dstr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function requireOrgAccess(organizationId?: string): Promise<{ organizationId: string }> {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Não autorizado")
  const targetOrgId = organizationId || session.user.organizationId
  if (!session.user.isGlobalAdmin && targetOrgId !== session.user.organizationId) {
    throw new Error("Você só pode gerenciar feriados da sua própria filial")
  }
  return { organizationId: targetOrgId }
}

export async function listOrganizationHolidays(organizationId?: string): Promise<OrganizationHolidayRow[]> {
  const { organizationId: orgId } = await requireOrgAccess(organizationId)
  const rows = await db.organizationHoliday.findMany({
    where: { organizationId: orgId },
    orderBy: { dia: "asc" },
  })
  return rows.map((r) => ({ id: r.id, dia: dstr(r.dia), descricao: r.descricao }))
}

export async function createOrganizationHoliday(
  data: { dia: string; descricao: string },
  organizationId?: string
): Promise<{ error: string } | { success: true; holiday: OrganizationHolidayRow }> {
  const { organizationId: orgId } = await requireOrgAccess(organizationId)

  const descricao = data.descricao.trim()
  if (!descricao) return { error: "Descrição é obrigatória" }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dia)) return { error: "Data inválida" }

  const existing = await db.organizationHoliday.findUnique({
    where: { organizationId_dia: { organizationId: orgId, dia: new Date(`${data.dia}T00:00:00.000Z`) } },
  })
  if (existing) return { error: "Já existe um feriado cadastrado nesta data" }

  const created = await db.organizationHoliday.create({
    data: { organizationId: orgId, dia: new Date(`${data.dia}T00:00:00.000Z`), descricao },
  })
  revalidatePath("/settings")
  return { success: true, holiday: { id: created.id, dia: dstr(created.dia), descricao: created.descricao } }
}

export async function deleteOrganizationHoliday(id: string): Promise<void> {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Não autorizado")

  const holiday = await db.organizationHoliday.findUnique({ where: { id }, select: { organizationId: true } })
  if (!holiday) return
  if (!session.user.isGlobalAdmin && holiday.organizationId !== session.user.organizationId) {
    throw new Error("Você só pode remover feriados da sua própria filial")
  }
  await db.organizationHoliday.delete({ where: { id } })
  revalidatePath("/settings")
}
