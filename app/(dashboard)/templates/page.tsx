import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getTemplates, seedDefaultTemplates } from "@/lib/actions/templates"
import { TemplatesClient } from "./templates-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Modelos de Cronograma" }

export default async function TemplatesPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  // Seed padrão na primeira visita
  await seedDefaultTemplates()

  const templates = await getTemplates()
  const userRole  = (session.user.role ?? "PROJECT_MEMBER") as string

  return <TemplatesClient templates={templates} userRole={userRole} />
}
