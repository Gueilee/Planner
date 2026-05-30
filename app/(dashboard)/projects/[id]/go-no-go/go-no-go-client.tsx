"use client"

import { useState, useTransition, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, ChevronRight, Maximize2, Minimize2, ArrowLeft,
  Loader2, Calendar, DollarSign, AlertTriangle, Target, Users,
  Building2, Globe, CheckCircle2, XCircle, PauseCircle,
  TrendingUp, Clock, Lightbulb, Shield,
} from "lucide-react"
import { format, differenceInDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import Link from "next/link"
import { saveGoNoGoDecision } from "@/lib/actions/go-no-go"
import type { NewParticipant } from "@/components/meeting-new-participant"
import type { PickerUser } from "@/components/meeting-participant-picker"
import { MeetingParticipantPicker } from "@/components/meeting-participant-picker"

// ── Types ─────────────────────────────────────────────────────────────────────

type Decision = "GO" | "NO_GO" | "STAND_BY"
type RiskItem = { description: string; level: "LOW" | "MEDIUM" | "HIGH"; mitigation: string }
type FileAttachment = { name: string; url: string; size: number }
type AttendeeUser = { id: string; name: string; department: string | null; role: string }

type ProjectData = {
  id: string
  title: string
  status: string
  origin: string | null
  scope: string | null
  asIs: string | null
  toBe: string | null
  assumptions: string | null
  restrictions: string | null
  expectedStart:  string | null
  expectedEnd:    string | null
  suggestedStart: string | null
  suggestedEnd:   string | null
  economy: number | null
  estimatedCosts: number | null
  budget: number | null
  risks: RiskItem[]
  sponsor: { name: string; department: string | null } | null
  members: { role: string; user: { id: string; name: string; department: string | null } }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return "Não definido"
  return format(new Date(d), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
}

function fmtDateShort(d: string | null): string {
  if (!d) return "—"
  return format(new Date(d), "dd MMM yyyy", { locale: ptBR })
}

function fmtCurrency(v: number | null): string {
  if (!v && v !== 0) return "—"
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ORIGIN_LABELS: Record<string, string> = {
  INTERNAL: "Demanda Interna",
  SPONSOR: "Liderança",
  CLIENT: "Cliente Externo",
}

const ORIGIN_ICONS: Record<string, typeof Building2> = {
  INTERNAL: Building2,
  SPONSOR: Lightbulb,
  CLIENT: Globe,
}

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  LOW:    { label: "Baixo",  color: "#10B981", bg: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.30)" },
  MEDIUM: { label: "Médio",  color: "#F59E0B", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)" },
  HIGH:   { label: "Alto",   color: "#EF4444", bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.30)" },
}

const VOTE_CONFIG: Record<Decision, {
  label: string; sublabel: string; desc: string
  color: string; glow: string; glowStrong: string
  icon: typeof CheckCircle2; bg: string; border: string
}> = {
  GO: {
    label: "GO",
    sublabel: "Projeto Aprovado",
    desc: "O projeto segue para execução",
    color: "#10B981",
    glow: "rgba(16,185,129,0.20)",
    glowStrong: "rgba(16,185,129,0.45)",
    icon: CheckCircle2,
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.35)",
  },
  STAND_BY: {
    label: "STAND BY",
    sublabel: "Colocar em Espera",
    desc: "Aguardará melhor momento",
    color: "#F59E0B",
    glow: "rgba(245,158,11,0.20)",
    glowStrong: "rgba(245,158,11,0.45)",
    icon: PauseCircle,
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.35)",
  },
  NO_GO: {
    label: "NO-GO",
    sublabel: "Análise Futura",
    desc: "O projeto fica salvo para o momento certo",
    color: "#EF4444",
    glow: "rgba(239,68,68,0.20)",
    glowStrong: "rgba(239,68,68,0.45)",
    icon: XCircle,
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.35)",
  },
}

const SUCCESS_CONFIG: Record<Decision, {
  icon: typeof CheckCircle2
  color: string
  glow: string
  title: string
  subtitle: string
  badge: string
}> = {
  GO: {
    icon: CheckCircle2,
    color: "#10B981",
    glow: "rgba(16,185,129,0.45)",
    title: "GO — Projeto Aprovado!",
    subtitle: "O projeto entrou no roadmap com status Em Planejamento.",
    badge: "Em Planejamento",
  },
  STAND_BY: {
    icon: PauseCircle,
    color: "#F59E0B",
    glow: "rgba(245,158,11,0.45)",
    title: "STAND BY",
    subtitle: "Projeto pausado. Aguardará o momento ideal para execução.",
    badge: "Em Espera",
  },
  NO_GO: {
    icon: Clock,
    color: "#7C3AED",
    glow: "rgba(124,58,237,0.45)",
    title: "Análise Futura",
    subtitle: "O projeto foi salvo e pode ser retomado quando o momento for ideal.",
    badge: "Análise Futura",
  },
}

// ── Slide wrapper ─────────────────────────────────────────────────────────────

function Card({ children, accent, className }: {
  children: React.ReactNode
  accent?: string
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        background: "rgba(15,23,42,0.75)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "24px",
        overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ height: "2px", background: accent ?? "linear-gradient(90deg, #7B2FBE 0%, #2463FF 60%, transparent 100%)" }} />
      <div style={{ padding: "2.5rem 3rem" }}>
        {children}
      </div>
    </div>
  )
}

