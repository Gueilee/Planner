"use client"

import { useState, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Plus, FolderKanban, ChevronRight, Search, X, ChevronLeft } from "lucide-react"
import { StatusBadge } from "@/components/kronex/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProjectRow = {
  id: string
  title: string
  description: string | null
  status: string
  projectArea: string
  members: { id: string; user: { name: string; image: string | null } }[]
  tasks: { status: string; progress: number }[]
  _count: { tasks: number; risks: number }
}

// ─── Filter config ────────────────────────────────────────────────────────────

type FilterKey = "ALL" | "PENDING_GO_NO_GO" | "PLANNING" | "IN_PROGRESS" | "ON_HOLD" | "GO_LIVE" | "COMPLETED" | "FUTURE_ANALYSIS" | "PAUSED"

const FILTERS: { key: FilterKey; label: string; statuses: string[]; color: string }[] = [
  { key: "ALL",             label: "Todos",             statuses: [],                                          color: "#2463FF" },
  { key: "PENDING_GO_NO_GO",label: "Pend. Go/No-Go",   statuses: ["PENDING_GO_NO_GO"],                        color: "#D97706" },
  { key: "PLANNING",        label: "Planejamento",      statuses: ["PLANNING"],                                color: "#64748B" },
  { key: "IN_PROGRESS",     label: "Em Andamento",      statuses: ["IN_PROGRESS", "RAMP_UP"],                  color: "#10B981" },
  { key: "ON_HOLD",         label: "Em Validação",      statuses: ["ON_HOLD", "PILOT"],                        color: "#8B5CF6" },
  { key: "GO_LIVE",         label: "Go Live",           statuses: ["GO_LIVE", "POST_GOLIVE"],                  color: "#059669" },
  { key: "COMPLETED",       label: "Concluído",         statuses: ["COMPLETED"],                               color: "#6D28D9" },
  { key: "FUTURE_ANALYSIS", label: "Análise Futura",    statuses: ["FUTURE_ANALYSIS"],                         color: "#9333EA" },
  { key: "PAUSED",          label: "Pausado",           statuses: ["PAUSED"],                                  color: "#64748B" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avg(arr: number[]) {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
}

// ─── Area config ─────────────────────────────────────────────────────────────

type AreaKey = "ALL" | "TECNOLOGIA" | "QUALIDADE" | "ESTRATEGICO"

const AREA_TABS: { key: AreaKey; label: string; color: string }[] = [
  { key: "ALL",        label: "Todos",                color: "#2463FF" },
  { key: "TECNOLOGIA", label: "Tecnologia",           color: "#0891B2" },
  { key: "QUALIDADE",  label: "Qualidade",            color: "#059669" },
  { key: "ESTRATEGICO",label: "Projetos Estratégicos",color: "#7B2FBE" },
]

// ─── Component ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

export function ProjectsClient({ projects }: { projects: ProjectRow[] }) {
  const searchParams = useSearchParams()
  const initialFilter = (searchParams.get("filter") as FilterKey | null) ?? "ALL"

  const [activeArea, setActiveArea] = useState<AreaKey>("ALL")
  const [activeFilter, setActiveFilter] = useState<FilterKey>(
    FILTERS.some(f => f.key === initialFilter) ? initialFilter : "ALL"
  )
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  function handleAreaChange(key: AreaKey) {
    setActiveArea(key)
    setPage(1)
  }

  function handleFilterChange(key: FilterKey) {
    setActiveFilter(key)
    setPage(1)
  }

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  const filtered = useMemo(() => {
    const filter = FILTERS.find((f) => f.key === activeFilter)!
    return projects.filter((p) => {
      const matchesArea   = activeArea === "ALL" || p.projectArea === activeArea
      const matchesStatus = filter.statuses.length === 0 || filter.statuses.includes(p.status)
      const q = search.trim().toLowerCase()
      const matchesSearch = !q || p.title.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q)
      return matchesArea && matchesStatus && matchesSearch
    })
  }, [projects, activeArea, activeFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <>
      {/* Area tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 self-start">
        {AREA_TABS.map((a) => {
          const isActive = activeArea === a.key
          const count = a.key === "ALL" ? projects.length : projects.filter(p => p.projectArea === a.key).length
          return (
            <button
              key={a.key}
              onClick={() => handleAreaChange(a.key)}
              className="px-4 h-8 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5"
              style={isActive
                ? { background: a.color, color: "#fff", boxShadow: `0 2px 8px ${a.color}40` }
                : { background: "transparent", color: "#64748B" }
              }
            >
              {a.label}
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                style={isActive
                  ? { background: "rgba(255,255,255,0.25)", color: "#fff" }
                  : { background: "#E2E8F0", color: "#94A3B8" }
                }
              >{count}</span>
            </button>
          )
        })}
      </div>

      {/* Filter + action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar projeto..."
              className="pl-8 pr-8 h-8 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:border-[#7B2FBE] transition-colors w-52"
            />
            {search && (
              <button onClick={() => handleSearchChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="w-3 h-3 text-slate-400" />
              </button>
            )}
          </div>

          {/* Filter chips */}
          <div className="flex gap-1.5 flex-wrap">
            {FILTERS.map((f) => {
              const isActive = activeFilter === f.key
              const count = f.statuses.length === 0
                ? projects.length
                : projects.filter((p) => f.statuses.includes(p.status)).length
              return (
                <button
                  key={f.key}
                  onClick={() => handleFilterChange(f.key)}
                  className="px-3 h-8 text-xs font-semibold rounded-xl border transition-all"
                  style={isActive ? {
                    background: `${f.color}15`,
                    color: f.color,
                    borderColor: `${f.color}40`,
                  } : {
                    background: "#ffffff",
                    color: "#64748B",
                    borderColor: "#E2E8F0",
                  }}
                >
                  {f.label}
                  <span
                    className="ml-1.5 text-[9px] font-black px-1 py-0.5 rounded-full"
                    style={{
                      background: isActive ? `${f.color}20` : "#F1F5F9",
                      color: isActive ? f.color : "#94A3B8",
                    }}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

      </div>

      {/* Project list */}
      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{
          border: "1px solid #E2E8F0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(15,23,42,0.05)",
        }}
      >
        {/* Table header */}
        <div
          className="grid grid-cols-[2.5fr_1fr_1fr_1fr_auto] items-center px-5 py-3.5"
          style={{ borderBottom: "1px solid #F1F5F9", background: "#FAFBFC" }}
        >
          {["Projeto", "Status", "Equipe", "Progresso", ""].map((h) => (
            <span key={h} className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{h}</span>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "linear-gradient(135deg, rgba(0,196,224,0.1), rgba(36,99,255,0.1), rgba(139,47,255,0.1))", border: "1px solid rgba(36,99,255,0.15)" }}>
              <FolderKanban className="w-6 h-6 text-[#2463FF]" />
            </div>
            <p className="font-bold text-slate-700 mb-1">Nenhum projeto encontrado</p>
            <p className="text-sm text-slate-400">
              {search ? "Tente outro termo de busca" : "Nenhum projeto neste filtro"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {paginated.map((project) => {
              const tasksDone  = project.tasks.filter((t) => t.status === "COMPLETED").length
              const tasksTotal = project.tasks.length
              const progress   = tasksTotal > 0
                ? avg(project.tasks.map((t) => t.progress))
                : (project.status === "COMPLETED" ? 100 : project.status === "PLANNING" ? 0 : null)

              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="grid grid-cols-[2.5fr_1fr_1fr_1fr_auto] items-center px-5 py-4 hover:bg-slate-50/80 transition-colors group"
                >
                  {/* Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-1 h-10 rounded-full shrink-0"
                      style={{ background: "linear-gradient(to bottom, #00C4E0, #8B2FFF)" }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#0F172A] group-hover:text-[#2463FF] transition-colors line-clamp-1">
                        {project.title}
                      </p>
                      {project.description && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                          {project.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <StatusBadge status={project.status} size="sm" />

                  {/* Team */}
                  <div className="flex -space-x-1.5">
                    {project.members.slice(0, 4).map((m) => (
                      <UserAvatar
                        key={m.id}
                        name={m.user.name}
                        image={m.user.image}
                        size={28}
                        style={{ border: "2px solid white" }}
                      />
                    ))}
                    {project.members.length > 4 && (
                      <div className="w-7 h-7 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-500">
                        +{project.members.length - 4}
                      </div>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="pr-4">
                    {progress !== null ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">
                            {tasksTotal > 0 ? `${tasksDone}/${tasksTotal}` : ""}
                          </span>
                          <span className="text-[10px] font-bold text-[#0F172A]">{progress}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full progress-shine"
                            style={{
                              width: `${progress}%`,
                              background: progress === 100
                                ? "linear-gradient(90deg, #059669, #10B981)"
                                : "linear-gradient(90deg, #00C4E0, #2463FF)",
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </div>

                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-[#2463FF] group-hover:translate-x-0.5 transition-all" />
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination footer */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-4 px-1">
          <p className="text-xs text-slate-400">
            Exibindo {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length} projetos
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-slate-200 text-slate-400 hover:border-[#7B2FBE] hover:text-[#7B2FBE] disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className="w-8 h-8 rounded-lg text-xs font-semibold border transition-all"
                  style={p === safePage ? {
                    background: "linear-gradient(135deg, #7B2FBE, #9333EA)",
                    color: "#fff",
                    borderColor: "#7B2FBE",
                  } : {
                    background: "#fff",
                    color: "#64748B",
                    borderColor: "#E2E8F0",
                  }}
                >
                  {p}
                </button>
              ))}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-slate-200 text-slate-400 hover:border-[#7B2FBE] hover:text-[#7B2FBE] disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
