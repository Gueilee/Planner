import { auth } from "@/auth"
import { db } from "@/lib/db"
import { Header } from "@/components/layout/header"
import { NewProjectForm } from "./new-project-form"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

export const metadata = { title: "Solicitar Novo Projeto" }

export default async function NewProjectPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const users = await db.user.findMany({
    where: { active: true, organizationId: session.user.organizationId },
    select: { id: true, name: true, department: true, role: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="flex flex-col h-full">
      <Header title="Solicitar Novo Projeto" subtitle="Preencha o formulário para abrir uma solicitação de projeto" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-sm text-[#6b6880] hover:text-[#1a1625] mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para Projetos
          </Link>
          <NewProjectForm users={users} currentUserId={session.user.id} />
        </div>
      </div>
    </div>
  )
}
