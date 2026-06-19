import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/auth"

export const dynamic = "force-dynamic"

// DELETE /api/projects/[id]/baselines/[bid]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; bid: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { bid } = await params
  await db.projectBaseline.delete({ where: { id: bid } })
  return NextResponse.json({ ok: true })
}
