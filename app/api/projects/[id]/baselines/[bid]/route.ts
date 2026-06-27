import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// DELETE is intentionally blocked — baselines are immutable historical records.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function DELETE(_req: NextRequest) {
  return NextResponse.json(
    { error: "Baselines são registros históricos imutáveis e não podem ser excluídas." },
    { status: 403 }
  )
}
