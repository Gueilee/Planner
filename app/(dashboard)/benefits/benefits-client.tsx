"use client"

import { useState } from "react"
import Link from "next/link"
import { BarChart3, ChevronDown, ChevronRight } from "lucide-react"
import type { ProjectBenefitMetrics } from "@/lib/types/benefits"

// ── STATUS PILL ───────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const MAP: Record<string, { label: string; color: string; bg: string }> = {
    PENDING_GO_NO_GO: { label: "Go/No-Go",      color: "#6366F1", bg: "rgba(99,102,241,0.1)" },
    PLANNING:         { label: "Planejamento",   color: "#6366F1", bg: "rgba(99,102,241,0.1)" },
    IN_PROGRESS:      { label: "Em Andamento",   color: "#3B82F6", bg: "rgba(59,130,246,0.1)" },
    PILOT:            { label: "Piloto",         color: "#8B5CF6", bg: "rgba(139,92,246,0.1)" },
    RAMP_UP:          { label: "Ramp-Up",        color: "#7B2FBE", bg: "rgba(123,47,190,0.1)" },
    GO_LIVE:          { label: "Go-Live",        color: "#0D9488", bg: "rgba(13,148,136,0.1)" },
    POST_GOLIVE:      { label: "Pós Go-Live",    color: "#0891B2", bg: "rgba(8,145,178,0.1)"  },
    COMPLETED:        { label: "Concluído",      color: "#10B981", bg: "rgba(16,185,129,0.1)" },
    ON_HOLD:          { label: "Em Espera",      color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
    PAUSED:           { label: "Pausado",        color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
    CANCELLED:        { label: "Cancelado",      color: "#EF4444", bg: "rgba(239,68,68,0.1)"  },
    FUTURE_ANALYSIS:  { label: "Análise Futura", color: "#9CA3AF", bg: "rgba(156,163,175,0.1)" },
  }
  const s = MAP[status] ?? { label: status, color: "#6B7280", bg: "rgba(107,114,128,0.1)" }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
      color: s.color, background: s.bg, whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  )
}

// ── SECTION BLOCK (collapsible) ───────────────────────────────────────────────
function Section({ title, subtitle, icon: Icon, children }: {
  title: string; subtitle?: string; icon: React.ElementType; children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{
      background: "#fff", borderRadius: 14,
      border: "1px solid rgba(0,0,0,0.07)",
      boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "14px 20px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
          borderBottom: open ? "1px solid rgba(0,0,0,0.06)" : "none",
        }}
      >
        <span style={{ width: 4, height: 32, borderRadius: 2, background: "#7B2FBE", flexShrink: 0 }} />
        <span style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: "rgba(123,47,190,0.1)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={16} style={{ color: "#7B2FBE" }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", letterSpacing: "-0.01em" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{subtitle}</div>}
        </div>
        <ChevronDown
          size={16}
          style={{ color: "#9CA3AF", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}
        />
      </button>
      {open && <div style={{ padding: "20px" }}>{children}</div>}
    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  charts: any
  projects: ProjectBenefitMetrics[]
  users: { id: string; name: string }[]
  userRole: string
}

export function BenefitsClient({ projects }: Props) {
  const withBenefits = projects.filter((p) => p.benefitCount > 0)

  return (
    <div style={{ padding: "24px 24px 40px", maxWidth: 1440, margin: "0 auto" }}>
      <Section
        title="Benefícios por Projeto"
        subtitle="Clique em Ver para acessar os detalhes de benefícios de cada projeto"
        icon={BarChart3}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                <th style={{
                  padding: "8px 12px", textAlign: "left", fontWeight: 700,
                  fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF",
                }}>
                  Projeto
                </th>
                <th style={{
                  padding: "8px 12px", textAlign: "left", fontWeight: 700,
                  fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF",
                }}>
                  Status
                </th>
                <th style={{ padding: "8px 12px" }} />
              </tr>
            </thead>
            <tbody>
              {withBenefits.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF" }}>
                    Nenhum projeto com benefícios cadastrados
                  </td>
                </tr>
              ) : withBenefits.map((p, idx) => (
                <tr
                  key={p.projectId}
                  style={{
                    borderBottom: "1px solid #F9FAFB",
                    background: idx % 2 === 0 ? "transparent" : "rgba(123,47,190,0.015)",
                  }}
                >
                  <td style={{ padding: "12px 12px" }}>
                    <span style={{
                      display: "block", fontWeight: 600, color: "#111827",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 500,
                    }}>
                      {p.projectTitle}
                    </span>
                    <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 400 }}>{p.projectArea}</span>
                  </td>
                  <td style={{ padding: "12px 12px" }}>
                    <StatusPill status={p.projectStatus} />
                  </td>
                  <td style={{ padding: "12px 12px", textAlign: "right" }}>
                    <Link
                      href={`/projects/${p.projectId}/benefits`}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        color: "#7B2FBE", fontWeight: 600, fontSize: 12, textDecoration: "none",
                      }}
                    >
                      Ver <ChevronRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {withBenefits.length > 0 && (
          <div style={{
            marginTop: 12, paddingTop: 12, borderTop: "1px solid #F3F4F6",
            fontSize: 12, color: "#9CA3AF",
          }}>
            {withBenefits.length} projeto{withBenefits.length !== 1 ? "s" : ""} com benefícios cadastrados
          </div>
        )}
      </Section>
    </div>
  )
}
