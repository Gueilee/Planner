import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getEffectivePermissions, canView } from "@/lib/permissions-guard"
import { ALL_SCREEN_KEYS } from "@/lib/constants/features"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ visibleKeys: [] })

  const perms = await getEffectivePermissions(session.user)
  const visibleKeys = ALL_SCREEN_KEYS.filter((key) => canView(perms, key))
  return NextResponse.json({ visibleKeys })
}
