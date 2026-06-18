import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import { Header } from "@/components/layout/header"
import { getProjectBenefits } from "@/lib/actions/benefits"
import { ProjectBenefitsClient } from "./project-benefits-client"
import { db } from "@/lib/db"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function ProjectBenefitsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const project = await db.project.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, projectArea: true },
  })
  if (!project) notFound()

  const { benefits, metrics, investment } = await getProjectBenefits(id)

  return (
    <div className="flex flex-col h-full">
      <Header title={project.title} subtitle="Benefícios e Valor Gerado" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-5">
          <Link
            href={`/projects/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-800 transition-colors font-medium group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Voltar para o Projeto
          </Link>

          <ProjectBenefitsClient
            projectId={id}
            projectTitle={project.title}
            benefits={benefits}
            metrics={metrics}
            investment={investment}
            userRole={session.user.role ?? "PROJECT_MEMBER"}
          />
        </div>
      </div>
    </div>
  )
}
