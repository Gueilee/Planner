"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function getUserOrgAccess(userId: string): Promise<string[]> {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Não autorizado")

  const records = await db.userOrganizationAccess.findMany({
    where: { userId },
    select: { organizationId: true },
  })
  return records.map((r) => r.organizationId)
}

export async function setUserOrgAccess(userId: string, orgIds: string[]): Promise<void> {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Não autorizado")

  await db.$transaction(async (tx) => {
    await tx.userOrganizationAccess.deleteMany({ where: { userId } })
    if (orgIds.length > 0) {
      await tx.userOrganizationAccess.createMany({
        data: orgIds.map((organizationId) => ({ userId, organizationId })),
      })
    }
  })
  revalidatePath("/settings")
}
