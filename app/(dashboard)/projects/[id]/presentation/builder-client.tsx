"use client"

import { useState, useCallback, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Plus, Save, Play, ArrowLeft, Upload, Trash2, GripVertical,
  Type, Image, Table2, Quote, LayoutTemplate, Users, DollarSign,
  Clock, BookOpen, Loader2, X, ChevronDown, Eye, FileText,
  AlignLeft, Tag, Sparkles,
} from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { savePresentation } from "@/lib/actions/presentation"
import type { Slide, SlideType, Presentation, PresentationTheme, TableData, TeamMember } from "@/lib/types/presentation"

// ── Helpers ───────────────────────────────────────────────────────────────────

function nanoid() { return Math.random().toString(36).slice(2, 10) }

const SLIDE_TYPE_META: Record<SlideType, { label: string; icon: typeof Type; color: string; desc: string }> = {
  cover:      { label: "Capa",           icon: Tag,           color: "#7B2FBE", desc: "Slide de abertura com título" },
  content:    { label: "Conteúdo",       icon: AlignLeft,     color: "#2463FF", desc: "Texto livre com título" },
  bullets:    { label: "Tópicos",        icon: BookOpen,      color: "#0891B2", desc: "Lista de pontos-chave" },
  image:      { label: "Imagem",         icon: Image,         color: "#059669", desc: "Imagem com legenda" },
  "data-table": { label: "Tabela",      icon: Table2,        color: "#D97706", desc: "Tabela de dados do Excel" },
  quote:      { label: "Destaque",       icon: Quote,         color: "#DC2626", desc: "Citação ou dado importante" },
  timeline:   { label: "Cronograma",     icon: Clock,         color: "#7C3AED", desc: "Linha do tempo visual" },
  financial:  { label: "Financeiro",     icon: DollarSign,    color: "#047857", desc: "Cards de valores financeiros" },
  team:       { label: "Equipe",         icon: Users,         color: "#1D4ED8", desc: "Grid com membros" },
  split:      { label: "Dois Blocos",    icon: LayoutTemplate,color: "#9333EA", desc: "Layout de duas colunas" },
  closing:    { label: "Encerramento",   icon: Sparkles,      color: "#BE185D", desc: "Slide final de encerramento" },
}

type RiskItem = { description: string; level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; mitigation: string }

type ProjectData = {
  id: string
  title: string
  description: string | null
  status: string
  origin: string | null
  scope: string | null
  asIs: string | null
  toBe: string | null
  assumptions: string | null
  restrictions: string | null
  expectedStart: string | null
  expectedEnd: string | null
  economy: number | null
  estimatedCosts: number | null
  budget: number | null
  risks: RiskItem[]
  sponsor: { name: string; department: string | null } | null
  members: { role: string; user: { name: string; department: string | null; role: string } }[]
}

