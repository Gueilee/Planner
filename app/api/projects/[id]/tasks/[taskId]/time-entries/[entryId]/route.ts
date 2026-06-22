import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/auth"

export const dynamic = "force-dynamic"

// DELETE /api/projects/[id]/tasks/[taskId]/time-entries/[entryId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string; entryId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { taskId, entryId } = await params

  await db.timeEntry.delete({ where: { id: entryId } })

  // Recalculate actualEffort
  const agg = await db.timeEntry.aggregate({
    where: { taskId },
    _sum: { hours: true },
  })
  const actualEffort = agg._sum.hours ?? 0

  await db.scheduleTask.update({
    where: { id: taskId },
    data: { actualEffort },
  })

  return NextResponse.json({ actualEffort })
}
