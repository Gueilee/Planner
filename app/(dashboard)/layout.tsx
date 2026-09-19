import { auth } from "@/auth"
import { db } from "@/lib/db"
import { DashboardShell } from "@/components/layout/dashboard-shell"

// Server Component de propósito — resolve a identidade visual do sistema
// (OrgConfig, singleton) e o nome da FILIAL atual (Organization, pela
// organizationId da sessão) numa única leitura no servidor, embutida no
// HTML inicial. Antes esses dois dados eram buscados no cliente
// (fetch()/useEffect em DashboardShell) — funcionava bem na maioria das
// telas, mas numa tela pesada como o Cronograma (muitos outros componentes
// buscando dado ao mesmo tempo) o fetch do nome da filial podia nunca
// vencer a tempo, e o selo "em qual filial você está" simplesmente não
// aparecia. Buscar aqui garante que sempre chega pronto.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  const [orgConfig, currentOrg] = await Promise.all([
    db.orgConfig.findUnique({ where: { id: "singleton" }, select: { name: true, logoUrl: true } }),
    session?.user?.organizationId
      ? db.organization.findUnique({ where: { id: session.user.organizationId }, select: { name: true } })
      : Promise.resolve(null),
  ])

  return (
    <DashboardShell
      orgLogoUrl={orgConfig?.logoUrl ?? null}
      orgName={orgConfig?.name ?? "Planner"}
      currentOrgName={currentOrg?.name ?? null}
    >
      {children}
    </DashboardShell>
  )
}
