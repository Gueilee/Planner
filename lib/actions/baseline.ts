"use server"

// Criação de linha de base (baseline) do Cronograma v2 — extraído de
// lib/actions/s-curve.ts::createBaselineAction e do POST duplicado em
// app/api/projects/[id]/baselines/route.ts (mesma lógica copiada duas
// vezes: mesmo cálculo de próximo número/nome automático, mesmo snapshot
// de folhas com término definido). Um único lugar agora, chamado pelos
// dois (Curva S e o botão "Salvar Linha de Base" do Cronograma).
import { db } from "@/lib/db"
import { auth } from "@/auth"

// "use server" só pode exportar funções async — fica privado do módulo.
const CAN_MANAGE_BASELINE = new Set(["ADMIN", "PROJECT_MANAGER", "SPONSOR"])

export async function createBaselineForProject(
  projectId: string,
  { name, reason, description }: { name?: string; reason?: string; description?: string } = {}
): Promise<{ error?: string; id?: string }> {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  if (!CAN_MANAGE_BASELINE.has(session.user.role ?? "")) {
    return { error: "Apenas Administradores, Gerentes de Projeto e Sponsors podem aprovar um baseline." }
  }

  const items = await db.scheduleV2Item.findMany({
    where:  { projectId, terminoEstimado: { not: null } },
    select: { id: true, parentId: true, title: true, inicioEstimado: true, terminoEstimado: true, budgetedCost: true },
  })

  const groupIds = new Set(items.map((t) => t.parentId).filter((id): id is string => id !== null))
  const leafTasks = items.filter((t) => !groupIds.has(t.id))

  if (leafTasks.length === 0) {
    return { error: "O projeto não possui atividades folha com data de término definida." }
  }

  const last = await db.projectBaseline.findFirst({
    where:   { projectId },
    orderBy: { number: "desc" },
    select:  { number: true },
  })
  const nextNumber = (last?.number ?? -1) + 1
  const autoName   = name || (nextNumber === 0 ? "Baseline Original" : `Replanejamento ${nextNumber}`)

  const userId = (session.user as { id?: string }).id ?? null
  const now    = new Date()

  const baseline = await db.projectBaseline.create({
    data: {
      projectId,
      number:      nextNumber,
      name:        autoName,
      description: description ?? null,
      reason:      reason ?? null,
      createdById: userId,
      status:      "APPROVED",
      approvedById: userId,
      approvedAt:   now,
      snaps: {
        create: leafTasks.map((t) => ({
          taskId:       t.id,
          taskTitle:    t.title,
          plannedStart: t.inicioEstimado ?? null,
          plannedEnd:   t.terminoEstimado!,
          budgetedCost: t.budgetedCost ?? null,
        })),
      },
    },
  })

  return { id: baseline.id }
}

// Última linha de base do projeto, indexada por item (ScheduleV2Item.id ==
// BaselineSnap.taskId) — usada pelas colunas somente-leitura "Início Base"/
// "Término Base" no Cronograma, pra comparar linha a linha contra o
// planejado atual sem trocar de tela.
export async function getLatestBaselineByItem(
  projectId: string
): Promise<Record<string, { plannedStart: string | null; plannedEnd: string | null }>> {
  const latest = await db.projectBaseline.findFirst({
    where:   { projectId },
    orderBy: { number: "desc" },
    include: { snaps: true },
  })
  if (!latest) return {}

  const dstr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
  const byItem: Record<string, { plannedStart: string | null; plannedEnd: string | null }> = {}
  for (const s of latest.snaps) {
    byItem[s.taskId] = { plannedStart: dstr(s.plannedStart), plannedEnd: dstr(s.plannedEnd) }
  }
  return byItem
}
