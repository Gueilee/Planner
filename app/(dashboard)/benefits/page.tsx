import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { getPortfolioBenefits } from "@/lib/actions/benefits"
import { BenefitsClient } from "./benefits-client"
import { db } from "@/lib/db"

export const dynamic  = "force-dynamic"
export const metadata = { title: "Benefícios e Valor Gerado" }

export default async function BenefitsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [data, users] = await Promise.all([
    getPortfolioBenefits(),
    db.user.findMany({
      where: { active: true, organizationId: session.user.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Benefícios e Valor Gerado"
        subtitle="Ganhos financeiros, operacionais e estratégicos gerados pelos projetos"
      />
      <div className="flex-1 overflow-auto">
        <BenefitsClient
          summary={data.summary}
          charts={data.charts}
          projects={data.projects}
          users={users}
          userRole={session.user.role ?? "PROJECT_MEMBER"}
        />
      </div>
    </div>
  )
}
