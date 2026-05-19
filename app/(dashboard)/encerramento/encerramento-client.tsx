"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  CheckCircle2, Search, Calendar, Users, BarChart3,
  ChevronRight, FolderKanban, Clock, Star,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type Project = {
  id:           string
  title:        string
  description:  string | null
  status:       string
  priority:     number | null
  priorityLabel: string | null
  expectedEnd:  string | null
  actualStart:  string | null
  goLiveDate:   string | null
  sponsorName:  string | null
  memberCount:  number
  tasksTotal:   number
  tasksDone:    number
}

type Props = { projects: Project[] }

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; pill: string; dot: string }> = {
  PLANNING:     { label: "Planejamento",  pill: "bg-slate-100 text-slate-600 border-slate-200",    dot: "bg-slate-400" },
  IN_PROGRESS:  { label: "Em Andamento",  pill: "bg-blue-50 text-blue-700 border-blue-200",        dot: "bg-blue-500" },
  PILOT:        { label: "Piloto",         pill: "bg-violet-50 text-violet-700 border-violet-200",  dot: "bg-violet-500" },
  RAMP_UP:      { label: "Ramp-Up",        pill: "bg-amber-50 text-amber-700 border-amber-200",     dot: "bg-amber-500" },
  GO_LIVE:      { label: "GO LIVE",        pill: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  POST_GOLIVE:  { label: "Pós GO LIVE",    pill: "bg-green-50 text-green-700 border-green-200",    dot: "bg-green-600" },
  ON_HOLD:      { label: "Em Pausa",       pill: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  FUTURE_ANALYSIS: { label: "Análise Futura", pill: "bg-pink-50 text-pink-700 border-pink-200",   dot: "bg-pink-500" },
}

function fmt(d: string | null | undefined) {
  if (!d) return "—"
  return format(new Date(d), "dd/MM/yyyy", { locale: ptBR })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EncerramentoClient({ projects }: Props) {
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) => p.title.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
    )
  }, [projects, search])

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#F7F6F2" }}>
      {/* ── Header ── */}
      <div className="bg-white border-b border-black/[0.06] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
              style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}
            >
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#1a1625] tracking-tight">Encerramento de Projeto</h1>
              <p className="text-xs text-[#9c99b0] mt-0.5">
                {projects.length} projeto{projects.length !== 1 ? "s" : ""} disponível{projects.length !== 1 ? "is" : ""}
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#b0adc0]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar projeto…"
              className="w-full pl-9 pr-4 py-2 text-sm bg-[#F7F6F2] border border-black/[0.08] rounded-xl outline-none focus:ring-2 focus:ring-violet-300/50 transition"
            />
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white border border-black/[0.07] flex items-center justify-center shadow-sm">
              <FolderKanban className="w-8 h-8 text-[#c4c1d4]" />
            </div>
            <p className="text-[#9c99b0] text-sm">
              {search ? "Nenhum projeto encontrado para essa busca." : "Nenhum projeto disponível para encerramento."}
            </p>
          </div>
        ) : (
          <>
            {/* ── Info banner ── */}
            <div
              className="mb-6 px-5 py-4 rounded-2xl border flex items-start gap-3"
              style={{ background: "rgba(123,47,190,0.04)", borderColor: "rgba(123,47,190,0.15)" }}
            >
              <CheckCircle2 className="w-5 h-5 text-violet-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-violet-700">Reunião de Encerramento</p>
                <p className="text-xs text-violet-500 mt-0.5 leading-relaxed">
                  Selecione um projeto para conduzir a reunião de encerramento, registrar lições aprendidas,
                  comentários e gerar o Termo de Encerramento em PDF.
                </p>
              </div>
            </div>

            {/* ── Project grid ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((p) => {
                const cfg      = STATUS_CFG[p.status] ?? { label: p.status, pill: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" }
                const progress = p.tasksTotal > 0 ? Math.round((p.tasksDone / p.tasksTotal) * 100) : 0

                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}/encerramento`}
                    className="group bg-white rounded-2xl border border-black/[0.07] p-5 flex flex-col gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-[#1a1625] text-sm leading-tight group-hover:text-violet-700 transition-colors line-clamp-2">
                          {p.title}
                        </h3>
                        {p.description && (
                          <p className="text-xs text-[#9c99b0] mt-1 line-clamp-2 leading-relaxed">{p.description}</p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#c4c1d4] group-hover:text-violet-500 shrink-0 mt-0.5 transition-colors" />
                    </div>

                    {/* Status + priority */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${cfg.pill}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      {p.priorityLabel && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <Star className="w-3 h-3" />
                          {p.priorityLabel}
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] text-[#9c99b0]">Progresso das tarefas</span>
                        <span className="text-[11px] font-semibold text-[#4a4760]">{progress}%</span>
                      </div>
                      <div className="h-1.5 bg-[#F0EFF8] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${progress}%`,
                            background: progress === 100 ? "#10B981" : "linear-gradient(90deg, #7B2FBE, #9333EA)",
                          }}
                        />
                      </div>
                      <p className="text-[11px] text-[#b0adc0] mt-1">
                        {p.tasksDone}/{p.tasksTotal} tarefas concluídas
                      </p>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-4 pt-1 border-t border-black/[0.05]">
                      <span className="flex items-center gap-1.5 text-[11px] text-[#9c99b0]">
                        <Users className="w-3.5 h-3.5" />
                        {p.memberCount} membro{p.memberCount !== 1 ? "s" : ""}
                      </span>
                      {p.goLiveDate && (
                        <span className="flex items-center gap-1.5 text-[11px] text-[#9c99b0]">
                          <Calendar className="w-3.5 h-3.5" />
                          GO LIVE {fmt(p.goLiveDate)}
                        </span>
                      )}
                      {!p.goLiveDate && p.expectedEnd && (
                        <span className="flex items-center gap-1.5 text-[11px] text-[#9c99b0]">
                          <Clock className="w-3.5 h-3.5" />
                          Prev. {fmt(p.expectedEnd)}
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