// ── Auto-generate initial slides from project data ─────────────────────────
function generateSlides(project: ProjectData): Slide[] {
  const slides: Slide[] = []
  const today = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })

  const sponsorLabel = project.sponsor
    ? `Solicitante: ${project.sponsor.name}${project.sponsor.department ? " · " + project.sponsor.department : ""}`
    : ""

  slides.push({
    id: nanoid(), type: "cover",
    title: project.title,
    subtitle: `Apresentação Técnica · ${today}`,
    content: sponsorLabel,
  })

  if (project.asIs) {
    slides.push({ id: nanoid(), type: "content", title: "Situação Atual — AS IS", content: project.asIs })
  }

  if (project.toBe) {
    slides.push({ id: nanoid(), type: "content", title: "Objetivo — TO BE", content: project.toBe })
  }

  if (project.scope) {
    const areas = project.members
      .map((m) => m.user.department ?? "")
      .filter((a, i, arr) => a !== "" && arr.indexOf(a) === i)
    slides.push({
      id: nanoid(), type: "bullets", title: "Escopo do Projeto",
      bullets: [
        project.scope,
        ...(areas.length > 0 ? [`Áreas envolvidas: ${areas.join(", ")}`] : []),
        ...(project.assumptions ? [`Premissa: ${project.assumptions}`] : []),
        ...(project.restrictions ? [`Restrição: ${project.restrictions}`] : []),
      ],
    })
  }

  if (project.expectedStart || project.expectedEnd) {
    const items = []
    if (project.expectedStart) items.push({ date: format(new Date(project.expectedStart), "MM/yyyy"), label: "Início", done: false })
    if (project.expectedEnd) items.push({ date: format(new Date(project.expectedEnd), "MM/yyyy"), label: "Conclusão", done: false })
    slides.push({ id: nanoid(), type: "timeline", title: "Cronograma Previsto", timelineItems: items })
  }

  const hasFinancial = project.budget || project.estimatedCosts || project.economy
  if (hasFinancial) {
    const cards = []
    if (project.budget) cards.push({ label: "Budget", value: project.budget.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), color: "#10B981" })
    if (project.estimatedCosts) cards.push({ label: "Custo Estimado", value: project.estimatedCosts.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), color: "#F59E0B" })
    if (project.economy) cards.push({ label: "Economia Esperada", value: project.economy.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), color: "#2463FF" })
    slides.push({ id: nanoid(), type: "financial", title: "Análise Financeira", financialCards: cards })
  }

  if (project.risks.length > 0) {
    slides.push({
      id: nanoid(), type: "bullets", title: "Riscos Identificados",
      bullets: project.risks.map((r) => `[${r.level === "HIGH" ? "ALTO" : r.level === "MEDIUM" ? "MÉDIO" : "BAIXO"}] ${r.description}`),
    })
  }

  if (project.members.length > 0) {
    slides.push({
      id: nanoid(), type: "team", title: "Equipe do Projeto",
      teamMembers: project.members.map((m) => ({
        name: m.user.name,
        role: m.role,
        department: m.user.department,
        initials: m.user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(),
      })),
    })
  }

  slides.push({ id: nanoid(), type: "closing", title: "Obrigado!", subtitle: "Perguntas & Respostas" })
  return slides
}

// ── Slide Mini-Preview (thumbnail) ────────────────────────────────────────────

function SlideThumbnail({ slide, index, isActive, onClick, onDelete }: {
  slide: Slide
  index: number
  isActive: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id })
  const meta = SLIDE_TYPE_META[slide.type]
  const Icon = meta.icon

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all select-none ${
        isActive
          ? "bg-[rgba(123,47,190,0.12)] border border-[rgba(123,47,190,0.30)]"
          : "hover:bg-slate-50 border border-transparent"
      }`}
      onClick={onClick}
    >
      {/* Drag handle */}
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing shrink-0 text-slate-300 hover:text-slate-500">
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {/* Index + icon */}
      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}30` }}>
        <Icon className="w-3 h-3" style={{ color: meta.color }} />
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${isActive ? "text-[#7B2FBE]" : "text-[#0F172A]"}`}>
          {slide.title || meta.label}
        </p>
        <p className="text-[10px] text-slate-400 truncate">{meta.label}</p>
      </div>

      {/* Number */}
      <span className="text-[10px] font-bold text-slate-300 shrink-0">{index + 1}</span>

      {/* Delete */}
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded text-slate-300 hover:text-red-400"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// ── Slide Preview (center) ─────────────────────────────────────────────────────

function SlidePreview({ slide, theme }: { slide: Slide; theme: PresentationTheme }) {
  const isDark = theme === "dark"
  const bg = isDark ? "#0a0a1a" : theme === "slate" ? "#0f172a" : "#1e0a3c"
  const cardBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)"

  return (
    <div
      style={{
        width: "100%", aspectRatio: "16/9", borderRadius: "12px",
        background: bg, overflow: "hidden", position: "relative",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}
    >
      {/* Background effects */}
      <div style={{ position: "absolute", width: "400px", height: "400px", borderRadius: "50%", top: "-100px", right: "-100px", background: "radial-gradient(circle, rgba(123,47,190,0.15) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: "300px", height: "300px", borderRadius: "50%", bottom: "-80px", left: "-80px", background: "radial-gradient(circle, rgba(36,99,255,0.12) 0%, transparent 65%)", pointerEvents: "none" }} />

      <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", padding: "clamp(16px, 3%, 40px)" }}>
        <SlideContent slide={slide} preview />
      </div>

      <style jsx global>{`
        .slide-preview-gradient-text {
          background: linear-gradient(135deg, #f8fafc 30%, #C084FC 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>
    </div>
  )
}