function SlideLabel({ icon: Icon, label, color }: { icon: typeof Target; label: string; color?: string }) {
  const c = color ?? "#7B2FBE"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1.75rem" }}>
      <div style={{
        width: "32px", height: "32px", borderRadius: "10px",
        background: `${c}22`, border: `1px solid ${c}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={16} style={{ color: c }} />
      </div>
      <span style={{
        fontSize: "11px", fontWeight: 800, letterSpacing: "0.18em",
        textTransform: "uppercase", color: "rgba(248,250,252,0.45)",
      }}>
        {label}
      </span>
    </div>
  )
}

function ContentBlock({ text, color }: { text: string; color?: string }) {
  const c = color ?? "rgba(123,47,190,0.25)"
  return (
    <div style={{
      background: c,
      border: `1px solid ${color ? color.replace("0.25", "0.35") : "rgba(123,47,190,0.35)"}`,
      borderLeft: `3px solid ${color ? color.replace("0.25", "0.8") : "#7B2FBE"}`,
      borderRadius: "12px",
      padding: "1.25rem 1.5rem",
    }}>
      <p style={{ color: "rgba(248,250,252,0.85)", fontSize: "15px", lineHeight: "1.75", margin: 0 }}>
        {text}
      </p>
    </div>
  )
}

// ── Individual Slides ─────────────────────────────────────────────────────────

function SlideCover({ project, stakeholderAreas }: { project: ProjectData; stakeholderAreas: string[] }) {
  const OriginIcon = ORIGIN_ICONS[project.origin ?? ""] ?? Building2
  const today = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })

  return (
    <Card accent="linear-gradient(90deg, #7B2FBE 0%, #2463FF 50%, #00C4E0 100%)">
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        {/* Top label */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            padding: "4px 14px", borderRadius: "999px",
            background: "rgba(123,47,190,0.18)",
            border: "1px solid rgba(123,47,190,0.40)",
          }}>
            <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.2em", color: "#C084FC", textTransform: "uppercase" }}>
              Reunião Go / No-Go
            </span>
          </div>
          <div style={{
            padding: "4px 14px", borderRadius: "999px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}>
            <span style={{ fontSize: "10px", fontWeight: 600, color: "rgba(248,250,252,0.40)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {today}
            </span>
          </div>
        </div>

        {/* Title */}
        <div>
          <h1 style={{
            fontSize: "clamp(1.75rem, 4vw, 3rem)", fontWeight: 900, lineHeight: 1.1,
            background: "linear-gradient(135deg, #f8fafc 30%, #C084FC 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text", margin: 0,
          }}>
            {project.title}
          </h1>
          <div style={{
            marginTop: "0.75rem", height: "3px", width: "80px",
            background: "linear-gradient(90deg, #7B2FBE, #2463FF)",
            borderRadius: "999px",
          }} />
        </div>

        {/* Meta chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {[
            ...(project.origin ? [{ icon: OriginIcon, label: ORIGIN_LABELS[project.origin] ?? project.origin, color: "#C084FC" }] : []),
            ...(project.sponsor ? [{ icon: Users, label: `Sponsor: ${project.sponsor.name}`, color: "#60A5FA" }] : []),
            ...(project.sponsor?.department
              ? [{ icon: Building2, label: project.sponsor.department, color: "#34D399" }]
              : []),
          ].map(({ icon: Icon, label, color }, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: "7px",
              padding: "6px 14px", borderRadius: "999px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}>
              <Icon size={13} style={{ color }} />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(248,250,252,0.75)" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Stakeholder areas */}
        {stakeholderAreas.length > 0 && (
          <div>
            <p style={{ fontSize: "10px", fontWeight: 700, color: "rgba(248,250,252,0.30)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "10px" }}>
              Áreas Envolvidas
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {stakeholderAreas.map((area, i) => (
                <span key={i} style={{
                  padding: "3px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 600,
                  background: "rgba(36,99,255,0.12)", border: "1px solid rgba(36,99,255,0.25)",
                  color: "#93C5FD",
                }}>
                  {area}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Members */}
        {project.members.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "-4px", paddingTop: "0.5rem" }}>
            {project.members.slice(0, 6).map((m, i) => (
              <div key={i} style={{
                width: "36px", height: "36px", borderRadius: "50%",
                background: `hsl(${(i * 60 + 240) % 360}, 60%, 35%)`,
                border: "2px solid rgba(15,23,42,0.9)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "12px", fontWeight: 800, color: "white",
                marginLeft: i > 0 ? "-8px" : "0",
                zIndex: 10 - i,
              }}>
                {m.user.name.charAt(0).toUpperCase()}
              </div>
            ))}
            <span style={{ marginLeft: "12px", fontSize: "12px", color: "rgba(248,250,252,0.45)", fontWeight: 600 }}>
              {project.members.length} membro{project.members.length !== 1 ? "s" : ""} no projeto
            </span>
          </div>
        )}
      </div>
    </Card>
  )
}

function SlideAsIs({ asIs }: { asIs: string }) {
  return (
    <Card accent="linear-gradient(90deg, #F59E0B 0%, #EF4444 60%, transparent 100%)">
      <SlideLabel icon={AlertTriangle} label="Situação Atual — AS IS" color="#F59E0B" />
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{
          fontSize: "1.75rem", fontWeight: 900, color: "#f8fafc", margin: "0 0 0.5rem",
          background: "linear-gradient(135deg, #FCD34D, #F97316)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
        }}>
          Qual é o problema hoje?
        </h2>
        <p style={{ fontSize: "13px", color: "rgba(248,250,252,0.35)", margin: 0 }}>
          Contexto e situação atual que justifica este projeto
        </p>
      </div>
      <ContentBlock text={asIs} color="rgba(245,158,11,0.15)" />
    </Card>
  )
}

function SlideToBe({ toBe }: { toBe: string }) {
  return (
    <Card accent="linear-gradient(90deg, #10B981 0%, #2463FF 60%, transparent 100%)">
      <SlideLabel icon={Target} label="Objetivo — TO BE" color="#10B981" />
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{
          fontSize: "1.75rem", fontWeight: 900, margin: "0 0 0.5rem",
          background: "linear-gradient(135deg, #6EE7B7, #2463FF)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
        }}>
          Para onde vamos?
        </h2>
        <p style={{ fontSize: "13px", color: "rgba(248,250,252,0.35)", margin: 0 }}>
          Resultado esperado ao final da execução do projeto
        </p>
      </div>
      <ContentBlock text={toBe} color="rgba(16,185,129,0.12)" />
    </Card>
  )
}

function SlideScope({ scope, stakeholderAreas }: { scope: string; stakeholderAreas: string[] }) {
  return (
    <Card>
      <SlideLabel icon={Lightbulb} label="Escopo do Projeto" color="#2463FF" />
      <h2 style={{
        fontSize: "1.75rem", fontWeight: 900, marginBottom: "1.25rem",
        background: "linear-gradient(135deg, #93C5FD, #C084FC)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
      }}>
        O que está no escopo?
      </h2>
      <ContentBlock text={scope} color="rgba(36,99,255,0.12)" />
      {stakeholderAreas.length > 0 && (
        <div style={{ marginTop: "1.75rem" }}>
          <p style={{ fontSize: "10px", fontWeight: 700, color: "rgba(248,250,252,0.30)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "10px" }}>
            Stakeholders Envolvidos
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {stakeholderAreas.map((area, i) => (
              <span key={i} style={{
                padding: "4px 14px", borderRadius: "999px", fontSize: "12px", fontWeight: 600,
                background: "rgba(123,47,190,0.12)", border: "1px solid rgba(123,47,190,0.25)",
                color: "#C084FC",
              }}>
                {area}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function SlideConstraints({ assumptions, restrictions }: { assumptions: string | null; restrictions: string | null }) {
  return (
    <Card>
      <SlideLabel icon={Shield} label="Premissas & Restrições" color="#8B5CF6" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {assumptions && (
          <div>
            <div style={{
              display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem",
              padding: "8px 14px", borderRadius: "10px",
              background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.25)",
              width: "fit-content",
            }}>
              <CheckCircle2 size={14} style={{ color: "#10B981" }} />
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#6EE7B7", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Premissas
              </span>
            </div>
            <p style={{ color: "rgba(248,250,252,0.75)", fontSize: "14px", lineHeight: "1.75", margin: 0 }}>
              {assumptions}
            </p>
          </div>
        )}
        {restrictions && (
          <div>
            <div style={{
              display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem",
              padding: "8px 14px", borderRadius: "10px",
              background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)",
              width: "fit-content",
            }}>
              <AlertTriangle size={14} style={{ color: "#F59E0B" }} />
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#FCD34D", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Restrições
              </span>
            </div>
            <p style={{ color: "rgba(248,250,252,0.75)", fontSize: "14px", lineHeight: "1.75", margin: 0 }}>
              {restrictions}
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}

function DateColumn({
  label, sublabel, start, end, accentColor, borderColor, textColor,
}: {
  label: string; sublabel?: string
  start: string | null; end: string | null
  accentColor: string; borderColor: string; textColor: string
}) {
  const duration = start && end ? differenceInDays(new Date(end), new Date(start)) : null
  return (
    <div style={{
      background: `${accentColor}0d`, border: `1px solid ${borderColor}`,
      borderRadius: "16px", padding: "1.25rem 1.5rem", flex: 1,
    }}>
      <div style={{ marginBottom: "1rem" }}>
        <p style={{ fontSize: "10px", fontWeight: 800, color: textColor, letterSpacing: "0.15em", textTransform: "uppercase", margin: "0 0 2px" }}>
          {label}
        </p>
        {sublabel && (
          <p style={{ fontSize: "10px", color: "rgba(248,250,252,0.30)", margin: 0 }}>{sublabel}</p>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {[
          { key: "Início",   value: fmtDateShort(start) },
          { key: "Término",  value: fmtDateShort(end) },
          { key: "Duração",  value: duration !== null ? `${duration} dias` : "—" },
        ].map(({ key, value }) => (
          <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "10px", color: "rgba(248,250,252,0.35)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>{key}</span>
            <span style={{ fontSize: "13px", fontWeight: 800, color: textColor }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SlideTimeline({
  start, end, suggestedStart, suggestedEnd,
}: {
  start: string | null; end: string | null
  suggestedStart: string | null; suggestedEnd: string | null
}) {
  const hasSuggestion = suggestedStart || suggestedEnd

  // Delta in days between suggested end and requested end
  const delta = (end && suggestedEnd)
    ? differenceInDays(new Date(suggestedEnd), new Date(end))
    : null

  return (
    <Card accent="linear-gradient(90deg, #2463FF 0%, #00C4E0 60%, transparent 100%)">
      <SlideLabel icon={Calendar} label="Cronograma — Análise de Prazo" color="#2463FF" />

      <div style={{ display: "flex", gap: "1.5rem", marginBottom: hasSuggestion ? "1.5rem" : "2rem" }}>
        {/* Prazo solicitado */}
        <DateColumn
          label="Prazo Solicitado"
          sublabel="Pelo solicitante na abertura"
          start={start} end={end}
          accentColor="#64748B" borderColor="rgba(100,116,139,0.25)" textColor="rgba(248,250,252,0.60)"
        />

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", padding: "0 0.25rem" }}>
          <div style={{ width: "1px", height: "100%", background: "rgba(255,255,255,0.08)" }} />
        </div>

        {/* Sugestão do time */}
        <DateColumn
          label="Sugestão do Time"
          sublabel={hasSuggestion ? "Após análise do planejamento" : "Não preenchida"}
          start={suggestedStart} end={suggestedEnd}
          accentColor="#2463FF" borderColor="rgba(36,99,255,0.35)" textColor="#93C5FD"
        />
      </div>

      {/* Delta chip */}
      {delta !== null && (
        <div style={{ marginBottom: "1.5rem" }}>
          {delta === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderRadius: "12px", background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.25)" }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10B981" }} />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#6EE7B7" }}>
                Prazo sugerido alinhado com o solicitado
              </span>
            </div>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderRadius: "12px",
              background: delta > 0 ? "rgba(245,158,11,0.10)" : "rgba(16,185,129,0.10)",
              border: `1px solid ${delta > 0 ? "rgba(245,158,11,0.30)" : "rgba(16,185,129,0.25)"}`,
            }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: delta > 0 ? "#F59E0B" : "#10B981" }} />
              <span style={{ fontSize: "13px", fontWeight: 700, color: delta > 0 ? "#FCD34D" : "#6EE7B7" }}>
                {delta > 0
                  ? `Sugestão estende o prazo em ${delta} dia${delta !== 1 ? "s" : ""} — a discutir na reunião`
                  : `Sugestão antecipa o prazo em ${Math.abs(delta)} dia${Math.abs(delta) !== 1 ? "s" : ""}`
                }
              </span>
            </div>
          )}
        </div>
      )}

      {/* Timeline bar based on requested dates */}
      {(start || end) && (
        <div>
          <p style={{ fontSize: "12px", color: "rgba(248,250,252,0.30)", textAlign: "center" }}>
            Prazo solicitado: {fmtDate(start)} &nbsp;→&nbsp; {fmtDate(end)}
          </p>
        </div>
      )}
    </Card>
  )
}

function SlideFinancial({ budget, costs, economy }: { budget: number | null; costs: number | null; economy: number | null }) {
  const roi = budget && budget > 0 && economy ? Math.round((economy / budget) * 100) : null

  const cards = [
    { label: "Budget Aprovado", value: fmtCurrency(budget), icon: DollarSign, color: "#10B981", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.25)" },
    { label: "Custo Estimado",  value: fmtCurrency(costs),  icon: TrendingUp,  color: "#F59E0B", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.25)" },
    { label: "Economia Esperada", value: fmtCurrency(economy), icon: Target, color: "#2463FF", bg: "rgba(36,99,255,0.10)", border: "rgba(36,99,255,0.25)" },
  ].filter(c => c.value !== "—")

  return (
    <Card accent="linear-gradient(90deg, #10B981 0%, #2463FF 50%, transparent 100%)">
      <SlideLabel icon={DollarSign} label="Análise Financeira" color="#10B981" />
      <h2 style={{
        fontSize: "1.75rem", fontWeight: 900, marginBottom: "2rem",
        background: "linear-gradient(135deg, #6EE7B7, #93C5FD)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
      }}>
        Projeção Financeira do Projeto
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cards.length}, 1fr)`, gap: "1.25rem", marginBottom: roi ? "1.75rem" : 0 }}>
        {cards.map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} style={{
            background: bg, border: `1px solid ${border}`,
            borderRadius: "16px", padding: "1.25rem 1.5rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <Icon size={15} style={{ color }} />
              <span style={{ fontSize: "10px", fontWeight: 700, color: "rgba(248,250,252,0.40)", textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</span>
            </div>
            <p style={{ fontSize: "1.4rem", fontWeight: 900, color, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {roi !== null && (
        <div style={{
          display: "flex", alignItems: "center", gap: "12px",
          padding: "1rem 1.5rem", borderRadius: "12px",
          background: "rgba(123,47,190,0.12)", border: "1px solid rgba(123,47,190,0.25)",
        }}>
          <TrendingUp size={18} style={{ color: "#C084FC" }} />
          <span style={{ fontSize: "14px", fontWeight: 700, color: "rgba(248,250,252,0.75)" }}>
            Retorno sobre Investimento (ROI) esperado:
          </span>
          <span style={{
            marginLeft: "auto", fontSize: "1.5rem", fontWeight: 900,
            background: "linear-gradient(135deg, #C084FC, #93C5FD)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            {roi}%
          </span>
        </div>
      )}
    </Card>
  )
}

function SlideRisks({ risks }: { risks: RiskItem[] }) {
  return (
    <Card accent="linear-gradient(90deg, #EF4444 0%, #F59E0B 60%, transparent 100%)">
      <SlideLabel icon={AlertTriangle} label="Riscos Identificados" color="#EF4444" />
      <h2 style={{
        fontSize: "1.75rem", fontWeight: 900, marginBottom: "1.5rem",
        background: "linear-gradient(135deg, #FCA5A5, #FCD34D)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
      }}>
        {risks.length} risco{risks.length !== 1 ? "s" : ""} identificado{risks.length !== 1 ? "s" : ""}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "340px", overflowY: "auto" }}>
        {risks.map((risk, i) => {
          const cfg = RISK_CONFIG[risk.level] ?? RISK_CONFIG.MEDIUM
          return (
            <div key={i} style={{
              background: cfg.bg, border: `1px solid ${cfg.border}`,
              borderLeft: `3px solid ${cfg.color}`,
              borderRadius: "12px", padding: "1rem 1.25rem",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: risk.mitigation ? "8px" : 0 }}>
                <p style={{ color: "rgba(248,250,252,0.85)", fontSize: "14px", fontWeight: 600, margin: 0, flex: 1, lineHeight: "1.5" }}>
                  {risk.description}
                </p>
                <span style={{
                  padding: "3px 10px", borderRadius: "999px", fontSize: "10px", fontWeight: 800,
                  color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
                  whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {cfg.label}
                </span>
              </div>
              {risk.mitigation && (
                <p style={{ fontSize: "12px", color: "rgba(248,250,252,0.45)", margin: 0 }}>
                  <span style={{ fontWeight: 700, color: "rgba(248,250,252,0.55)" }}>Mitigação:</span> {risk.mitigation}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}


function SlideDecision({
  decision, onDecision, attendees, onChangeAttendees,
  extraAttendees, onAddExtra, onRemoveExtra,
  notes, onNotes, observations, onObservations, meetingDate, onMeetingDate,
  projectParticipants, allUsers, onSubmit, isPending, submitted,
}: {
  decision: Decision | null
  onDecision: (d: Decision) => void
  attendees: string[]
  onChangeAttendees: (ids: string[]) => void
  extraAttendees: NewParticipant[]
  onAddExtra: (p: NewParticipant) => void
  onRemoveExtra: (id: string) => void
  notes: string
  onNotes: (v: string) => void
  observations: string
  onObservations: (v: string) => void
  meetingDate: string
  onMeetingDate: (v: string) => void
  projectParticipants: PickerUser[]
  allUsers: PickerUser[]
  onSubmit: () => void
  isPending: boolean
  submitted: boolean
}) {
  if (submitted) return null

  return (
    <Card accent="linear-gradient(90deg, #7B2FBE 0%, #EF4444 40%, #F59E0B 70%, #10B981 100%)">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5rem", alignItems: "start" }}>
        {/* Left: form fields */}
        <div>
          <SlideLabel icon={Users} label="Configurar Reunião" color="#7B2FBE" />

          {/* Meeting date */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "rgba(248,250,252,0.45)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "8px" }}>
              Data da Reunião
            </label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => onMeetingDate(e.target.value)}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: "10px", fontSize: "14px",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                color: "#f8fafc", outline: "none", cursor: "pointer",
                colorScheme: "dark",
              }}
            />
          </div>

          {/* Participantes — picker moderno */}
          <div style={{ marginBottom: "1.5rem" }}>
            <MeetingParticipantPicker
              projectParticipants={projectParticipants}
              allUsers={allUsers}
              selectedIds={attendees}
              onChange={onChangeAttendees}
              externalAttendees={extraAttendees}
              onAddExternal={onAddExtra}
              onRemoveExternal={onRemoveExtra}
            />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "rgba(248,250,252,0.45)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "8px" }}>
              Observações da Decisão
            </label>
            <textarea
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              rows={3}
              placeholder="Registre as observações, condições ou justificativas..."
              style={{
                width: "100%", padding: "10px 14px", borderRadius: "10px", fontSize: "13px",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                color: "#f8fafc", outline: "none", resize: "vertical", fontFamily: "inherit",
                lineHeight: "1.6",
              }}
            />
          </div>

          {/* Observations */}
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "rgba(248,250,252,0.45)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "8px" }}>
              Observações
            </label>
            <textarea
              value={observations}
              onChange={(e) => onObservations(e.target.value)}
              rows={3}
              placeholder="Comentários livres sobre esta reunião (aparecerá na ATA)..."
              style={{
                width: "100%", padding: "10px 14px", borderRadius: "10px", fontSize: "13px",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                color: "#f8fafc", outline: "none", resize: "vertical", fontFamily: "inherit",
                lineHeight: "1.6",
              }}
            />
          </div>
        </div>

        {/* Right: vote */}
        <div>
          <SlideLabel icon={Target} label="Registrar Decisão" color="#10B981" />

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "1.5rem" }}>
            {(["GO", "STAND_BY", "NO_GO"] as Decision[]).map((opt) => {
              const cfg = VOTE_CONFIG[opt]
              const Icon = cfg.icon
              const isSelected = decision === opt
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onDecision(opt)}
                  className="gng-vote-btn"
                  style={{
                    display: "flex", alignItems: "center", gap: "14px",
                    padding: "14px 18px", borderRadius: "14px", textAlign: "left", cursor: "pointer",
                    background: isSelected ? cfg.bg : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isSelected ? cfg.border : "rgba(255,255,255,0.08)"}`,
                    boxShadow: isSelected ? `0 0 24px ${cfg.glow}, 0 0 60px ${cfg.glow}` : "none",
                    transform: isSelected ? "translateY(-2px) scale(1.02)" : "none",
                    transition: "all 0.25s cubic-bezier(0.22,1,0.36,1)",
                  }}
                >
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "12px", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isSelected ? `${cfg.color}22` : "rgba(255,255,255,0.06)",
                    border: `1px solid ${isSelected ? cfg.border : "rgba(255,255,255,0.10)"}`,
                  }}>
                    <Icon size={20} style={{ color: isSelected ? cfg.color : "rgba(248,250,252,0.35)" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{
                      fontSize: "16px", fontWeight: 900, margin: "0 0 2px",
                      color: isSelected ? cfg.color : "rgba(248,250,252,0.75)",
                    }}>
                      {cfg.label}
                    </p>
                    <p style={{ fontSize: "11px", color: "rgba(248,250,252,0.40)", margin: 0 }}>
                      {cfg.desc}
                    </p>
                  </div>
                  {isSelected && (
                    <div style={{
                      width: "8px", height: "8px", borderRadius: "50%",
                      background: cfg.color,
                      boxShadow: `0 0 8px ${cfg.color}`,
                    }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Submit button */}
          <button
            type="button"
            onClick={onSubmit}
            disabled={!decision || isPending}
            style={{
              width: "100%", padding: "14px", borderRadius: "12px",
              fontSize: "15px", fontWeight: 800, cursor: decision ? "pointer" : "not-allowed",
              background: decision
                ? `linear-gradient(135deg, ${VOTE_CONFIG[decision].color}, ${VOTE_CONFIG[decision].color}cc)`
                : "rgba(255,255,255,0.08)",
              border: "none", color: decision ? "white" : "rgba(248,250,252,0.30)",
              boxShadow: decision ? `0 8px 32px ${VOTE_CONFIG[decision].glow}` : "none",
              transition: "all 0.25s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            }}
          >
            {isPending ? (
              <><Loader2 size={17} className="animate-spin" /> Registrando decisão...</>
            ) : !decision ? (
              "Selecione uma decisão"
            ) : (
              <><CheckCircle2 size={17} /> Confirmar — {VOTE_CONFIG[decision].label}</>
            )}
          </button>
        </div>
      </div>
    </Card>
  )
}

// ── Success Screen ────────────────────────────────────────────────────────────

function SuccessScreen({ decision, projectId }: { decision: Decision; projectId: string }) {
  const cfg = SUCCESS_CONFIG[decision]
  const Icon = cfg.icon
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#030712",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "2rem", zIndex: 100,
    }}>
      {/* Background glow */}
      <div style={{
        position: "absolute", width: "500px", height: "500px", borderRadius: "50%",
        background: `radial-gradient(circle, ${cfg.glow} 0%, transparent 65%)`,
        pointerEvents: "none",
      }} />

      {/* Icon ring */}
      <div style={{
        position: "relative",
        width: "140px", height: "140px", borderRadius: "50%",
        background: `${cfg.color}12`, border: `2px solid ${cfg.color}40`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 60px ${cfg.glow}, 0 0 120px ${cfg.glow}`,
        animation: "gng-pop 0.6s cubic-bezier(0.22,1,0.36,1) forwards",
      }}>
        {/* Outer pulse ring */}
        <div style={{
          position: "absolute", inset: "-12px", borderRadius: "50%",
          border: `1px solid ${cfg.color}25`,
          animation: "gng-ring-pulse 2s ease infinite",
        }} />
        <Icon size={60} style={{ color: cfg.color }} />
      </div>

      {/* Text */}
      <div style={{ textAlign: "center", position: "relative" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "4px 16px", borderRadius: "999px", marginBottom: "1rem",
          background: `${cfg.color}18`, border: `1px solid ${cfg.color}35`,
        }}>
          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: cfg.color, boxShadow: `0 0 8px ${cfg.color}` }} />
          <span style={{ fontSize: "11px", fontWeight: 800, color: cfg.color, letterSpacing: "0.15em", textTransform: "uppercase" }}>
            {cfg.badge}
          </span>
        </div>
        <p style={{
          fontSize: "2.25rem", fontWeight: 900, margin: "0 0 10px", lineHeight: 1.1,
          background: `linear-gradient(135deg, #f8fafc, ${cfg.color})`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
        }}>
          {cfg.title}
        </p>
        <p style={{ fontSize: "15px", color: "rgba(248,250,252,0.55)", margin: "0 0 6px", maxWidth: "420px", lineHeight: 1.6 }}>
          {cfg.subtitle}
        </p>
        <p style={{
          fontSize: "12px", color: "rgba(248,250,252,0.25)", margin: 0,
          display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
        }}>
          <Loader2 size={12} className="animate-spin" style={{ color: "rgba(248,250,252,0.25)" }} />
          Redirecionando para o projeto...
        </p>
        {decision === "GO" && (
          <a
            href={`/charter/${projectId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginTop: "20px", display: "inline-flex", alignItems: "center", gap: "8px",
              padding: "10px 22px", borderRadius: "12px", fontSize: "13px", fontWeight: 700,
              background: "linear-gradient(135deg, #1E1B4B, #3730A3)",
              color: "white", textDecoration: "none",
              boxShadow: "0 4px 20px rgba(55,48,163,0.50)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            Gerar Termo de Abertura (PDF)
          </a>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function GoNoGoClient({
  project,
  projectParticipants,
  allUsers,
  currentUserId,
}: {
  project: ProjectData
  projectParticipants: PickerUser[]
  allUsers: PickerUser[]
  currentUserId: string
}) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPending, startTransition] = useTransition()

  const [slide, setSlide] = useState(0)
  const [isVisible, setIsVisible] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [decision, setDecision] = useState<Decision | null>(null)
  // Pré-seleciona todos os participantes do projeto
  const [attendees, setAttendees] = useState<string[]>(() => {
    const ids = projectParticipants.map((p) => p.id)
    return ids.includes(currentUserId) ? ids : [currentUserId, ...ids]
  })
  const [extraAttendees, setExtraAttendees] = useState<NewParticipant[]>([])
  const [notes, setNotes] = useState("")
  const [observations, setObservations] = useState("")
  const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().split("T")[0])

  const risks: RiskItem[] = project.risks

  const stakeholderAreas = project.members
    .map((m) => m.user.department)
    .filter((d): d is string => !!d)
    .filter((d, i, arr) => arr.indexOf(d) === i)

  const slideIds = [
    "cover",
    project.asIs ? "context" : null,
    project.toBe ? "proposal" : null,
    project.scope ? "scope" : null,
    (project.assumptions || project.restrictions) ? "constraints" : null,
    (project.expectedStart || project.expectedEnd || project.suggestedStart || project.suggestedEnd) ? "timeline" : null,
    (project.budget || project.estimatedCosts || project.economy) ? "financial" : null,
    risks.length > 0 ? "risks" : null,
    "decision",
  ].filter(Boolean) as string[]

  const totalSlides = slideIds.length

  const navigate = useCallback((dir: "forward" | "backward") => {
    const next = dir === "forward" ? slide + 1 : slide - 1
    if (next < 0 || next >= totalSlides) return
    setIsVisible(false)
    setTimeout(() => { setSlide(next); setIsVisible(true) }, 220)
  }, [slide, totalSlides])

  const goToSlide = useCallback((idx: number) => {
    if (idx === slide) return
    setIsVisible(false)
    setTimeout(() => { setSlide(idx); setIsVisible(true) }, 220)
  }, [slide])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return
      if (["ArrowRight", "ArrowDown", " "].includes(e.key)) { e.preventDefault(); navigate("forward") }
      if (["ArrowLeft", "ArrowUp"].includes(e.key)) { e.preventDefault(); navigate("backward") }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [navigate])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }, [])

  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", fn)
    return () => document.removeEventListener("fullscreenchange", fn)
  }, [])

  function toggleAttendee(userId: string) {
    setAttendees((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId])
  }

  function handleSubmit() {
    if (!decision) return
    startTransition(async () => {
      try {
        await saveGoNoGoDecision({
          projectId: project.id,
          decision,
          notes,
          observations,
          attendeeIds: attendees,
          meetingDate,
        })
        setSubmitted(true)
        setTimeout(() => router.push(`/projects/${project.id}`), 2500)
      } catch (err) {
        console.error(err)
      }
    })
  }

  function renderSlide(id: string) {
    switch (id) {
      case "cover":       return <SlideCover project={project} stakeholderAreas={stakeholderAreas} />
      case "context":     return <SlideAsIs asIs={project.asIs!} />
      case "proposal":    return <SlideToBe toBe={project.toBe!} />
      case "scope":       return <SlideScope scope={project.scope!} stakeholderAreas={stakeholderAreas} />
      case "constraints": return <SlideConstraints assumptions={project.assumptions} restrictions={project.restrictions} />
      case "timeline":    return <SlideTimeline start={project.expectedStart} end={project.expectedEnd} suggestedStart={project.suggestedStart} suggestedEnd={project.suggestedEnd} />
      case "financial":   return <SlideFinancial budget={project.budget} costs={project.estimatedCosts} economy={project.economy} />
      case "risks":       return <SlideRisks risks={risks} />
      case "decision":    return (
        <SlideDecision
          decision={decision} onDecision={setDecision}
          attendees={attendees} onChangeAttendees={setAttendees}
          extraAttendees={extraAttendees}
          onAddExtra={(p) => setExtraAttendees((prev) => [...prev, p])}
          onRemoveExtra={(id) => setExtraAttendees((prev) => prev.filter((e) => e.id !== id))}
          notes={notes} onNotes={setNotes}
          observations={observations} onObservations={setObservations}
          meetingDate={meetingDate} onMeetingDate={setMeetingDate}
          projectParticipants={projectParticipants} allUsers={allUsers}
          onSubmit={handleSubmit} isPending={isPending} submitted={submitted}
        />
      )
      default: return null
    }
  }

  const SLIDE_LABELS: Record<string, string> = {
    cover: "Capa", context: "AS IS", proposal: "TO BE", scope: "Escopo",
    constraints: "Premissas", timeline: "Cronograma", financial: "Financeiro",
    risks: "Riscos", decision: "Decisão",
  }

  return (
    <div ref={containerRef} style={{ background: "#030712", minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>

      {submitted && decision && <SuccessScreen decision={decision} projectId={project.id} />}

      {/* Background orbs */}
      <div className="gng-orb gng-orb-purple" />
      <div className="gng-orb gng-orb-blue" />
      <div className="gng-orb gng-orb-center" />

      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 28px", zIndex: 10,
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(3,7,18,0.8)", backdropFilter: "blur(12px)",
      }}>
        <Link
          href={`/projects/${project.id}`}
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            fontSize: "13px", fontWeight: 600, color: "rgba(248,250,252,0.45)",
            textDecoration: "none", transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(248,250,252,0.85)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(248,250,252,0.45)")}
        >
          <ArrowLeft size={15} />
          {project.title}
        </Link>

        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "6px 16px", borderRadius: "999px",
          background: "rgba(123,47,190,0.15)", border: "1px solid rgba(123,47,190,0.35)",
        }}>
          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#C084FC", boxShadow: "0 0 8px #C084FC", animation: "gng-blink 2s ease infinite" }} />
          <span style={{ fontSize: "11px", fontWeight: 800, color: "#C084FC", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            Reunião Go / No-Go
          </span>
        </div>

        <button
          onClick={toggleFullscreen}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "36px", height: "36px", borderRadius: "10px",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
            cursor: "pointer", color: "rgba(248,250,252,0.45)", transition: "all 0.15s",
          }}
          title={isFullscreen ? "Sair do modo tela cheia" : "Tela cheia"}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* Slide area */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 28px", zIndex: 5 }}>
        <div style={{ width: "100%", maxWidth: "940px" }}>
          <div
            key={slide}
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? "translateY(0) scale(1)" : "translateY(12px) scale(0.99)",
              transition: "opacity 0.25s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            {renderSlide(slideIds[slide])}
          </div>
        </div>
      </div>

      {/* Bottom navigation */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 28px", zIndex: 10,
        borderTop: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(3,7,18,0.8)", backdropFilter: "blur(12px)",
      }}>
        {/* Slide counter */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            fontSize: "11px", fontWeight: 800, color: "rgba(248,250,252,0.35)",
            letterSpacing: "0.1em", textTransform: "uppercase",
          }}>
            {SLIDE_LABELS[slideIds[slide]]}
          </span>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)" }}>·</span>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "rgba(248,250,252,0.25)" }}>
            {slide + 1} / {totalSlides}
          </span>
        </div>

        {/* Dots */}
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          {slideIds.map((id, i) => {
            const isActive = i === slide
            const isDone   = i < slide
            return (
              <button
                key={i}
                onClick={() => goToSlide(i)}
                title={SLIDE_LABELS[id]}
                style={{
                  width: isActive ? "24px" : "7px",
                  height: "7px",
                  borderRadius: "999px",
                  border: "none", cursor: "pointer",
                  background: isActive
                    ? "linear-gradient(90deg, #7B2FBE, #2463FF)"
                    : isDone
                      ? "rgba(123,47,190,0.5)"
                      : "rgba(255,255,255,0.15)",
                  transition: "all 0.25s cubic-bezier(0.22,1,0.36,1)",
                  boxShadow: isActive ? "0 0 12px rgba(123,47,190,0.6)" : "none",
                  padding: 0,
                }}
              />
            )
          })}
        </div>

        {/* Prev / Next */}
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => navigate("backward")}
            disabled={slide === 0}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 600,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
              color: slide === 0 ? "rgba(255,255,255,0.15)" : "rgba(248,250,252,0.6)",
              cursor: slide === 0 ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >
            <ChevronLeft size={15} /> Anterior
          </button>
          <button
            onClick={() => navigate("forward")}
            disabled={slide === totalSlides - 1}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 600,
              background: slide < totalSlides - 1 ? "linear-gradient(135deg, #7B2FBE, #2463FF)" : "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: slide === totalSlides - 1 ? "rgba(255,255,255,0.15)" : "white",
              cursor: slide === totalSlides - 1 ? "not-allowed" : "pointer",
              boxShadow: slide < totalSlides - 1 ? "0 4px 20px rgba(123,47,190,0.4)" : "none",
              transition: "all 0.15s",
            }}
          >
            Próximo <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <style jsx global>{`
        .gng-orb {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          animation: gng-breathe 12s ease-in-out infinite alternate;
        }
        .gng-orb-purple {
          width: 700px; height: 700px;
          background: radial-gradient(circle, rgba(123,47,190,0.16) 0%, transparent 68%);
          top: -200px; left: -200px;
          animation-delay: 0s;
        }
        .gng-orb-blue {
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(36,99,255,0.12) 0%, transparent 68%);
          bottom: -150px; right: -150px;
          animation-delay: -4s;
        }
        .gng-orb-center {
          width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(0,196,224,0.06) 0%, transparent 70%);
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          animation-delay: -8s;
        }
        @keyframes gng-breathe {
          from { transform: scale(1); opacity: 0.7; }
          to { transform: scale(1.25); opacity: 1; }
        }
        @keyframes gng-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes gng-pop {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes gng-ring-pulse {
          0% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 0.2; }
          100% { transform: scale(1); opacity: 0.6; }
        }
        .gng-vote-btn { transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1) !important; }
        .gng-vote-btn:hover { transform: translateY(-2px) !important; }
      `}</style>
    </div>
  )
}
