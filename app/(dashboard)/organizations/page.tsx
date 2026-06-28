import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { listOrganizations } from "@/lib/actions/organizations"
import { OrganizationsClient } from "./organizations-client"

export default async function OrganizationsPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") redirect("/dashboard")

  const orgs = await listOrganizations()

  return <OrganizationsClient initialOrgs={orgs} currentOrgId={session.user.organizationId} />
}