// ── Slide Content Renderer ─────────────────────────────────────────────────────

export function SlideContent({ slide, preview }: { slide: Slide; preview?: boolean }) {
  const scale = preview ? 0.42 : 1
  const s = (v: number) => `${v * scale}px`

  switch (slide.type) {

    case "cover": return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: s(24) }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: s(8), padding: `${s(4)} ${s(16)}`, borderRadius: "999px", background: "rgba(123,47,190,0.18)", border: "1px solid rgba(123,47,190,0.4)", width: "fit-content" }}>
          <span style={{ fontSize: s(11), fontWeight: 800, color: "#C084FC", letterSpacing: "0.18em", textTransform: "uppercase" }}>Apresentação Técnica</span>
        </div>
        <div>
          <h1 className="slide-preview-gradient-text" style={{ fontSize: s(44), fontWeight: 900, lineHeight: 1.1, margin: 0 }}>{slide.title}</h1>
          <div style={{ height: s(3), width: s(80), background: "linear-gradient(90deg, #7B2FBE, #2463FF)", borderRadius: "999px", marginTop: s(12) }} />
        </div>
        {slide.subtitle && <p style={{ fontSize: s(16), color: "rgba(248,250,252,0.55)", margin: 0 }}>{slide.subtitle}</p>}
        {slide.content && <p style={{ fontSize: s(13), color: "rgba(248,250,252,0.40)", margin: 0 }}>{slide.content}</p>}
      </div>
    )

    case "content": return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: s(20) }}>
        <div>
          <p style={{ fontSize: s(10), fontWeight: 800, color: "rgba(248,250,252,0.35)", letterSpacing: "0.18em", textTransform: "uppercase", margin: `0 0 ${s(8)}` }}>{SLIDE_TYPE_META[slide.type].label}</p>
          <h2 style={{ fontSize: s(28), fontWeight: 900, color: "#f8fafc", margin: 0, lineHeight: 1.2 }}>{slide.title}</h2>
          <div style={{ height: s(2), width: s(60), background: "linear-gradient(90deg, #7B2FBE, transparent)", borderRadius: "999px", marginTop: s(10) }} />
        </div>
        <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(123,47,190,0.20)", borderLeft: `${s(3)} solid #7B2FBE`, borderRadius: s(12), padding: s(20) }}>
          <p style={{ fontSize: s(15), color: "rgba(248,250,252,0.75)", lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap" }}>{slide.content}</p>
        </div>
      </div>
    )

    case "bullets": return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: s(20) }}>
        <div>
          <h2 style={{ fontSize: s(28), fontWeight: 900, color: "#f8fafc", margin: 0 }}>{slide.title}</h2>
          <div style={{ height: s(2), width: s(60), background: "linear-gradient(90deg, #2463FF, transparent)", borderRadius: "999px", marginTop: s(10) }} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: s(12) }}>
          {(slide.bullets ?? []).map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: s(14), padding: `${s(10)} ${s(16)}`, borderRadius: s(10), background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ width: s(6), height: s(6), borderRadius: "50%", background: "#7B2FBE", boxShadow: "0 0 8px rgba(123,47,190,0.6)", marginTop: s(6), flexShrink: 0 }} />
              <p style={{ fontSize: s(14), color: "rgba(248,250,252,0.80)", margin: 0, lineHeight: 1.5 }}>{b}</p>
            </div>
          ))}
        </div>
      </div>
    )

    case "image": return (
      <div style={{ flex: 1, position: "relative", borderRadius: s(12), overflow: "hidden", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {slide.imageUrl ? (
          <>
            <img src={slide.imageUrl} alt={slide.title} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            {(slide.title || slide.imageCaption) && (
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: `${s(16)} ${s(20)}`, background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)" }}>
                {slide.title && <p style={{ fontSize: s(16), fontWeight: 800, color: "white", margin: 0 }}>{slide.title}</p>}
                {slide.imageCaption && <p style={{ fontSize: s(11), color: "rgba(255,255,255,0.6)", margin: 0 }}>{slide.imageCaption}</p>}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: s(12) }}>
            <Image className="opacity-20" style={{ width: s(48), height: s(48), color: "white" }} />
            <p style={{ fontSize: s(14), color: "rgba(248,250,252,0.30)", margin: 0 }}>Adicione uma imagem</p>
          </div>
        )}
      </div>
    )

    case "data-table": {
      const td = slide.tableData
      if (!td) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "rgba(248,250,252,0.30)", fontSize: s(14) }}>Importe um arquivo Excel</p></div>
      return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: s(16) }}>
          <h2 style={{ fontSize: s(22), fontWeight: 900, color: "#f8fafc", margin: 0 }}>{slide.title}{td.sheetName ? ` — ${td.sheetName}` : ""}</h2>
          <div style={{ flex: 1, overflow: "hidden", borderRadius: s(10), border: "1px solid rgba(255,255,255,0.08)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: s(11) }}>
              <thead>
                <tr style={{ background: "linear-gradient(90deg, rgba(123,47,190,0.40), rgba(36,99,255,0.30))" }}>
                  {td.headers.map((h, i) => (
                    <th key={i} style={{ padding: `${s(8)} ${s(12)}`, textAlign: "left", color: "#C084FC", fontWeight: 800, fontSize: s(9.5), textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {td.rows.slice(0, 8).map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                    {td.headers.map((_, ci) => (
                      <td key={ci} style={{ padding: `${s(6)} ${s(12)}`, color: "rgba(248,250,252,0.75)", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: s(10.5) }}>{String(row[ci] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    case "quote": return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: s(24), padding: `0 ${s(40)}` }}>
        <div style={{ fontSize: s(80), fontFamily: "Georgia, serif", color: "rgba(123,47,190,0.35)", lineHeight: 0.7, alignSelf: "flex-start" }}>"</div>
        <h2 style={{ fontSize: s(28), fontWeight: 700, color: "#f8fafc", textAlign: "center", lineHeight: 1.4, margin: 0, fontStyle: "italic" }}>{slide.title}</h2>
        {slide.content && <p style={{ fontSize: s(14), color: "rgba(248,250,252,0.45)", margin: 0, textAlign: "center" }}>— {slide.content}</p>}
      </div>
    )

    case "timeline": return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: s(20) }}>
        <h2 style={{ fontSize: s(28), fontWeight: 900, color: "#f8fafc", margin: 0 }}>{slide.title}</h2>
        <div style={{ flex: 1, display: "flex", alignItems: "center", paddingTop: s(20) }}>
          <div style={{ flex: 1, position: "relative" }}>
            <div style={{ height: s(2), background: "linear-gradient(90deg, #7B2FBE, #2463FF, #00C4E0)", borderRadius: "999px" }} />
            <div style={{ position: "absolute", top: s(-20), left: 0, right: 0, display: "flex", justifyContent: "space-around" }}>
              {(slide.timelineItems ?? []).map((item, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: s(10) }}>
                  <div style={{ width: s(14), height: s(14), borderRadius: "50%", background: i % 2 === 0 ? "#7B2FBE" : "#2463FF", boxShadow: `0 0 ${s(12)} rgba(123,47,190,0.6)`, border: `${s(2)} solid rgba(255,255,255,0.3)` }} />
                  <div style={{ textAlign: "center", marginTop: s(12) }}>
                    <p style={{ fontSize: s(14), fontWeight: 800, color: "#C084FC", margin: 0 }}>{item.date}</p>
                    <p style={{ fontSize: s(12), color: "rgba(248,250,252,0.60)", margin: 0 }}>{item.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )

    case "financial": return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: s(20) }}>
        <h2 style={{ fontSize: s(28), fontWeight: 900, color: "#f8fafc", margin: 0 }}>{slide.title}</h2>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${(slide.financialCards ?? []).length}, 1fr)`, gap: s(16), alignContent: "start" }}>
          {(slide.financialCards ?? []).map((card, i) => (
            <div key={i} style={{ padding: s(20), borderRadius: s(16), background: `${card.color}12`, border: `1px solid ${card.color}30`, display: "flex", flexDirection: "column", gap: s(8) }}>
              <p style={{ fontSize: s(10), fontWeight: 700, color: "rgba(248,250,252,0.40)", textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>{card.label}</p>
              <p style={{ fontSize: s(24), fontWeight: 900, color: card.color, margin: 0, lineHeight: 1 }}>{card.value}</p>
            </div>
          ))}
        </div>
      </div>
    )

    case "team": return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: s(20) }}>
        <h2 style={{ fontSize: s(28), fontWeight: 900, color: "#f8fafc", margin: 0 }}>{slide.title}</h2>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: s(12), alignContent: "start" }}>
          {(slide.teamMembers ?? []).map((m, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: s(10), padding: s(16), borderRadius: s(12), background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ width: s(44), height: s(44), borderRadius: "50%", background: `hsl(${(i * 60 + 240) % 360}, 60%, 35%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: s(15), fontWeight: 900, color: "white" }}>{m.initials}</div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: s(12), fontWeight: 700, color: "#f8fafc", margin: 0 }}>{m.name}</p>
                <p style={{ fontSize: s(10), color: "rgba(248,250,252,0.45)", margin: 0 }}>{m.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )

    case "split": return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: s(16) }}>
        <h2 style={{ fontSize: s(26), fontWeight: 900, color: "#f8fafc", margin: 0 }}>{slide.title}</h2>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: s(16) }}>
          <div style={{ padding: s(18), borderRadius: s(12), background: "rgba(123,47,190,0.08)", border: "1px solid rgba(123,47,190,0.20)", borderTop: "2px solid #7B2FBE" }}>
            <p style={{ fontSize: s(13), color: "rgba(248,250,252,0.75)", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{slide.splitLeft}</p>
          </div>
          <div style={{ padding: s(18), borderRadius: s(12), background: "rgba(36,99,255,0.08)", border: "1px solid rgba(36,99,255,0.20)", borderTop: "2px solid #2463FF" }}>
            <p style={{ fontSize: s(13), color: "rgba(248,250,252,0.75)", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{slide.splitRight}</p>
          </div>
        </div>
      </div>
    )

    case "closing": return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: s(20), textAlign: "center" }}>
        <div style={{ width: s(80), height: s(80), borderRadius: "50%", background: "linear-gradient(135deg, #7B2FBE, #2463FF)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 60px rgba(123,47,190,0.5)", fontSize: s(36) }}>✨</div>
        <h1 style={{ fontSize: s(48), fontWeight: 900, margin: 0, background: "linear-gradient(135deg, #f8fafc, #C084FC)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{slide.title}</h1>
        {slide.subtitle && <p style={{ fontSize: s(22), color: "rgba(248,250,252,0.50)", margin: 0 }}>{slide.subtitle}</p>}
        {slide.content && <p style={{ fontSize: s(14), color: "rgba(248,250,252,0.35)", margin: 0 }}>{slide.content}</p>}
      </div>
    )

    default: return null
  }
}

