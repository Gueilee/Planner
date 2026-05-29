import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

// ─── Types ────────────────────────────────────────────────────────────────────

export type HistoryEvent = {
  id:          string
  kind:        "meeting" | "lesson" | "risk" | "document" | "status_report" | "project"
  subtype?:    string      // meeting type, document type, etc.
  date:        string      // ISO string
  title:       string
  description?: string
  author?:     string
  meta?:       { label: string; value: string }[]
}

// ─── Config ───────────────────────────────────────────────────────────────────

const MEETING_LABELS: Record<string, string> = {
  CHECKPOINT:      "Checkpoint",
  GO_NO_GO:        "Go/No-Go",
  KICKOFF:         "Kick Off",
  GO_LIVE:         "Go-Live",
  POST_GOLIVE:     "Pós Go-Live",
  LESSONS_LEARNED: "Lições Aprendidas",
  PROJECT_CLOSURE: "Encerramento",
  STATUS_REPORT:   "Status Report",
  PILOT:           "Piloto",
  OTHER:           "Reunião",
}

const MEETING_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  CHECKPOINT:      { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", dot: "#3B82F6" },
  GO_NO_GO:        { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0", dot: "#22C55E" },
  KICKOFF:         { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA", dot: "#F97316" },
  GO_LIVE:         { bg: "#F5F3FF", text: "#6D28D9", border: "#DDD6FE", dot: "#8B5CF6" },
  POST_GOLIVE:     { bg: "#FDF4FF", text: "#86198F", border: "#F5D0FE", dot: "#D946EF" },
  LESSONS_LEARNED: { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", dot: "#F59E0B" },
  PROJECT_CLOSURE: { bg: "#F8FAFC", text: "#475569", border: "#E2E8F0", dot: "#64748B" },
  DEFAULT:         { bg: "#F8FAFC", text: "#475569", border: "#E2E8F0", dot: "#94A3B8" },
}

const KIND_CFG = {
  meeting: {
    emoji: "🤝",
    label: "Reunião",
    defaultBg: "#EFF6FF", defaultText: "#1D4ED8", defaultBorder: "#BFDBFE",
  },
  lesson: {
    emoji: "💡",
    label: "Lição Aprendida",
    defaultBg: "#F5F3FF", defaultText: "#6D28D9", defaultBorder: "#DDD6FE",
  },
  risk: {
    emoji: "⚠️",
    label: "Risco Registrado",
    defaultBg: "#FFF7ED", defaultText: "#C2410C", defaultBorder: "#FED7AA",
  },
  document: {
    emoji: "📄",
    label: "Documento",
    defaultBg: "#F0FDF4", defaultText: "#15803D", defaultBorder: "#BBF7D0",
  },
  status_report: {
    emoji: "📊",
    label: "Status Report",
    defaultBg: "#ECFEFF", defaultText: "#0E7490", defaultBorder: "#A5F3FC",
  },
  project: {
    emoji: "🚀",
    label: "Projeto",
    defaultBg: "#F8FAFC", defaultText: "#0F172A", defaultBorder: "#E2E8F0",
  },
}

const DOC_TYPE_LABELS: Record<string, string> = {
  CHARTER:          "Termo de Abertura",
  KICKOFF:          "Kick-Off",
  MEETING_ATA:      "ATA de Reunião",
  STATUS_REPORT:    "Status Report",
  PROJECT_CLOSURE:  "Termo de Encerramento",
  PRESENTATION:     "Apresentação",
  OTHER:            "Documento",
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProjectHistoryTab({ events }: { events: HistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <div
        className="bg-white rounded-2xl p-12 text-center"
        style={{ border: "1px solid #E2E8F0" }}
      >
        <p className="text-4xl mb-3">📋</p>
        <p className="text-sm font-semibold text-slate-400">Nenhuma atividade registrada</p>
        <p className="text-xs text-slate-300 mt-1">O histórico será preenchido conforme o projeto avança</p>
      </div>
    )
  }

  // Group events by month/year
  const grouped: Map<string, HistoryEvent[]> = new Map()
  for (const ev of events) {
    const key = format(new Date(ev.date), "MMMM 'de' yyyy", { locale: ptBR })
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(ev)
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([month, monthEvents]) => (
        <div key={month}>
          {/* Month label */}
          <div className="flex items-center gap-3 mb-4">
            <span
              className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full"
              style={{ background: "#F1F5F9", color: "#64748B" }}
            >
              {month}
            </span>
            <div className="flex-1 h-px" style={{ background: "#F1F5F9" }} />
          </div>

          {/* Events */}
          <div className="relative space-y-3 pl-7">
            {/* Vertical line */}
            <div
              className="absolute left-2.5 top-2 bottom-2 w-px"
              style={{ background: "linear-gradient(to bottom, #E2E8F0, transparent)" }}
            />

            {monthEvents.map((ev) => {
              const meetingColor = ev.kind === "meeting" && ev.subtype
                ? (MEETING_COLORS[ev.subtype] ?? MEETING_COLORS.DEFAULT)
                : null
              const kindCfg = KIND_CFG[ev.kind]
              const dotColor = meetingColor?.dot ?? (ev.kind === "lesson" ? "#7C3AED" : ev.kind === "risk" ? "#F97316" : "#94A3B8")
              const bgColor  = meetingColor?.bg   ?? kindCfg.defaultBg
              const txtColor = meetingColor?.text  ?? kindCfg.defaultText
              const bdrColor = meetingColor?.border ?? kindCfg.defaultBorder

              return (
                <div key={ev.id} className="relative flex gap-3">
                  {/* Dot */}
                  <div
                    className="absolute -left-[11px] w-3 h-3 rounded-full border-2 border-white shrink-0 mt-3.5"
                    style={{ background: dotColor, boxShadow: `0 0 0 2px ${dotColor}22` }}
                  />

                  {/* Card */}
                  <div
                    className="flex-1 rounded-xl p-4 hover:shadow-sm transition-all"
                    style={{ background: "#FFFFFF", border: "1px solid #F1F5F9" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Kind badge */}
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 mt-0.5"
                          style={{ background: bgColor, color: txtColor, borderColor: bdrColor }}
                        >
                          {kindCfg.emoji}&nbsp;
                          {ev.kind === "meeting" && ev.subtype
                            ? MEETING_LABELS[ev.subtype] ?? "Reunião"
                            : ev.kind === "document" && ev.subtype
                              ? (DOC_TYPE_LABELS[ev.subtype] ?? "Documento")
                              : kindCfg.label}
                        </span>

                        {/* Title + description */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#0F172A] leading-snug">{ev.title}</p>
                          {ev.description && (
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">{ev.description}</p>
                          )}
                          {ev.meta && ev.meta.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {ev.meta.map((m) => (
                                <span key={m.label} className="text-[10px] text-slate-400">
                                  <span className="font-semibold text-slate-500">{m.label}:</span> {m.value}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Date + author */}
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-bold text-slate-500">
                          {format(new Date(ev.date), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                        {ev.author && (
                          <p className="text-[10px] text-slate-400 mt-0.5">{ev.author}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Builder helper (used in page.tsx) ────────────────────────────────────────

export function buildHistoryEvents(data: {
  createdAt: Date
  meetings: {
    id: string; type: string; title: string; date: Date
    createdBy: { name: string }
    _count: { participants: number }
    observations?: string | null
  }[]
  lessonsLearned: {
    id: string; lesson: string; occurrence: string; area: string
    influence: string; impact: string; phase: string
    identifiedAt: Date; createdAt: Date
    createdBy: { name: string }
  }[]
  risks: { id: string; description: string; status: string; probability: string; impact: string; createdAt: Date }[]
  documents: { id: string; type: string; title: string; createdAt: Date }[]
  statusReports: { id: string; overallStatus: string; periodEnd: Date; createdBy: { name: string }; createdAt: Date }[]
}): HistoryEvent[] {
  const events: HistoryEvent[] = []

  // Project created
  events.push({
    id:          "project-created",
    kind:        "project",
    date:        data.createdAt.toISOString(),
    title:       "Projeto criado",
    description: "O projeto foi registrado no sistema",
  })

  // Meetings
  for (const m of data.meetings) {
    events.push({
      id:          m.id,
      kind:        "meeting",
      subtype:     m.type,
      date:        m.date.toISOString(),
      title:       m.title,
      description: m.observations ?? undefined,
      author:      m.createdBy.name,
      meta: m._count.participants > 0
        ? [{ label: "Participantes", value: String(m._count.participants) }]
        : undefined,
    })
  }

  // Lessons
  for (const l of data.lessonsLearned) {
    events.push({
      id:          l.id,
      kind:        "lesson",
      date:        l.identifiedAt.toISOString(),
      title:       l.lesson.length > 120 ? l.lesson.slice(0, 120) + "…" : l.lesson,
      description: l.occurrence,
      author:      l.createdBy.name,
      meta: [
        { label: "Fase",  value: l.phase },
        { label: "Área",  value: l.area },
        { label: "Impacto", value: l.impact },
      ],
    })
  }

  // Risks
  for (const r of data.risks) {
    events.push({
      id:          r.id,
      kind:        "risk",
      date:        r.createdAt.toISOString(),
      title:       r.description.length > 100 ? r.description.slice(0, 100) + "…" : r.description,
      meta: [
        { label: "Severidade",   value: r.status },
        { label: "Probabilidade", value: r.probability },
        { label: "Impacto",      value: r.impact },
      ],
    })
  }

  // Documents (exclude MEETING_ATA to avoid duplication with meeting events)
  for (const d of data.documents) {
    if (d.type === "MEETING_ATA") continue
    events.push({
      id:      d.id,
      kind:    "document",
      subtype: d.type,
      date:    d.createdAt.toISOString(),
      title:   d.title,
    })
  }

  // Status reports
  for (const s of data.statusReports) {
    events.push({
      id:      s.id,
      kind:    "status_report",
      date:    s.createdAt.toISOString(),
      title:   `Status Report — ${format(s.periodEnd, "MMM/yyyy", { locale: ptBR })}`,
      author:  s.createdBy.name,
      meta:    [{ label: "Status Geral", value: s.overallStatus }],
    })
  }

  // Sort newest-first
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return events
}
