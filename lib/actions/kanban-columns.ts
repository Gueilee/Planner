"use server"

// Colunas de Kanban customizadas, por projeto — botão "+" no Kanban de
// Tarefas (ProjectTasksKanban). Gate de acesso é o mesmo das demais ações
// do Kanban (assertProjectAccess, lib/actions/kanban.ts): qualquer pessoa
// que já pode abrir/mover cards naquele projeto também pode criar/apagar
// uma coluna dele — não é uma ação restrita a ADMIN.

import { db } from "@/lib/db"
import { assertProjectAccess } from "@/lib/actions/project-access"
import { applyItemUpdatesV2 } from "@/lib/actions/schedule-v2"
import { revalidatePath } from "next/cache"

export type KanbanColumnDTO = {
  id:          string
  statusValue: string
  label:       string
  color:       string
  order:       number
}

export async function getProjectKanbanColumns(projectId: string): Promise<KanbanColumnDTO[]> {
  await assertProjectAccess(projectId)
  return db.kanbanColumn.findMany({
    where:   { projectId },
    orderBy: { order: "asc" },
    select:  { id: true, statusValue: true, label: true, color: true, order: true },
  })
}

function slugify(label: string): string {
  const slug = label
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
  return slug || "COLUNA"
}

export async function createKanbanColumn(projectId: string, label: string, color: string) {
  await assertProjectAccess(projectId)
  const trimmed = label.trim()
  if (!trimmed) throw new Error("Dê um nome para a coluna")
  if (trimmed.length > 40) throw new Error("Nome muito longo (máx. 40 caracteres)")

  // Prefixo "CUSTOM_" garante que o valor gravado em ScheduleV2Item.status
  // nunca colide com o vocabulário fixo do motor v2 (A_INICIAR/EM_ANDAMENTO/
  // VALIDACAO/CONCLUIDO/PAUSADO/ATRASADO/CANCELADO) nem com os IDs das 7
  // colunas fixas do Kanban (que são os valores LEGADOS: PLANNING/
  // IN_PROGRESS/...) — ver lib/utils/schedule-v2-adapter.ts.
  const base = `CUSTOM_${slugify(trimmed)}`
  let statusValue = base
  let suffix = 2
  while (
    await db.kanbanColumn.findUnique({
      where: { projectId_statusValue: { projectId, statusValue } },
      select: { id: true },
    })
  ) {
    statusValue = `${base}_${suffix++}`
  }

  const last = await db.kanbanColumn.findFirst({
    where:   { projectId },
    orderBy: { order: "desc" },
    select:  { order: true },
  })

  const column = await db.kanbanColumn.create({
    data: {
      projectId,
      statusValue,
      label: trimmed,
      color: color || "#8B5CF6",
      order: (last?.order ?? 0) + 1,
    },
    select: { id: true, statusValue: true, label: true, color: true, order: true },
  })

  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/kanban")
  return column
}

export async function deleteKanbanColumn(columnId: string) {
  const column = await db.kanbanColumn.findUnique({
    where:  { id: columnId },
    select: { projectId: true, statusValue: true },
  })
  if (!column) return
  await assertProjectAccess(column.projectId)

  // Apagar a coluna nunca apaga trabalho: cards que ainda estão nela voltam
  // pra "A Fazer" (A_INICIAR) antes da coluna sumir.
  const stuck = await db.scheduleV2Item.findMany({
    where:  { projectId: column.projectId, status: column.statusValue },
    select: { id: true },
  })
  if (stuck.length > 0) {
    await applyItemUpdatesV2(column.projectId, stuck.map((t) => ({ itemId: t.id, status: "A_INICIAR" })))
  }

  await db.kanbanColumn.delete({ where: { id: columnId } })

  revalidatePath(`/projects/${column.projectId}`)
  revalidatePath(`/projects/${column.projectId}/schedule`)
  revalidatePath("/kanban")
}
