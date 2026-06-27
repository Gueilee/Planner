"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { DocumentType } from "@/lib/generated/prisma/enums"
import type { KOPresentation } from "@/lib/types/kickoff-presentation"

export async function saveKickOffPresentation(data: KOPresentation & { projectId: string }) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const content = JSON.stringify({ slides: data.slides })

  let doc
  if (data.id) {
    doc = await db.projectDocument.update({
      where: { id: data.id },
      data: { title: data.title, content, updatedAt: new Date() },
    })
  } else {
    doc = await db.projectDocument.create({
      data: {
        projectId: data.projectId,
        type: DocumentType.KICKOFF_PRESENTATION,
        title: data.title,
        content,
        version: 1,
        createdById: session.user.id,
      },
    })
  }

  revalidatePath(`/projects/${data.projectId}`)
  return { id: doc.id }
}

export async function getKickOffPresentation(projectId: string) {
  const doc = await db.projectDocument.findFirst({
    where: { projectId, type: DocumentType.KICKOFF_PRESENTATION },
    orderBy: { updatedAt: "desc" },
  })
  if (!doc) return null

  try {
    const parsed = JSON.parse(doc.content ?? "{}")
    return {
      id:        doc.id,
      projectId,
      title:     doc.title,
      slides:    parsed.slides ?? [],
      updatedAt: doc.updatedAt.toISOString(),
    } as KOPresentation & { id: string; updatedAt: string }
  } catch {
    return null
  }
}
