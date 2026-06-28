"use client"

import { useState, useCallback, useTransition, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowLeft, Save, Play, Plus, Trash2, GripVertical, Loader2,
  X, ChevronDown, Check, Sparkles, Target, Users, Calendar,
  BarChart3, AlertTriangle, BookOpen, Layers, MapPin,
  Building2, Star, Phone, Mail, Clock, Rocket, MessageSquare,
  TrendingUp, Shield, CheckCircle2, Presentation, ImageIcon, Upload,
} from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { saveKickOffPresentation } from "@/lib/actions/kickoff-presentation"
import type {
  KOSlide, KOSlideType, KOPresentation,
  KOTeamMember, KORisk, KOEapArea, KOSuccessFactor, KOContact,
  KOAgendaItem, KOTimelineItem, KOFinancialCard,
} from "@/lib/types/kickoff-presentation"
import type { KickOffData } from "@/lib/types/kickoff"

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskItem = { description: string; level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; mitigation: string }

type ProjectData = {
  id: string; title: string; description: string | null; status: string
  origin: string | null; scope: string | null; asIs: string | null; toBe: string | null
  assumptions: string | null; restrictions: string | null
  expectedStart: string | null; expectedEnd: string | null
  economy: number | null; estimatedCosts: number | null; budget: number | null
  sponsor: { name: string; department: string | null } | null
  risks: RiskItem[]
  members: { role: string; user: { id: string; name: string; department: string | null; role: string; email: string | null } }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

function nanoid() { return Math.random().toString(36).slice(2, 10) }

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

const RISK_COLOR: Record<string, { bg: string; text: string; label: string }> = {
  CRITICAL: { bg: "#FEE2E2", text: "#991B1B", label: "Crítico" },
  HIGH:     { bg: "#FEF3C7", text: "#92400E", label: "Alto"    },
  MEDIUM:   { bg: "#DBEAFE", text: "#1E40AF", label: "Médio"   },
  LOW:      { bg: "#D1FAE5", text: "#065F46", label: "Baixo"   },
}

const SLIDE_META: Record<KOSlideType, { label: string; icon: typeof Target; color: string; desc: string }> = {
  cover:       { label: "Capa",               icon: Rocket,        color: "#7B2FBE", desc: "Abertura do Kick-Off"        },
  agenda:      { label: "Agenda",             icon: BookOpen,      color: "#2463FF", desc: "Pauta da reunião"            },
  objectives:  { label: "Objetivos",          icon: Target,        color: "#059669", desc: "Expectativas do projeto"     },
  about:       { label: "Sobre Vendemmia",    icon: Building2,     color: "#D97706", desc: "Cultura e valores"           },
  methodology: { label: "Metodologia",        icon: Layers,        color: "#7C3AED", desc: "Metodologia de gestão"       },
  team:        { label: "Organograma",        icon: Users,         color: "#0891B2", desc: "Equipe do projeto"           },
  scope:       { label: "Escopo",             icon: MapPin,        color: "#10B981", desc: "AS-IS / TO-BE"               },
  eap:         { label: "EAP",               icon: BarChart3,     color: "#6366F1", desc: "Estrutura analítica"         },
  timeline:    { label: "Cronograma",         icon: Calendar,      color: "#F59E0B", desc: "Macro cronograma"            },
  financial:   { label: "Financeiro",         icon: TrendingUp,    color: "#047857", desc: "Análise financeira"          },
  risks:       { label: "Riscos",             icon: AlertTriangle, color: "#DC2626", desc: "Riscos identificados"        },
  success:     { label: "Fat. Críticos",      icon: Star,          color: "#7C3AED", desc: "Fatores críticos de sucesso" },
  contacts:    { label: "Contatos",           icon: Phone,         color: "#0891B2", desc: "Líderes do projeto"          },
  closing:     { label: "Encerramento",       icon: Sparkles,      color: "#BE185D", desc: "Dúvidas e agradecimentos"    },
  content:     { label: "Conteúdo",           icon: MessageSquare, color: "#64748B", desc: "Texto livre"                 },
  bullets:     { label: "Tópicos",            icon: CheckCircle2,  color: "#64748B", desc: "Lista de pontos"             },
}

const DEFAULT_SUCCESS_FACTORS: KOSuccessFactor[] = [
  { category: "Comprometimento da Equipe",       description: "Todos os membros devem estar alinhados com os objetivos e prazos do projeto." },
  { category: "Gestão Proativa de Riscos",       description: "Riscos e problemas devem ser comunicados prontamente para ações corretivas." },
  { category: "Documentação dos Marcos",         description: "Milestones devem ser registrados formalmente via ferramentas de gestão." },
  { category: "Consideração de Restrições",      description: "Restrições (auditorias, fechamentos) devem ser informadas antecipadamente." },
  { category: "Engajamento dos Usuários",        description: "Usuários convocados devem participar ativamente ou indicar substitutos qualificados." },
  { category: "Comunicação Clara e Transparente",description: "Criar ambiente aberto para dúvidas, críticas e sugestões construtivas." },
]

// ─── Auto-generation ──────────────────────────────────────────────────────────

function generateSlides(project: ProjectData, kickoff: KickOffData | null): KOSlide[] {
  const slides: KOSlide[] = []
  const meetingDate = kickoff?.meetingDate
    ? format(new Date(kickoff.meetingDate + "T00:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })

  // 1. Cover
  slides.push({
    id: nanoid(), type: "cover",
    title:    project.title,
    subtitle: `Reunião de Kick-Off · ${meetingDate}`,
    content:  kickoff?.location ?? "",
    notes:    "Apresentar o projeto e alinhar expectativas com toda a equipe.",
  })

  // 2. Agenda
  const agendaItems: KOAgendaItem[] = [
    { icon: "target",   label: "Objetivo do Projeto",           description: "Expectativas, benefícios e escopo" },
    { icon: "building", label: "Sobre a Vendemmia",             description: "Cultura, valores e metodologia" },
    { icon: "users",    label: "Organograma do Projeto",        description: "Equipe e responsabilidades" },
    { icon: "layers",   label: "EAP — Estrutura Analítica",     description: "Áreas e atividades do projeto" },
    { icon: "calendar", label: "Macro Cronograma",              description: "Fases e marcos principais" },
    { icon: "star",     label: "Fatores Críticos de Sucesso",   description: "O que é essencial para o sucesso" },
  ]
  slides.push({ id: nanoid(), type: "agenda", title: "Agenda", agendaItems })

  // 3. Objectives
  const benefitsBullets: string[] = []
  if (project.description) benefitsBullets.push(project.description)
  if (project.origin)      benefitsBullets.push(project.origin)
  slides.push({
    id: nanoid(), type: "objectives",
    title:   "Expectativas com o Projeto",
    content: kickoff?.objectives ?? project.scope ?? "",
    bullets: benefitsBullets,
  })

  // 4. About Vendemmia (static)
  slides.push({
    id: nanoid(), type: "about",
    title: "Sobre a Vendemmia",
    bullets: [
      '"Verdade antes, durante e depois."',
      '"Sem atitude, não tem Vendemmia."',
      '"Quem acha que sabe tudo, para de aprender."',
      '"Se é seu, termina."',
    ],
    content: "Método híbrido com conceitos do PMBOK e práticas ágeis. Foco em visibilidade, comunicação e entrega de valor.",
  })

  // 5. Methodology
  slides.push({
    id: nanoid(), type: "methodology",
    title: "Metodologia de Gerenciamento de Projetos",
    bullets: [
      "Método híbrido com conceitos e artefatos do PMBOK e práticas ágeis.",
      "Artefatos: Termo de Abertura, Cronograma, Plano de Comunicação, Matriz RACI, Riscos e Oportunidades, Lições Aprendidas.",
      "Planner: ferramenta de gerenciamento com visão e status em tempo real.",
      "SharePoint: compartilhamento de documentos.",
      "Teams: troca de mensagens, arquivos e reuniões virtuais.",
    ],
  })

  // 6. Team organogram
  const teamMembers: KOTeamMember[] = []
  if (project.sponsor) {
    teamMembers.push({
      name: project.sponsor.name,
      role: "Patrocinador",
      department: project.sponsor.department,
      initials: initials(project.sponsor.name),
    })
  }
  project.members.forEach((m) => {
    teamMembers.push({
      name:       m.user.name,
      role:       m.role,
      department: m.user.department,
      initials:   initials(m.user.name),
    })
  })
  slides.push({ id: nanoid(), type: "team", title: "Organograma do Projeto", teamMembers })

  // 7. Scope
  slides.push({
    id: nanoid(), type: "scope",
    title:     "Escopo do Projeto",
    splitLeft: project.asIs   ?? "Situação atual não definida.",
    splitRight:project.toBe   ?? "Estado futuro não definido.",
    content:   project.scope  ?? "",
    bullets:   [
      ...(project.assumptions  ? [`Premissa: ${project.assumptions}`]   : []),
      ...(project.restrictions ? [`Restrição: ${project.restrictions}`] : []),
    ],
  })

  // 8. EAP
  const eapAreas: KOEapArea[] = (kickoff?.eapAreas ?? []).map((a) => ({
    name:  a.name,
    color: a.color,
    tasks: a.tasks.map((t) => t.text).filter(Boolean),
  }))
  if (eapAreas.length > 0) {
    slides.push({ id: nanoid(), type: "eap", title: "Estrutura Analítica do Projeto (EAP)", eapAreas })
  }

  // 9. Timeline (Macro Cronograma)
  const timelineItems: KOTimelineItem[] = (kickoff?.milestones ?? [])
    .filter((m) => m.date)
    .map((m) => ({ date: m.date, label: m.label, done: m.status === "DONE" }))
  if (timelineItems.length === 0) {
    if (project.expectedStart) timelineItems.push({ date: project.expectedStart.slice(0, 10), label: "Início", done: false })
    if (project.expectedEnd)   timelineItems.push({ date: project.expectedEnd.slice(0, 10),   label: "Go Live",done: false })
  }
  slides.push({ id: nanoid(), type: "timeline", title: "Macro Cronograma", timelineItems })

  // 10. Financial
  const cards: KOFinancialCard[] = []
  if (project.budget)         cards.push({ label: "Budget",           value: project.budget.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),          color: "#059669" })
  if (project.estimatedCosts) cards.push({ label: "Custo Estimado",   value: project.estimatedCosts.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),   color: "#D97706" })
  if (project.economy)        cards.push({ label: "Economia Esperada",value: project.economy.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),           color: "#2463FF" })
  if (cards.length > 0) {
    slides.push({ id: nanoid(), type: "financial", title: "Análise Financeira", financialCards: cards })
  }

  // 11. Risks
  if (project.risks.length > 0) {
    const risks: KORisk[] = project.risks.map((r) => ({
      description: r.description,
      level:       r.level,
      mitigation:  r.mitigation,
    }))
    slides.push({ id: nanoid(), type: "risks", title: "Riscos Identificados", risks })
  }

  // 12. Success factors
  slides.push({ id: nanoid(), type: "success", title: "Fatores Críticos de Sucesso", successFactors: DEFAULT_SUCCESS_FACTORS })

  // 13. Contacts
  const contacts: KOContact[] = project.members.slice(0, 8).map((m) => ({
    name:  m.user.name,
    role:  m.role,
    email: m.user.email ?? undefined,
  }))
  slides.push({ id: nanoid(), type: "contacts", title: "Contato | Líderes Vendemmia", contacts })

  // 14. Closing
  slides.push({
    id: nanoid(), type: "closing",
    title:    "Dúvidas?",
    subtitle: "Obrigado a todos, estamos disponíveis para possíveis dúvidas.",
    content:  "Até a próxima!",
  })

  return slides
}

