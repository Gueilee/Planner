"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

export async function markAllRead() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Não autorizado")

  await db.notification.updateMany({
    where: { userId: session.user.id, read: false },
    data:  { read: true },
  })

  revalidatePath("/notifications")
}

export async function markRead(id: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Não autorizado")

  await db.notification.update({
    where: { id, userId: session.user.id },
    data:  { read: true },
  })

  revalidatePath("/notifications")
}
