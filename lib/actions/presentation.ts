"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { DocumentType } from "@/lib/generated/prisma/enums"
import type { Presentation } from "@/lib/types/presentation"

export async function savePresentation(data: Presentation & { projectId: string }) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const content = JSON.stringify({
    theme: data.theme,
    subtitle: data.subtitle,
    slides: data.slides,
  })

  let doc
  if (data.id) {
    doc = await db.projectDocument.update({
      where: { id: data.id },
      data: {
        title: data.title,
        content,
        updatedAt: new Date(),
      },
    })
  } else {
    doc = await db.projectDocument.create({
      data: {
        projectId: data.projectId,
        type: DocumentType.TECHNICAL_PRESENTATION,
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

export async function getPresentation(projectId: string) {
  const doc = await db.projectDocument.findFirst({
    where: { projectId, type: DocumentType.TECHNICAL_PRESENTATION },
    orderBy: { updatedAt: "desc" },
  })
  if (!doc) return null

  try {
    const parsed = JSON.parse(doc.content ?? "{}")
    return {
      id: doc.id,
      projectId,
      title: doc.title,
      theme: parsed.theme ?? "dark",
      subtitle: parsed.subtitle,
      slides: parsed.slides ?? [],
      updatedAt: doc.updatedAt.toISOString(),
    }
  } catch {
    return null
  }
}

export async function deletePresentation(id: string, projectId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  await db.projectDocument.delete({ where: { id } })
  revalidatePath(`/projects/${projectId}`)
}
