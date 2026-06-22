import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/auth"

export const dynamic = "force-dynamic"

// GET /api/projects/[id]/tasks/[taskId]/time-entries
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { taskId } = await params
  const entries = await db.timeEntry.findMany({
    where: { taskId },
    orderBy: { date: "desc" },
    include: { user: { select: { id: true, name: true, image: true } } },
  })
  return NextResponse.json(entries)
}

// POST /api/projects/[id]/tasks/[taskId]/time-entries
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { taskId } = await params
  const { hours, date, note } = await req.json() as { hours: number; date?: string; note?: string }

  if (!hours || hours <= 0) {
    return NextResponse.json({ error: "Horas inválidas" }, { status: 400 })
  }

  await db.timeEntry.create({
    data: {
      taskId,
      userId: session.user.id,
      hours,
      date: date ? new Date(date) : new Date(),
      note: note ?? null,
    },
  })

  // Recalculate actualEffort = sum of all entries
  const agg = await db.timeEntry.aggregate({
    where: { taskId },
    _sum: { hours: true },
  })
  const actualEffort = agg._sum.hours ?? 0

  await db.scheduleTask.update({
    where: { id: taskId },
    data: { actualEffort },
  })

  // Return updated entries list + new actualEffort
  const entries = await db.timeEntry.findMany({
    where: { taskId },
    orderBy: { date: "desc" },
    include: { user: { select: { id: true, name: true, image: true } } },
  })

  return NextResponse.json({ entries, actualEffort }, { status: 201 })
}
