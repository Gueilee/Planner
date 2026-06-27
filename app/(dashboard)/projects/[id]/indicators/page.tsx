import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { getIndicatorsData } from "@/lib/actions/indicators"
import { IndicatorsClient } from "./indicators-client"

export const metadata = { title: "Indicadores do Projeto" }

export default async function IndicatorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [data, project] = await Promise.all([
    getIndicatorsData(id),
    db.project.findUnique({ where: { id }, select: { id: true, title: true } }),
  ])

  if (!data || !project) notFound()

  return <IndicatorsClient data={data} projectId={id} />
}