// ── Property Editor ───────────────────────────────────────────────────────────

function PropertyEditor({ slide, onChange }: { slide: Slide; onChange: (s: Slide) => void }) {
  const upd = (patch: Partial<Slide>) => onChange({ ...slide, ...patch })

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-[10px] font-700 uppercase tracking-widest text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  )

  const textarea = (val: string | undefined, key: keyof Slide, rows = 4) => (
    <textarea
      value={val ?? ""}
      onChange={(e) => upd({ [key]: e.target.value })}
      rows={rows}
      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] resize-y outline-none focus:border-[#7B2FBE] transition-colors"
      style={{ lineHeight: "1.6" }}
    />
  )

  const input = (val: string | undefined, key: keyof Slide) => (
    <input
      value={val ?? ""}
      onChange={(e) => upd({ [key]: e.target.value })}
      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] outline-none focus:border-[#7B2FBE] transition-colors"
    />
  )

  return (
    <div className="space-y-4 overflow-y-auto flex-1 pr-1">
      <Field label="Título">{input(slide.title, "title")}</Field>

      {["cover", "closing"].includes(slide.type) && (
        <Field label="Subtítulo">{input(slide.subtitle, "subtitle")}</Field>
      )}

      {["cover", "content", "closing"].includes(slide.type) && (
        <Field label="Texto">{textarea(slide.content, "content")}</Field>
      )}

      {slide.type === "bullets" && (
        <Field label="Tópicos (um por linha)">
          <textarea
            value={(slide.bullets ?? []).join("\n")}
            onChange={(e) => upd({ bullets: e.target.value.split("\n") })}
            rows={6}
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] resize-y outline-none focus:border-[#7B2FBE] transition-colors"
          />
        </Field>
      )}

      {slide.type === "quote" && (
        <>
          <Field label="Citação / Destaque">{input(slide.title, "title")}</Field>
          <Field label="Atribuição">{input(slide.content, "content")}</Field>
        </>
      )}

      {slide.type === "image" && (
        <>
          <Field label="URL da imagem">{input(slide.imageUrl, "imageUrl")}</Field>
          <Field label="Legenda">{input(slide.imageCaption, "imageCaption")}</Field>
        </>
      )}

      {slide.type === "split" && (
        <>
          <Field label="Bloco esquerdo">{textarea(slide.splitLeft, "splitLeft")}</Field>
          <Field label="Bloco direito">{textarea(slide.splitRight, "splitRight")}</Field>
        </>
      )}

      {slide.type === "timeline" && (
        <Field label="Marcos (data | rótulo, um por linha)">
          <textarea
            value={(slide.timelineItems ?? []).map((t) => `${t.date} | ${t.label}`).join("\n")}
            onChange={(e) => upd({
              timelineItems: e.target.value.split("\n").filter(Boolean).map((line) => {
                const [date, ...rest] = line.split("|")
                return { date: date.trim(), label: rest.join("|").trim(), done: false }
              }),
            })}
            rows={4}
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] resize-y outline-none focus:border-[#7B2FBE] transition-colors"
            placeholder="01/2025 | Início&#10;06/2025 | Go Live"
          />
        </Field>
      )}

      {slide.type === "financial" && (
        <Field label="Cards (rótulo | valor | cor, um por linha)">
          <textarea
            value={(slide.financialCards ?? []).map((c) => `${c.label} | ${c.value} | ${c.color}`).join("\n")}
            onChange={(e) => upd({
              financialCards: e.target.value.split("\n").filter(Boolean).map((line) => {
                const [label, value, color] = line.split("|").map((s) => s.trim())
                return { label, value, color: color || "#10B981" }
              }),
            })}
            rows={4}
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] resize-y outline-none focus:border-[#7B2FBE] transition-colors"
          />
        </Field>
      )}

      <Field label="Notas do apresentador">
        {textarea(slide.notes, "notes", 3)}
      </Field>
    </div>
  )
}