// ─── Slide Thumbnail ──────────────────────────────────────────────────────────

function SlideThumbnail({ slide, index, isActive, onClick, onDelete }: {
  slide:    KOSlide; index: number; isActive: boolean
  onClick:  () => void; onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id })
  const meta = SLIDE_META[slide.type]
  const Icon = meta.icon

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all select-none ${
        isActive ? "bg-violet-50 border border-violet-200" : "hover:bg-slate-50 border border-transparent"
      }`}
      onClick={onClick}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing shrink-0 text-slate-300 hover:text-slate-500">
        <GripVertical className="w-3 h-3" />
      </div>
      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}30` }}>
        <Icon className="w-3 h-3" style={{ color: meta.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${isActive ? "text-violet-700" : "text-slate-800"}`}>{slide.title || meta.label}</p>
        <p className="text-[9px] text-slate-400">{meta.label}</p>
      </div>
      <span className="text-[10px] font-bold text-slate-300 shrink-0">{index + 1}</span>
      <button
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-300 hover:text-red-400 transition-all shrink-0"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// ─── Slide Renderer (light theme) ────────────────────────────────────────────

export function KOSlideRenderer({ slide, scale = 1, noShadow, onEdit }: { slide: KOSlide; scale?: number; noShadow?: boolean; onEdit?: (patch: Partial<KOSlide>) => void }) {
  const s = (v: number) => `${v * scale}px`

  const slideBase: React.CSSProperties = {
    width: "100%", aspectRatio: "16/9",
    background: "#FFFFFF",
    borderRadius: noShadow ? 0 : s(12),
    overflow: "hidden",
    position: "relative",
    boxShadow: noShadow ? "none" : "0 4px 32px rgba(0,0,0,0.12)",
    fontFamily: "'Inter', system-ui, sans-serif",
  }

  function Header({ title, accent = "#7B2FBE", slideNum }: { title: string; accent?: string; slideNum?: string }) {
    const editStyle = onEdit ? { outline: "none", cursor: "text", borderBottom: `${s(1.5)} dashed ${accent}66`, paddingBottom: s(2), minWidth: s(80), display: "inline-block" } : {}
    return (
      <div style={{ marginBottom: s(24) }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2
              key={slide.id + "title"}
              contentEditable={!!onEdit}
              suppressContentEditableWarning
              onBlur={onEdit ? (e) => onEdit({ title: e.currentTarget.textContent ?? "" }) : undefined}
              style={{ fontSize: s(22), fontWeight: 900, color: "#0F172A", margin: 0, lineHeight: 1.1, ...editStyle }}
            >{title}</h2>
            <div style={{ height: s(3), width: s(48), background: `linear-gradient(90deg, ${accent}, transparent)`, borderRadius: "99px", marginTop: s(8) }} />
          </div>
          {slideNum && <span style={{ fontSize: s(9), fontWeight: 800, color: "#CBD5E1", letterSpacing: "0.1em" }}>{slideNum}</span>}
        </div>
      </div>
    )
  }

  switch (slide.type) {

    case "cover": return (
      <div style={slideBase}>
        {/* Top gradient bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #7B2FBE, #2463FF, #06B6D4)" }} />
        {/* Decorative circle */}
        <div style={{ position: "absolute", right: s(-40), top: s(-40), width: s(280), height: s(280), borderRadius: "50%", background: "radial-gradient(circle, rgba(123,47,190,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: s(-20), bottom: s(-20), width: s(200), height: s(200), borderRadius: "50%", background: "radial-gradient(circle, rgba(36,99,255,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: `${s(8)} ${s(52)}`, paddingTop: s(20) }}>
          {/* Badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: s(6), padding: `${s(4)} ${s(14)}`, borderRadius: "99px", background: "rgba(123,47,190,0.08)", border: "1px solid rgba(123,47,190,0.2)", width: "fit-content", marginBottom: s(16) }}>
            <Rocket style={{ width: s(11), height: s(11), color: "#7B2FBE" }} />
            <span style={{ fontSize: s(10), fontWeight: 800, color: "#7B2FBE", letterSpacing: "0.14em", textTransform: "uppercase" }}>Reunião de Kick-Off</span>
          </div>
          {/* Title */}
          <h1
            key={slide.id + "title"}
            contentEditable={!!onEdit}
            suppressContentEditableWarning
            onBlur={onEdit ? (e) => onEdit({ title: e.currentTarget.textContent ?? "" }) : undefined}
            style={{ fontSize: s(38), fontWeight: 900, color: "#0F172A", lineHeight: 1.1, margin: `0 0 ${s(12)}`, maxWidth: "70%", outline: "none", cursor: onEdit ? "text" : "default" }}
          >{slide.title}</h1>
          <div style={{ height: s(3), width: s(64), background: "linear-gradient(90deg, #7B2FBE, #2463FF)", borderRadius: "99px", marginBottom: s(20) }} />
          {/* Date + location */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: s(16) }}>
            {slide.subtitle && (
              <div style={{ display: "flex", alignItems: "center", gap: s(6) }}>
                <Calendar style={{ width: s(12), height: s(12), color: "#7B2FBE", flexShrink: 0 }} />
                <span style={{ fontSize: s(12), color: "#475569", fontWeight: 600 }}>{slide.subtitle}</span>
              </div>
            )}
            {slide.content && (
              <div style={{ display: "flex", alignItems: "center", gap: s(6) }}>
                <MapPin style={{ width: s(12), height: s(12), color: "#2463FF", flexShrink: 0 }} />
                <span style={{ fontSize: s(12), color: "#475569", fontWeight: 600 }}>{slide.content}</span>
              </div>
            )}
          </div>
        </div>
        {/* Bottom brand strip */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${s(8)} ${s(52)}`, background: "#F8FAFC", borderTop: "1px solid #E2E8F0" }}>
          <span style={{ fontSize: s(9), fontWeight: 800, color: "#94A3B8", letterSpacing: "0.12em", textTransform: "uppercase" }}>Vendemmia Comércio Internacional</span>
          <span style={{ fontSize: s(9), fontWeight: 700, color: "#CBD5E1" }}>Confidencial</span>
        </div>
      </div>
    )

    case "agenda": return (
      <div style={slideBase}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #2463FF, #7B2FBE)" }} />
        <div style={{ padding: `${s(28)} ${s(48)}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
          <Header title={slide.title} accent="#2463FF" />
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: s(10), alignContent: "start" }}>
            {(slide.agendaItems ?? []).map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: s(12), padding: `${s(10)} ${s(14)}`, borderRadius: s(10), background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                <div style={{ width: s(22), height: s(22), borderRadius: s(6), background: "linear-gradient(135deg, #7B2FBE, #2463FF)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: s(9), fontWeight: 900, color: "#fff" }}>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div>
                  <p style={{ fontSize: s(11), fontWeight: 700, color: "#0F172A", margin: 0, lineHeight: 1.2 }}>{item.label}</p>
                  {item.description && <p style={{ fontSize: s(9), color: "#64748B", margin: `${s(3)} 0 0`, lineHeight: 1.3 }}>{item.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )

    case "objectives": return (
      <div style={slideBase}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #059669, #06B6D4)" }} />
        <div style={{ padding: `${s(28)} ${s(48)}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
          <Header title={slide.title} accent="#059669" />
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: s(16) }}>
            <div style={{ padding: s(16), borderRadius: s(12), border: "1px solid #D1FAE5", background: "#F0FDF4", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: s(6), marginBottom: s(10) }}>
                <Target style={{ width: s(13), height: s(13), color: "#059669" }} />
                <span style={{ fontSize: s(9), fontWeight: 800, color: "#059669", textTransform: "uppercase", letterSpacing: "0.12em" }}>Objetivo Geral</span>
              </div>
              <p style={{ fontSize: s(12), color: "#0F172A", lineHeight: 1.6, margin: 0, flex: 1 }}>{slide.content || "Objetivo a ser definido."}</p>
            </div>
            <div style={{ padding: s(16), borderRadius: s(12), border: "1px solid #DBEAFE", background: "#EFF6FF", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: s(6), marginBottom: s(10) }}>
                <Star style={{ width: s(13), height: s(13), color: "#2463FF" }} />
                <span style={{ fontSize: s(9), fontWeight: 800, color: "#2463FF", textTransform: "uppercase", letterSpacing: "0.12em" }}>Benefícios</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: s(6), flex: 1 }}>
                {(slide.bullets ?? []).filter(Boolean).map((b, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: s(8) }}>
                    <div style={{ width: s(5), height: s(5), borderRadius: "50%", background: "#2463FF", marginTop: s(5), flexShrink: 0 }} />
                    <span style={{ fontSize: s(11), color: "#1E3A5F", lineHeight: 1.4 }}>{b}</span>
                  </div>
                ))}
                {(!slide.bullets || slide.bullets.length === 0) && (
                  <p style={{ fontSize: s(11), color: "#64748B", fontStyle: "italic" }}>Benefícios a serem definidos.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )

    case "about": return (
      <div style={slideBase}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #D97706, #F59E0B)" }} />
        <div style={{ padding: `${s(28)} ${s(48)}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
          <Header title={slide.title} accent="#D97706" />
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: s(16) }}>
            <div>
              <p style={{ fontSize: s(9), fontWeight: 800, color: "#D97706", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: s(12) }}>Valores & Cultura</p>
              <div style={{ display: "flex", flexDirection: "column", gap: s(8) }}>
                {(slide.bullets ?? []).map((quote, i) => (
                  <div key={i} style={{ padding: `${s(8)} ${s(12)}`, borderRadius: s(8), background: "#FFF7ED", borderLeft: `${s(3)} solid #D97706` }}>
                    <p style={{ fontSize: s(11), color: "#92400E", fontWeight: 600, fontStyle: "italic", margin: 0 }}>{quote}</p>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: s(16), borderRadius: s(12), background: "#F8FAFC", border: "1px solid #E2E8F0", display: "flex", flexDirection: "column", gap: s(8) }}>
              <p style={{ fontSize: s(9), fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>Ferramentas & Método</p>
              <p style={{ fontSize: s(11), color: "#475569", lineHeight: 1.6, margin: 0 }}>{slide.content}</p>
            </div>
          </div>
        </div>
      </div>
    )

    case "methodology": return (
      <div style={slideBase}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #7C3AED, #2463FF)" }} />
        <div style={{ padding: `${s(28)} ${s(48)}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
          <Header title={slide.title} accent="#7C3AED" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: s(10) }}>
            {(slide.bullets ?? []).map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: s(12), padding: `${s(8)} ${s(14)}`, borderRadius: s(8), background: i === 0 ? "rgba(124,58,237,0.05)" : "#F8FAFC", border: `1px solid ${i === 0 ? "rgba(124,58,237,0.2)" : "#E2E8F0"}` }}>
                <div style={{ width: s(6), height: s(6), borderRadius: "50%", background: "#7C3AED", marginTop: s(5), flexShrink: 0 }} />
                <p style={{ fontSize: s(11), color: "#0F172A", margin: 0, lineHeight: 1.5 }}>{b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    )

    case "team": {
      const members = slide.teamMembers ?? []
      const sponsor = members.find((m) => m.role === "Patrocinador" || m.role === "Sponsor")
      const rest    = members.filter((m) => m !== sponsor)
      const avatarColors = ["#7B2FBE","#2463FF","#059669","#D97706","#DC2626","#0891B2","#7C3AED","#DB2777"]
      return (
        <div style={slideBase}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #0891B2, #2463FF)" }} />
          <div style={{ padding: `${s(24)} ${s(40)}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
            <Header title={slide.title} accent="#0891B2" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: s(14) }}>
              {sponsor && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: s(4) }}>
                  <div style={{ width: s(40), height: s(40), borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #7B2FBE, #2463FF)", color: "#fff", fontSize: s(14), fontWeight: 900 }}>{sponsor.initials}</div>
                  <p style={{ fontSize: s(11), fontWeight: 700, color: "#0F172A", margin: 0 }}>{sponsor.name}</p>
                  <span style={{ fontSize: s(9), background: "rgba(123,47,190,0.1)", color: "#7B2FBE", padding: `${s(2)} ${s(8)}`, borderRadius: "99px", fontWeight: 700 }}>{sponsor.role}</span>
                </div>
              )}
              {sponsor && rest.length > 0 && <div style={{ width: s(1), height: s(12), background: "#E2E8F0" }} />}
              <div style={{ display: "flex", flexWrap: "wrap", gap: s(12), justifyContent: "center" }}>
                {rest.map((m, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: s(4), minWidth: s(70) }}>
                    <div style={{ width: s(32), height: s(32), borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: avatarColors[i % avatarColors.length], color: "#fff", fontSize: s(11), fontWeight: 900 }}>{m.initials}</div>
                    <p style={{ fontSize: s(10), fontWeight: 700, color: "#0F172A", margin: 0, textAlign: "center", maxWidth: s(80) }}>{m.name}</p>
                    <span style={{ fontSize: s(8), color: "#64748B", textAlign: "center", maxWidth: s(80) }}>{m.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )
    }

    case "scope": return (
      <div style={slideBase}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #10B981, #059669)" }} />
        <div style={{ padding: `${s(28)} ${s(48)}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
          <Header title={slide.title} accent="#10B981" />
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: s(12), alignItems: "stretch" }}>
            <div style={{ padding: s(14), borderRadius: s(12), background: "#FEF2F2", border: "1px solid #FECACA" }}>
              <p style={{ fontSize: s(9), fontWeight: 800, color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: s(8) }}>AS-IS · Situação Atual</p>
              <p style={{ fontSize: s(11), color: "#0F172A", lineHeight: 1.6, margin: 0 }}>{slide.splitLeft || "Situação atual a ser descrita."}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", flexDirection: "column", justifyContent: "center", gap: s(4), padding: `0 ${s(4)}` }}>
              <div style={{ width: s(28), height: s(28), borderRadius: "50%", background: "linear-gradient(135deg, #10B981, #059669)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontSize: s(14), fontWeight: 900 }}>→</span>
              </div>
            </div>
            <div style={{ padding: s(14), borderRadius: s(12), background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <p style={{ fontSize: s(9), fontWeight: 800, color: "#059669", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: s(8) }}>TO-BE · Estado Futuro</p>
              <p style={{ fontSize: s(11), color: "#0F172A", lineHeight: 1.6, margin: 0 }}>{slide.splitRight || "Estado futuro a ser descrito."}</p>
            </div>
          </div>
          {(slide.bullets ?? []).filter(Boolean).length > 0 && (
            <div style={{ display: "flex", gap: s(12), marginTop: s(12) }}>
              {(slide.bullets ?? []).filter(Boolean).map((b, i) => (
                <div key={i} style={{ flex: 1, padding: `${s(6)} ${s(10)}`, borderRadius: s(8), background: "#F8FAFC", border: "1px solid #E2E8F0", fontSize: s(10), color: "#475569" }}>{b}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    )

    case "eap": {
      const areas = slide.eapAreas ?? []
      const maxTasks = Math.max(...areas.map((a) => a.tasks.length), 0)
      return (
        <div style={slideBase}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #6366F1, #7B2FBE)" }} />
          <div style={{ padding: `${s(24)} ${s(36)}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
            <Header title={slide.title} accent="#6366F1" />
            <div style={{ flex: 1, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    {areas.map((area, i) => (
                      <th key={i} style={{ padding: 0, verticalAlign: "top" }}>
                        <div style={{ background: area.color, padding: `${s(6)} ${s(10)}`, display: "flex", alignItems: "center", borderRadius: `${s(6)} ${s(6)} 0 0` }}>
                          <span style={{ fontSize: s(9), fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "0.1em", lineHeight: 1.2 }}>{area.name}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.min(maxTasks, 6) }).map((_, ri) => (
                    <tr key={ri}>
                      {areas.map((area, ai) => {
                        const task = area.tasks[ri]
                        return (
                          <td key={ai} style={{ padding: `${s(4)} ${s(8)}`, verticalAlign: "top", background: ri % 2 === 0 ? "#fff" : "#F8FAFC", borderBottom: "1px solid #F1F5F9", borderRight: ai < areas.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                            {task && (
                              <div style={{ display: "flex", alignItems: "flex-start", gap: s(4) }}>
                                <div style={{ width: s(5), height: s(5), borderRadius: "50%", background: area.color, marginTop: s(4), flexShrink: 0 }} />
                                <span style={{ fontSize: s(10), color: "#475569", lineHeight: 1.4 }}>{task}</span>
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )
    }

    case "timeline": {
      const items = (slide.timelineItems ?? []).filter((i) => i.date)
      const doneCount = items.filter((i) => i.done).length
      const linePct   = items.length > 1 ? Math.round((doneCount / (items.length - 1)) * 100) : 0
      return (
        <div style={{ ...slideBase, background: "linear-gradient(160deg, #0F172A 0%, #1E293B 60%, #0F172A 100%)" }}>
          {/* Top accent */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(4), background: "linear-gradient(90deg, #F59E0B, #FBBF24, #F97316)" }} />
          {/* Decorative glow */}
          <div style={{ position: "absolute", top: s(-60), right: s(-60), width: s(300), height: s(300), borderRadius: "50%", background: "radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: s(-40), left: s(-40), width: s(200), height: s(200), borderRadius: "50%", background: "radial-gradient(circle, rgba(249,115,22,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />

          <div style={{ padding: `${s(24)} ${s(44)} ${s(20)}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", position: "relative" }}>
            {/* Header */}
            <div style={{ marginBottom: s(20) }}>
              <div style={{ display: "flex", alignItems: "center", gap: s(8), marginBottom: s(6) }}>
                <div style={{ width: s(20), height: s(20), borderRadius: s(5), background: "linear-gradient(135deg, #F59E0B, #F97316)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Calendar style={{ width: s(10), height: s(10), color: "#fff" }} />
                </div>
                <span style={{ fontSize: s(9), fontWeight: 800, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.16em" }}>Macro Cronograma</span>
              </div>
              <h2 style={{ fontSize: s(22), fontWeight: 900, color: "#F8FAFC", margin: 0, lineHeight: 1.1 }}>{slide.title}</h2>
              <div style={{ height: s(2.5), width: s(48), background: "linear-gradient(90deg, #F59E0B, transparent)", borderRadius: "99px", marginTop: s(6) }} />
            </div>

            {items.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ fontSize: s(12), color: "#475569" }}>Nenhum marco definido ainda.</p>
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                {/* Track container */}
                <div style={{ position: "relative", padding: `${s(44)} 0` }}>
                  {/* Background track */}
                  <div style={{ position: "absolute", top: "50%", left: s(24), right: s(24), height: s(2), background: "rgba(255,255,255,0.08)", transform: "translateY(-50%)", borderRadius: s(2) }} />
                  {/* Progress track */}
                  {linePct > 0 && (
                    <div style={{ position: "absolute", top: "50%", left: s(24), height: s(2), width: `calc(${linePct}% - ${s(24)}px)`, background: "linear-gradient(90deg, #10B981, #059669)", transform: "translateY(-50%)", borderRadius: s(2) }} />
                  )}

                  {/* Items */}
                  <div style={{ display: "flex", justifyContent: "space-between", position: "relative", padding: `0 ${s(24)}` }}>
                    {items.map((item, i) => {
                      const above = i % 2 === 0
                      const done  = item.done
                      const dateStr = item.date
                        ? format(new Date(item.date + "T00:00:00"), "dd/MMM/yy", { locale: ptBR }).toUpperCase()
                        : ""
                      return (
                        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, position: "relative" }}>
                          {/* Label above */}
                          {above ? (
                            <div style={{ textAlign: "center", marginBottom: s(8), minHeight: s(40) }}>
                              <p style={{ fontSize: s(10), fontWeight: 700, color: "#F1F5F9", margin: `0 0 ${s(4)}`, lineHeight: 1.3, maxWidth: s(90) }}>{item.label}</p>
                              <div style={{ display: "inline-block", padding: `${s(2)} ${s(7)}`, borderRadius: "99px", background: done ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.12)", border: `1px solid ${done ? "rgba(16,185,129,0.35)" : "rgba(245,158,11,0.3)"}` }}>
                                <span style={{ fontSize: s(7.5), fontWeight: 700, color: done ? "#34D399" : "#FBBF24", letterSpacing: "0.04em" }}>{dateStr}</span>
                              </div>
                            </div>
                          ) : (
                            <div style={{ minHeight: s(40) }} />
                          )}

                          {/* Connector stem above */}
                          {above && <div style={{ width: s(1.5), height: s(10), background: done ? "rgba(16,185,129,0.4)" : "rgba(245,158,11,0.2)" }} />}

                          {/* Milestone circle */}
                          <div style={{
                            width: s(32), height: s(32), borderRadius: "50%", flexShrink: 0, zIndex: 2,
                            background: done
                              ? "linear-gradient(135deg, #10B981, #059669)"
                              : "linear-gradient(135deg, #F59E0B, #F97316)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            boxShadow: done
                              ? `0 0 0 ${s(4)} rgba(16,185,129,0.15), 0 ${s(4)} ${s(12)} rgba(16,185,129,0.3)`
                              : `0 0 0 ${s(4)} rgba(245,158,11,0.15), 0 ${s(4)} ${s(12)} rgba(245,158,11,0.3)`,
                          }}>
                            {done
                              ? <CheckCircle2 style={{ width: s(16), height: s(16), color: "#fff" }} />
                              : <span style={{ fontSize: s(12), fontWeight: 900, color: "#fff", lineHeight: 1 }}>{i + 1}</span>
                            }
                          </div>

                          {/* Connector stem below */}
                          {!above && <div style={{ width: s(1.5), height: s(10), background: done ? "rgba(16,185,129,0.4)" : "rgba(245,158,11,0.2)" }} />}

                          {/* Label below */}
                          {!above ? (
                            <div style={{ textAlign: "center", marginTop: s(8), minHeight: s(40) }}>
                              <p style={{ fontSize: s(10), fontWeight: 700, color: "#F1F5F9", margin: `0 0 ${s(4)}`, lineHeight: 1.3, maxWidth: s(90) }}>{item.label}</p>
                              <div style={{ display: "inline-block", padding: `${s(2)} ${s(7)}`, borderRadius: "99px", background: done ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.12)", border: `1px solid ${done ? "rgba(16,185,129,0.35)" : "rgba(245,158,11,0.3)"}` }}>
                                <span style={{ fontSize: s(7.5), fontWeight: 700, color: done ? "#34D399" : "#FBBF24", letterSpacing: "0.04em" }}>{dateStr}</span>
                              </div>
                            </div>
                          ) : (
                            <div style={{ minHeight: s(40) }} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Legend */}
                <div style={{ display: "flex", justifyContent: "center", gap: s(20), marginTop: s(4) }}>
                  <div style={{ display: "flex", alignItems: "center", gap: s(5) }}>
                    <div style={{ width: s(8), height: s(8), borderRadius: "50%", background: "linear-gradient(135deg, #10B981, #059669)" }} />
                    <span style={{ fontSize: s(8), color: "#64748B", fontWeight: 600 }}>Concluído</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: s(5) }}>
                    <div style={{ width: s(8), height: s(8), borderRadius: "50%", background: "linear-gradient(135deg, #F59E0B, #F97316)" }} />
                    <span style={{ fontSize: s(8), color: "#64748B", fontWeight: 600 }}>Planejado</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }

    case "financial": {
      const cards = slide.financialCards ?? []
      return (
        <div style={slideBase}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #047857, #059669)" }} />
          <div style={{ padding: `${s(28)} ${s(48)}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
            <Header title={slide.title} accent="#047857" />
            <div style={{ flex: 1, display: "flex", gap: s(16), alignItems: "center" }}>
              {cards.map((card, i) => (
                <div key={i} style={{ flex: 1, padding: s(20), borderRadius: s(14), border: `2px solid ${card.color}22`, background: `${card.color}08`, display: "flex", flexDirection: "column", gap: s(10), alignItems: "center", textAlign: "center" }}>
                  <TrendingUp style={{ width: s(24), height: s(24), color: card.color }} />
                  <p style={{ fontSize: s(9), fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>{card.label}</p>
                  <p style={{ fontSize: s(22), fontWeight: 900, color: card.color, margin: 0, lineHeight: 1 }}>{card.value}</p>
                </div>
              ))}
              {cards.length === 0 && (
                <div style={{ flex: 1, textAlign: "center", color: "#94A3B8", fontSize: s(12) }}>Dados financeiros não definidos.</div>
              )}
            </div>
          </div>
        </div>
      )
    }

    case "risks": {
      const risks = (slide.risks ?? []).sort((a, b) => {
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
        return (order[a.level] ?? 4) - (order[b.level] ?? 4)
      })
      return (
        <div style={slideBase}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #DC2626, #EF4444)" }} />
          <div style={{ padding: `${s(28)} ${s(48)}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
            <Header title={slide.title} accent="#DC2626" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: s(8) }}>
              {risks.slice(0, 5).map((r, i) => {
                const cfg = RISK_COLOR[r.level] ?? RISK_COLOR.LOW
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: s(10), padding: `${s(8)} ${s(12)}`, borderRadius: s(8), background: cfg.bg, border: `1px solid ${cfg.text}22` }}>
                    <AlertTriangle style={{ width: s(12), height: s(12), color: cfg.text, flexShrink: 0, marginTop: s(2) }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: s(8), marginBottom: s(2) }}>
                        <span style={{ fontSize: s(8), fontWeight: 800, padding: `${s(1)} ${s(7)}`, borderRadius: "99px", background: cfg.text, color: "#fff" }}>{cfg.label}</span>
                        <p style={{ fontSize: s(11), fontWeight: 600, color: "#0F172A", margin: 0 }}>{r.description}</p>
                      </div>
                      {r.mitigation && <p style={{ fontSize: s(9.5), color: "#475569", margin: 0 }}>Mitigação: {r.mitigation}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )
    }

    case "success": return (
      <div style={slideBase}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #7C3AED, #7B2FBE)" }} />
        <div style={{ padding: `${s(24)} ${s(44)}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
          <Header title={slide.title} accent="#7C3AED" />
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: s(10), alignContent: "start" }}>
            {(slide.successFactors ?? []).map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: s(8), padding: `${s(8)} ${s(10)}`, borderRadius: s(8), background: "#FAF5FF", border: "1px solid rgba(124,58,237,0.15)" }}>
                <div style={{ width: s(16), height: s(16), borderRadius: "50%", background: "rgba(124,58,237,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: s(1) }}>
                  <CheckCircle2 style={{ width: s(10), height: s(10), color: "#7C3AED" }} />
                </div>
                <div>
                  <p style={{ fontSize: s(10), fontWeight: 700, color: "#0F172A", margin: `0 0 ${s(2)}` }}>{f.category}</p>
                  <p style={{ fontSize: s(9), color: "#64748B", margin: 0, lineHeight: 1.4 }}>{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )

    case "contacts": return (
      <div style={slideBase}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #0891B2, #2463FF)" }} />
        <div style={{ padding: `${s(28)} ${s(48)}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
          <Header title={slide.title} accent="#0891B2" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: s(8) }}>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 2fr 1.5fr", gap: s(8), padding: `${s(4)} ${s(10)}` }}>
              {["Nome", "Função", "E-mail", "Telefone"].map((h) => (
                <span key={h} style={{ fontSize: s(9), fontWeight: 800, color: "#0891B2", textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</span>
              ))}
            </div>
            {(slide.contacts ?? []).slice(0, 6).map((c, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 2fr 1.5fr", gap: s(8), padding: `${s(8)} ${s(10)}`, borderRadius: s(8), background: i % 2 === 0 ? "#F8FAFC" : "#fff", border: "1px solid #E2E8F0", alignItems: "center" }}>
                <span style={{ fontSize: s(11), fontWeight: 600, color: "#0F172A" }}>{c.name}</span>
                <span style={{ fontSize: s(10), color: "#64748B" }}>{c.role}</span>
                <span style={{ fontSize: s(10), color: "#0891B2" }}>{c.email || "—"}</span>
                <span style={{ fontSize: s(10), color: "#64748B" }}>{c.phone || "—"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )

    case "closing": return (
      <div style={{ ...slideBase, background: "linear-gradient(135deg, #F8FAFC 0%, #EDE9FE 50%, #DBEAFE 100%)" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #7B2FBE, #2463FF, #06B6D4)" }} />
        <div style={{ position: "absolute", right: s(-30), bottom: s(-30), width: s(240), height: s(240), borderRadius: "50%", background: "radial-gradient(circle, rgba(123,47,190,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: s(20), padding: s(40), textAlign: "center" }}>
          <div style={{ width: s(56), height: s(56), borderRadius: "50%", background: "linear-gradient(135deg, #7B2FBE, #2463FF)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 32px rgba(123,47,190,0.3)" }}>
            <MessageSquare style={{ width: s(24), height: s(24), color: "#fff" }} />
          </div>
          <div>
            <h1 style={{ fontSize: s(40), fontWeight: 900, color: "#0F172A", margin: `0 0 ${s(8)}` }}>{slide.title}</h1>
            <p style={{ fontSize: s(15), color: "#475569", margin: `0 0 ${s(6)}`, maxWidth: "60%" }}>{slide.subtitle}</p>
            {slide.content && <p style={{ fontSize: s(13), color: "#7B2FBE", fontWeight: 700, margin: 0 }}>{slide.content}</p>}
          </div>
          <div style={{ position: "absolute", bottom: s(20), left: 0, right: 0, display: "flex", justifyContent: "center" }}>
            <span style={{ fontSize: s(9), fontWeight: 800, color: "#CBD5E1", letterSpacing: "0.14em", textTransform: "uppercase" }}>Vendemmia Comércio Internacional</span>
          </div>
        </div>
      </div>
    )

    case "content": return (
      <div style={slideBase}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #64748B, #94A3B8)" }} />
        {slide.imageUrl && (
          <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "42%", overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slide.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, #fff 0%, transparent 20%)" }} />
          </div>
        )}
        <div style={{ padding: `${s(28)} ${s(48)}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", maxWidth: slide.imageUrl ? "62%" : "100%" }}>
          <Header title={slide.title} accent="#64748B" />
          <div style={{ flex: 1, padding: s(16), borderRadius: s(12), background: "#F8FAFC", border: "1px solid #E2E8F0", borderLeft: `${s(3)} solid #64748B` }}>
            <p
              key={slide.id + "content"}
              contentEditable={!!onEdit}
              suppressContentEditableWarning
              onBlur={onEdit ? (e) => onEdit({ content: e.currentTarget.textContent ?? "" }) : undefined}
              style={{ fontSize: s(13), color: "#475569", lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap", outline: "none", cursor: onEdit ? "text" : "default" }}
            >{slide.content}</p>
          </div>
        </div>
      </div>
    )

    case "bullets": return (
      <div style={slideBase}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: s(5), background: "linear-gradient(90deg, #64748B, #94A3B8)" }} />
        {slide.imageUrl && (
          <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "38%", overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slide.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, #fff 0%, transparent 18%)" }} />
          </div>
        )}
        <div style={{ padding: `${s(28)} ${s(48)}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", maxWidth: slide.imageUrl ? "66%" : "100%" }}>
          <Header title={slide.title} accent="#64748B" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: s(10) }}>
            {(slide.bullets ?? []).map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: s(12), padding: `${s(8)} ${s(14)}`, borderRadius: s(8), background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                <div style={{ width: s(6), height: s(6), borderRadius: "50%", background: "#7B2FBE", marginTop: s(6), flexShrink: 0 }} />
                <p
                  key={slide.id + "b" + i}
                  contentEditable={!!onEdit}
                  suppressContentEditableWarning
                  onBlur={onEdit ? (e) => {
                    const newBullets = [...(slide.bullets ?? [])]
                    newBullets[i] = e.currentTarget.textContent ?? ""
                    onEdit({ bullets: newBullets })
                  } : undefined}
                  style={{ fontSize: s(13), color: "#0F172A", margin: 0, lineHeight: 1.5, outline: "none", cursor: onEdit ? "text" : "default", flex: 1 }}
                >{b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    )

    default: return <div style={slideBase}><div style={{ padding: "20px", color: "#64748B" }}>Tipo de slide desconhecido</div></div>
  }
}

// ─── Property Editor ──────────────────────────────────────────────────────────

function PropertyEditor({ slide, onUpdate }: { slide: KOSlide; onUpdate: (patch: Partial<KOSlide>) => void }) {
  const lbl = "block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5"
  const inp = "w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-violet-400 transition-colors bg-white"
  const txt = `${inp} resize-none`

  function StringList({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
    return (
      <div className="space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex gap-1.5">
            <input value={v} onChange={(e) => { const n=[...values]; n[i]=e.target.value; onChange(n) }} placeholder={placeholder} className={inp} />
            <button onClick={() => onChange(values.filter((_,j)=>j!==i))} className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
          </div>
        ))}
        <button onClick={() => onChange([...values, ""])} className="text-xs font-semibold text-violet-500 hover:text-violet-700 flex items-center gap-1 transition-colors"><Plus className="w-3 h-3" /> Adicionar</button>
      </div>
    )
  }

  return (
    <div className="space-y-5 text-sm">
      {/* Title — always shown */}
      <div>
        <label className={lbl}>Título</label>
        <input value={slide.title} onChange={(e) => onUpdate({ title: e.target.value })} className={inp} />
      </div>

      {slide.type === "cover" && <>
        <div><label className={lbl}>Data / Subtítulo</label><input value={slide.subtitle??""} onChange={(e) => onUpdate({ subtitle: e.target.value })} className={inp} /></div>
        <div><label className={lbl}>Local</label><input value={slide.content??""} onChange={(e) => onUpdate({ content: e.target.value })} className={inp} /></div>
      </>}

      {slide.type === "agenda" && (
        <div>
          <label className={lbl}>Itens da Agenda</label>
          <div className="space-y-2">
            {(slide.agendaItems??[]).map((item, i) => (
              <div key={i} className="p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex gap-1.5">
                  <input value={item.label} onChange={(e) => { const n=[...(slide.agendaItems??[])]; n[i]={...n[i],label:e.target.value}; onUpdate({agendaItems:n}) }} placeholder="Título do item" className={inp} />
                  <button onClick={() => onUpdate({agendaItems:(slide.agendaItems??[]).filter((_,j)=>j!==i)})} className="p-1.5 text-slate-300 hover:text-red-400"><X className="w-3 h-3" /></button>
                </div>
                <input value={item.description??""} onChange={(e) => { const n=[...(slide.agendaItems??[])]; n[i]={...n[i],description:e.target.value}; onUpdate({agendaItems:n}) }} placeholder="Descrição (opcional)" className={inp} />
              </div>
            ))}
            <button onClick={() => onUpdate({agendaItems:[...(slide.agendaItems??[]),{icon:"circle",label:"Novo item",description:""}]})} className="text-xs font-semibold text-violet-500 hover:text-violet-700 flex items-center gap-1"><Plus className="w-3 h-3" /> Adicionar item</button>
          </div>
        </div>
      )}

      {(slide.type === "objectives" || slide.type === "content") && (
        <div><label className={lbl}>Objetivo / Conteúdo</label><textarea value={slide.content??""} onChange={(e) => onUpdate({ content: e.target.value })} rows={4} className={txt} /></div>
      )}

      {(slide.type === "objectives" || slide.type === "bullets" || slide.type === "about" || slide.type === "methodology") && (
        <div><label className={lbl}>{slide.type === "objectives" ? "Benefícios (um por linha)" : "Tópicos"}</label><StringList values={slide.bullets??[]} onChange={(v) => onUpdate({bullets:v})} placeholder="Tópico..." /></div>
      )}

      {slide.type === "scope" && <>
        <div><label className={lbl}>AS-IS · Situação Atual</label><textarea value={slide.splitLeft??""} onChange={(e) => onUpdate({ splitLeft: e.target.value })} rows={3} className={txt} /></div>
        <div><label className={lbl}>TO-BE · Estado Futuro</label><textarea value={slide.splitRight??""} onChange={(e) => onUpdate({ splitRight: e.target.value })} rows={3} className={txt} /></div>
        <div><label className={lbl}>Premissas / Restrições</label><StringList values={slide.bullets??[]} onChange={(v) => onUpdate({bullets:v})} placeholder="Premissa ou restrição..." /></div>
      </>}

      {slide.type === "team" && (
        <div>
          <label className={lbl}>Membros da Equipe</label>
          <div className="space-y-2">
            {(slide.teamMembers??[]).map((m, i) => (
              <div key={i} className="p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex gap-1.5">
                  <input value={m.name} onChange={(e) => { const n=[...(slide.teamMembers??[])]; n[i]={...n[i],name:e.target.value,initials:initials(e.target.value)}; onUpdate({teamMembers:n}) }} placeholder="Nome" className={inp} />
                  <button onClick={() => onUpdate({teamMembers:(slide.teamMembers??[]).filter((_,j)=>j!==i)})} className="p-1.5 text-slate-300 hover:text-red-400"><X className="w-3 h-3" /></button>
                </div>
                <input value={m.role} onChange={(e) => { const n=[...(slide.teamMembers??[])]; n[i]={...n[i],role:e.target.value}; onUpdate({teamMembers:n}) }} placeholder="Cargo / Função" className={inp} />
              </div>
            ))}
            <button onClick={() => onUpdate({teamMembers:[...(slide.teamMembers??[]),{name:"",role:"",initials:"??"}]})} className="text-xs font-semibold text-violet-500 hover:text-violet-700 flex items-center gap-1"><Plus className="w-3 h-3" /> Adicionar membro</button>
          </div>
        </div>
      )}

      {slide.type === "timeline" && (
        <div>
          <label className={lbl}>Marcos</label>
          <div className="space-y-2">
            {(slide.timelineItems??[]).map((item, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <input value={item.label} onChange={(e) => { const n=[...(slide.timelineItems??[])]; n[i]={...n[i],label:e.target.value}; onUpdate({timelineItems:n}) }} placeholder="Marco" className={inp} />
                <input type="date" value={item.date} onChange={(e) => { const n=[...(slide.timelineItems??[])]; n[i]={...n[i],date:e.target.value}; onUpdate({timelineItems:n}) }} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-violet-400 shrink-0" />
                <button onClick={() => onUpdate({timelineItems:(slide.timelineItems??[]).filter((_,j)=>j!==i)})} className="p-1.5 text-slate-300 hover:text-red-400"><X className="w-3 h-3" /></button>
              </div>
            ))}
            <button onClick={() => onUpdate({timelineItems:[...(slide.timelineItems??[]),{date:"",label:"Novo marco"}]})} className="text-xs font-semibold text-violet-500 hover:text-violet-700 flex items-center gap-1"><Plus className="w-3 h-3" /> Adicionar marco</button>
          </div>
        </div>
      )}

      {slide.type === "financial" && (
        <div>
          <label className={lbl}>Cards Financeiros</label>
          <div className="space-y-2">
            {(slide.financialCards??[]).map((c, i) => (
              <div key={i} className="p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex gap-1.5">
                  <input value={c.label} onChange={(e) => { const n=[...(slide.financialCards??[])]; n[i]={...n[i],label:e.target.value}; onUpdate({financialCards:n}) }} placeholder="Rótulo" className={inp} />
                  <button onClick={() => onUpdate({financialCards:(slide.financialCards??[]).filter((_,j)=>j!==i)})} className="p-1.5 text-slate-300 hover:text-red-400"><X className="w-3 h-3" /></button>
                </div>
                <input value={c.value} onChange={(e) => { const n=[...(slide.financialCards??[])]; n[i]={...n[i],value:e.target.value}; onUpdate({financialCards:n}) }} placeholder="Valor" className={inp} />
              </div>
            ))}
            <button onClick={() => onUpdate({financialCards:[...(slide.financialCards??[]),{label:"",value:"",color:"#059669"}]})} className="text-xs font-semibold text-violet-500 hover:text-violet-700 flex items-center gap-1"><Plus className="w-3 h-3" /> Adicionar card</button>
          </div>
        </div>
      )}

      {slide.type === "success" && (
        <div>
          <label className={lbl}>Fatores Críticos</label>
          <div className="space-y-2">
            {(slide.successFactors??[]).map((f, i) => (
              <div key={i} className="p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex gap-1.5">
                  <input value={f.category} onChange={(e) => { const n=[...(slide.successFactors??[])]; n[i]={...n[i],category:e.target.value}; onUpdate({successFactors:n}) }} placeholder="Categoria" className={inp} />
                  <button onClick={() => onUpdate({successFactors:(slide.successFactors??[]).filter((_,j)=>j!==i)})} className="p-1.5 text-slate-300 hover:text-red-400"><X className="w-3 h-3" /></button>
                </div>
                <textarea value={f.description} onChange={(e) => { const n=[...(slide.successFactors??[])]; n[i]={...n[i],description:e.target.value}; onUpdate({successFactors:n}) }} rows={2} placeholder="Descrição" className={txt} />
              </div>
            ))}
            <button onClick={() => onUpdate({successFactors:[...(slide.successFactors??[]),{category:"",description:""}]})} className="text-xs font-semibold text-violet-500 hover:text-violet-700 flex items-center gap-1"><Plus className="w-3 h-3" /> Adicionar fator</button>
          </div>
        </div>
      )}

      {slide.type === "contacts" && (
        <div>
          <label className={lbl}>Contatos</label>
          <div className="space-y-2">
            {(slide.contacts??[]).map((c, i) => (
              <div key={i} className="p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex gap-1.5">
                  <input value={c.name} onChange={(e) => { const n=[...(slide.contacts??[])]; n[i]={...n[i],name:e.target.value}; onUpdate({contacts:n}) }} placeholder="Nome" className={inp} />
                  <button onClick={() => onUpdate({contacts:(slide.contacts??[]).filter((_,j)=>j!==i)})} className="p-1.5 text-slate-300 hover:text-red-400"><X className="w-3 h-3" /></button>
                </div>
                <input value={c.role} onChange={(e) => { const n=[...(slide.contacts??[])]; n[i]={...n[i],role:e.target.value}; onUpdate({contacts:n}) }} placeholder="Cargo" className={inp} />
                <input value={c.email??""} onChange={(e) => { const n=[...(slide.contacts??[])]; n[i]={...n[i],email:e.target.value}; onUpdate({contacts:n}) }} placeholder="E-mail" className={inp} />
              </div>
            ))}
            <button onClick={() => onUpdate({contacts:[...(slide.contacts??[]),{name:"",role:"",email:""}]})} className="text-xs font-semibold text-violet-500 hover:text-violet-700 flex items-center gap-1"><Plus className="w-3 h-3" /> Adicionar contato</button>
          </div>
        </div>
      )}

      {(slide.type === "closing") && <>
        <div><label className={lbl}>Subtítulo</label><input value={slide.subtitle??""} onChange={(e) => onUpdate({ subtitle: e.target.value })} className={inp} /></div>
        <div><label className={lbl}>Mensagem final</label><input value={slide.content??""} onChange={(e) => onUpdate({ content: e.target.value })} className={inp} /></div>
      </>}

      {/* Image — shown for content/bullets/objectives/about/methodology/closing slides */}
      {["content", "bullets", "objectives", "about", "methodology", "closing", "cover"].includes(slide.type) && (
        <div>
          <label className={lbl}>Imagem</label>
          {slide.imageUrl ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={slide.imageUrl} alt="" className="w-full h-24 object-cover rounded-xl border border-slate-200" />
              <div className="flex gap-2">
                <label className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-200 rounded-lg cursor-pointer hover:bg-violet-100 transition-colors">
                  <Upload className="w-3 h-3" /> Trocar
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = (ev) => onUpdate({ imageUrl: ev.target?.result as string })
                    reader.readAsDataURL(file)
                  }} />
                </label>
                <button onClick={() => onUpdate({ imageUrl: undefined })} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-500 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
                  <X className="w-3 h-3" /> Remover
                </button>
              </div>
            </div>
          ) : (
            <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-violet-300 hover:bg-violet-50 transition-all group">
              <ImageIcon className="w-6 h-6 text-slate-300 group-hover:text-violet-400 transition-colors" />
              <span className="text-xs text-slate-400 group-hover:text-violet-500 font-medium">Clique para adicionar imagem</span>
              <span className="text-[10px] text-slate-300">PNG, JPG, WEBP</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = (ev) => onUpdate({ imageUrl: ev.target?.result as string })
                reader.readAsDataURL(file)
              }} />
            </label>
          )}
        </div>
      )}

      {/* Notes — always shown */}
      <div>
        <label className={lbl}>Notas do Apresentador</label>
        <textarea value={slide.notes??""} onChange={(e) => onUpdate({ notes: e.target.value })} rows={2} placeholder="Anotações para o apresentador..." className={txt} />
      </div>
    </div>
  )
}

// ─── Add Slide Modal ──────────────────────────────────────────────────────────

function AddSlideModal({ onAdd, onClose }: { onAdd: (type: KOSlideType) => void; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-black text-slate-900">Adicionar Slide</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(Object.entries(SLIDE_META) as [KOSlideType, typeof SLIDE_META[KOSlideType]][]).map(([type, meta]) => {
              const Icon = meta.icon
              return (
                <button key={type} onClick={() => { onAdd(type); onClose() }}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50 transition-all text-left group">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all group-hover:scale-110" style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}30` }}>
                    <Icon className="w-4 h-4" style={{ color: meta.color }} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">{meta.label}</p>
                    <p className="text-[10px] text-slate-400">{meta.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface KOBuilderClientProps {
  project:  ProjectData
  kickoff:  (KickOffData & { id: string }) | null
  existing: (KOPresentation & { id: string; updatedAt: string }) | null
}

export function KOBuilderClient({ project, kickoff, existing }: KOBuilderClientProps) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const [docId,       setDocId]       = useState(existing?.id)
  const [title,       setTitle]       = useState(existing?.title ?? `Kick-Off — ${project.title}`)
  const [slides,      setSlides]      = useState<KOSlide[]>(() =>
    existing?.slides?.length ? existing.slides : generateSlides(project, kickoff)
  )
  const [activeIdx,   setActiveIdx]   = useState(0)
  const [saveStatus,  setSaveStatus]  = useState<"idle"|"saving"|"saved">("idle")
  const [showAddModal,setShowAddModal]= useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const [previewW, setPreviewW] = useState(800)

  useEffect(() => {
    if (!previewRef.current) return
    const ro = new ResizeObserver((e) => setPreviewW(e[0]?.contentRect.width ?? 800))
    ro.observe(previewRef.current)
    return () => ro.disconnect()
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const activeSlide = slides[activeIdx] ?? slides[0]

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = slides.findIndex((s) => s.id === active.id)
    const to   = slides.findIndex((s) => s.id === over.id)
    if (from === -1 || to === -1) return
    const next = arrayMove(slides, from, to)
    setSlides(next)
    setActiveIdx(to)
  }

  function updateActiveSlide(patch: Partial<KOSlide>) {
    setSlides((prev) => prev.map((s, i) => i === activeIdx ? { ...s, ...patch } : s))
  }

  function deleteSlide(idx: number) {
    if (slides.length <= 1) return
    setSlides((prev) => prev.filter((_, i) => i !== idx))
    setActiveIdx(Math.max(0, idx - 1))
  }

  function addSlide(type: KOSlideType) {
    const meta = SLIDE_META[type]
    const newSlide: KOSlide = { id: nanoid(), type, title: meta.label }
    setSlides((prev) => [...prev, newSlide])
    setActiveIdx(slides.length)
  }

  function handleSave() {
    setSaveStatus("saving")
    start(async () => {
      const result = await saveKickOffPresentation({ id: docId, projectId: project.id, title, slides })
      setDocId(result.id)
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2000)
    })
  }

  function handlePresent() {
    start(async () => {
      const result = await saveKickOffPresentation({ id: docId, projectId: project.id, title, slides })
      setDocId(result.id)
      router.push(`/projects/${project.id}/kickoff-presentation/view`)
    })
  }

  const scale = previewW / 960

  return (
    <div className="flex flex-col h-full bg-[#F1F5F9]">

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-200 bg-white shrink-0">
        <Link href={`/projects/${project.id}/kickoff`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-800 transition-colors font-medium shrink-0">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <div className="w-px h-5 bg-slate-200 shrink-0" />
        <Presentation className="w-4 h-4 text-violet-500 shrink-0" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 min-w-0 text-sm font-bold text-slate-800 bg-transparent outline-none border-b border-transparent focus:border-violet-400 transition-colors"
        />
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-slate-400 font-medium">{slides.length} slides</span>
          <button onClick={handleSave} disabled={pending}
            className="inline-flex items-center gap-1.5 px-3.5 h-8 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-violet-400 hover:text-violet-600 transition-all disabled:opacity-50">
            {saveStatus === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : saveStatus === "saved" ? <><Check className="w-3.5 h-3.5 text-emerald-500" /> Salvo</>
              : <><Save className="w-3.5 h-3.5" /> Salvar</>}
          </button>
          <button onClick={handlePresent} disabled={pending}
            className="inline-flex items-center gap-1.5 px-4 h-8 text-xs font-black rounded-xl text-white transition-all hover:opacity-90 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 16px rgba(123,47,190,0.35)" }}>
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Apresentar
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">

        {/* Left — slide list */}
        <div className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col">
          <div className="px-3 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Slides</p>
            <button onClick={() => setShowAddModal(true)} title="Adicionar slide"
              className="p-1 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {slides.map((slide, idx) => (
                  <SlideThumbnail
                    key={slide.id}
                    slide={slide}
                    index={idx}
                    isActive={idx === activeIdx}
                    onClick={() => setActiveIdx(idx)}
                    onDelete={() => deleteSlide(idx)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
          <div className="p-2 border-t border-slate-100">
            <button onClick={() => setShowAddModal(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all border border-dashed border-slate-200 hover:border-violet-300">
              <Plus className="w-3.5 h-3.5" /> Novo slide
            </button>
          </div>
        </div>

        {/* Center — preview */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-auto p-6 flex flex-col items-center">
            <div ref={previewRef} className="w-full max-w-4xl">
              {activeSlide && (
                <div style={{ width: "100%", aspectRatio: "16/9" }}>
                  <KOSlideRenderer slide={activeSlide} scale={scale} onEdit={updateActiveSlide} />
                </div>
              )}
            </div>

            {/* Notes */}
            {activeSlide?.notes && (
              <div className="w-full max-w-4xl mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Notas do Apresentador</p>
                <p className="text-xs text-amber-800">{activeSlide.notes}</p>
              </div>
            )}

            {/* Slide counter */}
            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))}
                disabled={activeIdx === 0}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white disabled:opacity-30 transition-all border border-slate-200 bg-white"
              >
                <ChevronDown className="w-3.5 h-3.5 rotate-90" />
              </button>
              <span className="text-xs font-bold text-slate-500">{activeIdx + 1} / {slides.length}</span>
              <button
                onClick={() => setActiveIdx(Math.min(slides.length - 1, activeIdx + 1))}
                disabled={activeIdx === slides.length - 1}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white disabled:opacity-30 transition-all border border-slate-200 bg-white"
              >
                <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
              </button>
            </div>
          </div>
        </div>

        {/* Right — property editor */}
        {activeSlide && (
          <div className="w-72 shrink-0 bg-white border-l border-slate-200 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(() => { const meta = SLIDE_META[activeSlide.type]; const Icon = meta.icon; return <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} /> })()}
                <p className="text-xs font-bold text-slate-700">{SLIDE_META[activeSlide.type].label}</p>
              </div>
              <span className="text-[9px] font-bold text-slate-300">#{activeIdx + 1}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <PropertyEditor slide={activeSlide} onUpdate={updateActiveSlide} />
            </div>
          </div>
        )}
      </div>

      {showAddModal && <AddSlideModal onAdd={addSlide} onClose={() => setShowAddModal(false)} />}
    </div>
  )
}
