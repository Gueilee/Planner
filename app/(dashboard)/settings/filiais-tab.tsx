"use client"

import { OrganizationsClient } from "@/app/(dashboard)/organizations/organizations-client"
import type { OrgRow } from "@/lib/actions/organizations"

interface Props {
  initialOrgs:  OrgRow[]
  currentOrgId: string
}

export function FiliaisTab({ initialOrgs, currentOrgId }: Props) {
  return (
    <OrganizationsClient
      initialOrgs={initialOrgs}
      currentOrgId={currentOrgId}
    />
  )
}
