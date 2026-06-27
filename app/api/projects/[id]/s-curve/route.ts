import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getSCurveData } from "@/lib/actions/s-curve"

export const dynamic = "force-dynamic"

// GET /api/projects/[id]/s-curve — returns full S-curve payload (used by client refresh)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const data = await getSCurveData(id)
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(data)
}
