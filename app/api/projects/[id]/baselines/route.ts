import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/auth"

export const dynamic = "force-dynamic"

// GET /api/projects/[id]/baselines — list all baselines
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const baselines = await db.projectBaseline.findMany({
    where: { projectId: id },
    orderBy: { number: "asc" },
    include: {
      snaps: true,
      createdBy: { select: { name: true } },
    },
  })
  return NextResponse.json(baselines)
}

// POST /api/projects/[id]/baselines — create baseline from current task data
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { name, description, reason } = body as {
    name?: string
    description?: string
    reason?: string
  }

  // Only snapshot leaf tasks (no subtasks) with an endDate
  const tasks = await db.scheduleTask.findMany({
    where:  { projectId: id, endDate: { not: null } },
    select: {
      id: true, title: true,
      startDate: true, endDate: true, budgetedCost: true,
      _count: { select: { subtasks: true } },
    },
  })

  const leafTasks = tasks.filter((t) => t._count.subtasks === 0)

  if (leafTasks.length === 0) {
    return NextResponse.json(
      { error: "O projeto não possui atividades folha com data de término definida." },
      { status: 400 }
    )
  }

  // Find next baseline number
  const last = await db.projectBaseline.findFirst({
    where:   { projectId: id },
    orderBy: { number: "desc" },
    select:  { number: true },
  })
  const nextNumber = (last?.number ?? -1) + 1
  const autoName   = name || (nextNumber === 0 ? "Baseline Original" : `Replanejamento ${nextNumber}`)

  const userId = (session.user as { id?: string }).id

  const baseline = await db.projectBaseline.create({
    data: {
      projectId:   id,
      number:      nextNumber,
      name:        autoName,
      description: description ?? null,
      reason:      reason ?? null,
      createdById: userId ?? null,
      snaps: {
        create: leafTasks.map((t) => ({
          taskId:       t.id,
          taskTitle:    t.title,
          plannedStart: t.startDate ?? null,
          plannedEnd:   t.endDate!,
          budgetedCost: t.budgetedCost ?? null,
        })),
      },
    },
    include: { snaps: true },
  })

  return NextResponse.json(baseline, { status: 201 })
}
