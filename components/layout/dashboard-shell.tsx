"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/layout/sidebar"

// Extraído de app/(dashboard)/layout.tsx (Fase de correção do selo de
// filial): só a parte que precisa ser client (colapsar/expandir o menu,
// lembrado no localStorage) — os dados (logo/nome do sistema, nome da
// filial atual) agora chegam prontos por prop, resolvidos no servidor pelo
// próprio layout. Antes eram buscados aqui via fetch()/useEffect, o que
// numa tela pesada como o Cronograma (dezenas de outros componentes
// buscando dados ao mesmo tempo) podia nunca terminar de resolver a tempo
// — o selo de filial simplesmente não aparecia nessas telas.
export function DashboardShell({ children, orgLogoUrl, orgName, currentOrgName }: {
  children: React.ReactNode
  orgLogoUrl: string | null
  orgName: string
  currentOrgName: string | null
}) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed")
    if (stored) setCollapsed(stored === "true")
  }, [])

  const handleToggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev))
      return !prev
    })
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#F1F5F9" }}>
      <Sidebar
        collapsed={collapsed}
        onToggle={handleToggle}
        orgLogoUrl={orgLogoUrl}
        orgName={orgName}
        currentOrgName={currentOrgName}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
