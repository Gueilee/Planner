import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { createBaselineForProject } from "@/lib/actions/baseline"

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
  const { id } = await params
  const body = await req.json()
  const { name, description, reason } = body as {
    name?: string
    description?: string
    reason?: string
  }

  const result = await createBaselineForProject(id, { name, description, reason })
  if (result.error) {
    const status = result.error === "Unauthorized" ? 401 : result.error.startsWith("Apenas") ? 403 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  const baseline = await db.projectBaseline.findUnique({
    where: { id: result.id },
    include: { snaps: true },
  })
  return NextResponse.json(baseline, { status: 201 })
}
