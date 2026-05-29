"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/layout/sidebar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed,   setCollapsed]   = useState(false)
  const [orgLogoUrl,  setOrgLogoUrl]  = useState<string | null>(null)
  const [orgName,     setOrgName]     = useState<string>("Planner")

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed")
    if (stored) setCollapsed(stored === "true")
  }, [])

  useEffect(() => {
    fetch("/api/org-config")
      .then((r) => r.json() as Promise<{ name?: string; logoUrl?: string | null }>)
      .then((cfg) => {
        if (cfg.logoUrl) setOrgLogoUrl(cfg.logoUrl)
        if (cfg.name)    setOrgName(cfg.name)
      })
      .catch(() => {})
  }, [])

  const handleToggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev))
      return !prev
    })
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#F1F5F9" }}>
      <Sidebar collapsed={collapsed} onToggle={handleToggle} orgLogoUrl={orgLogoUrl} orgName={orgName} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
