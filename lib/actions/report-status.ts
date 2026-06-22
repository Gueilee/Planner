"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

export type ReportStatusInput = {
  projectId:        string
  reportStatusCost:      "GREEN" | "YELLOW" | "RED"
  reportStatusSchedule:  "GREEN" | "YELLOW" | "RED"
  reportStatusResources: "GREEN" | "YELLOW" | "RED"
  reportStatusOverall:   "GREEN" | "YELLOW" | "RED"
  reportStatusNotes?:    string
}

export async function updateReportStatus(data: ReportStatusInput) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  await db.project.update({
    where: { id: data.projectId },
    data: {
      reportStatusCost:      data.reportStatusCost,
      reportStatusSchedule:  data.reportStatusSchedule,
      reportStatusResources: data.reportStatusResources,
      reportStatusOverall:   data.reportStatusOverall,
      reportStatusNotes:     data.reportStatusNotes?.trim() || null,
      reportStatusManual:    true,  // lock out auto-overwrite once user saves manually
    },
  })

  revalidatePath(`/projects/${data.projectId}`)
  revalidatePath("/status-report")
}

export async function resetReportStatusToAuto(projectId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  await db.project.update({
    where: { id: projectId },
    data: { reportStatusManual: false },
  })

  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/status-report")
}
