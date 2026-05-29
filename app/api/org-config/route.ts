import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { DEFAULT_AREA_CONFIGS } from "@/lib/types/org-config"

export async function GET() {
  try {
    const row = await db.orgConfig.findUnique({ where: { id: "singleton" } })
    return NextResponse.json({
      name:    row?.name    ?? "Planner",
      logoUrl: row?.logoUrl ?? null,
    })
  } catch {
    return NextResponse.json({ name: "Planner", logoUrl: null })
  }
}