// ── Main Builder ──────────────────────────────────────────────────────────────

interface BuilderClientProps {
  project: ProjectData
  existing: Presentation | null
}

export function BuilderClient({ project, existing }: BuilderClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [presTitle, setPresTitle] = useState(existing?.title ?? `${project.title} — Apresentação Técnica`)
  const [theme, setTheme] = useState<PresentationTheme>(existing?.theme ?? "dark")
  const [slides, setSlides] = useState<Slide[]>(() => existing?.slides ?? generateSlides(project))
  const [activeId, setActiveId] = useState<string>(slides[0]?.id ?? "")
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [importing, setImporting] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [presId, setPresId] = useState(existing?.id)

  const activeSlide = slides.find((s) => s.id === activeId)
  const activeIndex = slides.findIndex((s) => s.id === activeId)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setSlides((prev) => {
        const oldIdx = prev.findIndex((s) => s.id === active.id)
        const newIdx = prev.findIndex((s) => s.id === over.id)
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }

  function addSlide(type: SlideType) {
    const meta = SLIDE_TYPE_META[type]
    const newSlide: Slide = {
      id: nanoid(), type,
      title: meta.label,
      bullets: type === "bullets" ? ["Ponto 1", "Ponto 2"] : undefined,
      financialCards: type === "financial" ? [{ label: "Valor", value: "R$ 0,00", color: "#10B981" }] : undefined,
      timelineItems: type === "timeline" ? [{ date: "01/2025", label: "Início" }, { date: "12/2025", label: "Fim" }] : undefined,
      teamMembers: type === "team" ? project.members.map((m, i) => ({ name: m.user.name, role: m.role, department: m.user.department, initials: m.user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() })) : undefined,
      splitLeft: type === "split" ? "Bloco esquerdo..." : undefined,
      splitRight: type === "split" ? "Bloco direito..." : undefined,
    }
    const insertAt = activeIndex >= 0 ? activeIndex + 1 : slides.length
    setSlides((prev) => [...prev.slice(0, insertAt), newSlide, ...prev.slice(insertAt)])
    setActiveId(newSlide.id)
    setShowAddMenu(false)
  }

  function deleteSlide(id: string) {
    setSlides((prev) => {
      const next = prev.filter((s) => s.id !== id)
      if (id === activeId && next.length > 0) setActiveId(next[Math.max(0, prev.findIndex((s) => s.id === id) - 1)].id)
      return next
    })
  }

  function updateSlide(updated: Slide) {
    setSlides((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setImporting(true)

    const newSlides: Slide[] = []
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
      if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
        // Upload image first
        const fd = new FormData(); fd.append("files", file)
        try {
          const res = await fetch("/api/upload", { method: "POST", body: fd })
          const data = await res.json()
          if (data.files?.[0]) {
            newSlides.push({ id: nanoid(), type: "image", title: file.name.replace(/\.[^.]+$/, ""), imageUrl: data.files[0].url, imageCaption: "" })
          }
        } catch {}
      } else {
        // Parse document
        const fd = new FormData(); fd.append("file", file)
        try {
          const res = await fetch("/api/parse-file", { method: "POST", body: fd })
          const data = await res.json()
          if (data.type === "excel" && data.sheets) {
            for (const sheet of data.sheets as { name: string; headers: string[]; rows: (string|number|null)[][] }[]) {
              newSlides.push({ id: nanoid(), type: "data-table", title: sheet.name, tableData: { headers: sheet.headers, rows: sheet.rows, sheetName: sheet.name } })
            }
          } else if ((data.type === "word" || data.type === "text") && data.paragraphs) {
            const paras = data.paragraphs as string[]
            if (paras.length === 1) {
              newSlides.push({ id: nanoid(), type: "content", title: file.name.replace(/\.[^.]+$/, ""), content: paras[0] })
            } else if (paras.length <= 8) {
              newSlides.push({ id: nanoid(), type: "bullets", title: file.name.replace(/\.[^.]+$/, ""), bullets: paras })
            } else {
              for (let i = 0; i < paras.length; i += 5) {
                newSlides.push({ id: nanoid(), type: "bullets", title: `${file.name.replace(/\.[^.]+$/, "")} (${i / 5 + 1})`, bullets: paras.slice(i, i + 5) })
              }
            }
          }
        } catch {}
      }
    }

    if (newSlides.length > 0) {
      const insertAt = activeIndex >= 0 ? activeIndex + 1 : slides.length
      setSlides((prev) => [...prev.slice(0, insertAt), ...newSlides, ...prev.slice(insertAt)])
      setActiveId(newSlides[0].id)
    }
    setImporting(false)
    e.target.value = ""
  }

  function handleSave() {
    setSaveStatus("saving")
    startTransition(async () => {
      const result = await savePresentation({
        id: presId,
        projectId: project.id,
        title: presTitle,
        theme,
        slides,
      })
      setPresId(result.id)
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2000)
    })
  }

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC]">
      {/* ── Top Bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 h-14 border-b border-slate-200 bg-white shrink-0">
        <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#0F172A] transition-colors font-medium">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
        <div className="w-px h-5 bg-slate-200" />

        <input
          value={presTitle}
          onChange={(e) => setPresTitle(e.target.value)}
          className="flex-1 text-sm font-semibold text-[#0F172A] bg-transparent border-none outline-none placeholder-slate-400 min-w-0"
          placeholder="Nome da apresentação"
        />

        {/* Theme selector */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 border border-slate-200">
          {(["dark", "slate", "corporate"] as PresentationTheme[]).map((t) => (
            <button key={t} onClick={() => setTheme(t)} className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all capitalize ${theme === t ? "bg-white text-[#0F172A] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
              {t === "dark" ? "Escuro" : t === "slate" ? "Slate" : "Corp."}
            </button>
          ))}
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-3.5 h-8 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-[#7B2FBE] hover:text-[#7B2FBE] transition-all"
        >
          {saveStatus === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saveStatus === "saved" ? "✓ Salvo" : <><Save className="w-3.5 h-3.5" /> Salvar</>}
        </button>

        {/* Present */}
        {presId && (
          <Link
            href={`/projects/${project.id}/presentation/view?id=${presId}`}
            className="inline-flex items-center gap-2 px-4 h-8 text-xs font-bold rounded-xl text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 16px rgba(123,47,190,0.35)" }}
          >
            <Play className="w-3.5 h-3.5" /> Apresentar
          </Link>
        )}
        {!presId && (
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-4 h-8 text-xs font-bold rounded-xl text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 16px rgba(123,47,190,0.35)" }}
          >
            <Save className="w-3.5 h-3.5" /> Salvar e Apresentar
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── Left: Slide List ─────────────────────────────────────────── */}
        <div className="w-64 flex flex-col border-r border-slate-200 bg-white shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{slides.length} Slides</span>
            <div className="relative">
              <button onClick={() => setShowAddMenu((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#7B2FBE] hover:text-[#9333EA] transition-colors">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
              {showAddMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50 overflow-hidden">
                  {(Object.entries(SLIDE_TYPE_META) as [SlideType, typeof SLIDE_TYPE_META[SlideType]][]).map(([type, meta]) => {
                    const Icon = meta.icon
                    return (
                      <button key={type} onClick={() => addSlide(type)} className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors">
                        <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: `${meta.color}15` }}>
                          <Icon className="w-3 h-3" style={{ color: meta.color }} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-[#0F172A]">{meta.label}</p>
                          <p className="text-[10px] text-slate-400">{meta.desc}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
                {slides.map((slide, i) => (
                  <SlideThumbnail
                    key={slide.id} slide={slide} index={i}
                    isActive={slide.id === activeId}
                    onClick={() => setActiveId(slide.id)}
                    onDelete={() => deleteSlide(slide.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Import files */}
          <div className="px-4 pb-4 pt-2 border-t border-slate-100">
            <input ref={fileInputRef} type="file" className="hidden" multiple accept=".xlsx,.xls,.csv,.docx,.doc,.txt,.md,.jpg,.jpeg,.png,.gif,.webp" onChange={handleFileImport} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-400 hover:border-[#7B2FBE] hover:text-[#7B2FBE] transition-all"
            >
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {importing ? "Importando..." : "Importar Arquivos"}
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-1.5">Excel · Word · Imagens · Texto</p>
          </div>
        </div>

        {/* ── Center: Preview ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 min-w-0">
          {activeSlide ? (
            <>
              <div className="w-full" style={{ maxWidth: "min(100%, calc((100vh - 180px) * 16/9))" }}>
                <SlidePreview slide={activeSlide} theme={theme} />
              </div>
              <p className="text-xs text-slate-400 mt-4 font-medium">
                Slide {activeIndex + 1} de {slides.length} · <span className="text-[#7B2FBE]">{SLIDE_TYPE_META[activeSlide.type].label}</span>
              </p>
            </>
          ) : (
            <div className="text-center text-slate-400">
              <LayoutTemplate className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold">Nenhum slide selecionado</p>
            </div>
          )}
        </div>

        {/* ── Right: Properties ────────────────────────────────────────── */}
        <div className="w-72 flex flex-col border-l border-slate-200 bg-white shrink-0">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Propriedades</span>
          </div>
          {activeSlide ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <PropertyEditor slide={activeSlide} onChange={updateSlide} />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-slate-400">Selecione um slide</p>
            </div>
          )}
        </div>
      </div>

      {/* Click-outside for add menu */}
      {showAddMenu && <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />}
    </div>
  )
}
