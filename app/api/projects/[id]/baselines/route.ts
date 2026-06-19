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
    include: { snaps: true },
  })
  return NextResponse.json(baselines)
}

// POST /api/projects/[id]/baselines — create baseline from current task endDates
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { name, description } = body as { name?: string; description?: string }

  // Snapshot all tasks that have an endDate
  const tasks = await db.scheduleTask.findMany({
    where: { projectId: id, endDate: { not: null } },
    select: { id: true, title: true, endDate: true },
  })

  if (tasks.length === 0) {
    return NextResponse.json(
      { error: "O projeto não possui atividades com data de término definida." },
      { status: 400 }
    )
  }

  // Find next baseline number
  const last = await db.projectBaseline.findFirst({
    where: { projectId: id },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  const nextNumber = (last?.number ?? -1) + 1
  const autoName = name || (nextNumber === 0 ? "Baseline Original" : `Replanejamento ${nextNumber}`)

  const baseline = await db.projectBaseline.create({
    data: {
      projectId: id,
      number: nextNumber,
      name: autoName,
      description: description ?? null,
      snaps: {
        create: tasks.map((t) => ({
          taskId: t.id,
          taskTitle: t.title,
          plannedEnd: t.endDate!,
        })),
      },
    },
    include: { snaps: true },
  })

  return NextResponse.json(baseline, { status: 201 })
}
