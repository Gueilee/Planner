"use client"

import { useState, useTransition, useEffect, useCallback } from "react"
import {
  Pencil, X, Save, Loader2, Calendar, DollarSign, FileText,
  Info, Users, AlertTriangle, Plus, Trash2, ChevronDown,
} from "lucide-react"
import {
  updateProjectDetails, addProjectMember, removeProjectMember,
  createRisk, updateRisk, deleteRisk,
} from "@/lib/actions/projects"

// ── Types ──────────────────────────────────────────────────────────────────

type Member = { userId: string; role: string; user: { id: string; name: string; department: string | null; role: string } }
type AvailUser = { id: string; name: string; department: string | null; role: string }
type RiskItem = { id: string; description: string; level: string; mitigation: string | null }

const PROJECT_AREAS = [
  { value: "TECNOLOGIA",  label: "Tecnologia",            desc: "Sistemas, TI e projetos digitais", color: "#0891B2", icon: "💻" },
  { value: "QUALIDADE",   label: "Qualidade",             desc: "Melhoria contínua e certificações", color: "#059669", icon: "✅" },
  { value: "ESTRATEGICO", label: "Projetos Estratégicos", desc: "Iniciativas de alto impacto",       color: "#7B2FBE", icon: "🎯" },
]

type Props = {
  project: {
    id: string
    title: string
    description: string | null
    scope: string | null
    assumptions: string | null
    restrictions: string | null
    origin: string | null
    projectArea: string
    budget: number | null
    economy: number | null
    expectedStart: Date | null
    expectedEnd: Date | null
    actualStart: Date | null
    actualEnd: Date | null
    goLiveDate: Date | null
  }
  members: Member[]
  allUsers: AvailUser[]
  risks: RiskItem[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toInputDate(d: Date | null): string {
  if (!d) return ""
  return new Date(d).toISOString().split("T")[0]
}

const ORIGIN_LABELS: Record<string, string> = {
  INTERNAL: "Interna",
  CLIENT:   "Cliente",
  SPONSOR:  "Sponsor / Diretoria",
}

const RISK_LEVELS = [
  { value: "LOW",      label: "Baixo",    color: "#10B981", bg: "#F0FDF4", border: "#BBF7D0" },
  { value: "MEDIUM",   label: "Médio",    color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A" },
  { value: "HIGH",     label: "Alto",     color: "#EF4444", bg: "#FEF2F2", border: "#FECACA" },
  { value: "CRITICAL", label: "Crítico",  color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
]

function riskCfg(level: string) {
  return RISK_LEVELS.find(r => r.value === level) ?? RISK_LEVELS[1]
}

const SECTIONS = [
  { id: "info",         label: "Informações",  icon: Info },
  { id: "dates",        label: "Datas",        icon: Calendar },
  { id: "financial",    label: "Financeiro",   icon: DollarSign },
  { id: "scope",        label: "Escopo",       icon: FileText },
  { id: "team",         label: "Equipe",       icon: Users },
  { id: "risks",        label: "Riscos",       icon: AlertTriangle },
]

// ── Sub-components ──────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div>
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</label>
        {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

// ── Team Section ────────────────────────────────────────────────────────────

function TeamSection({
  projectId, initialMembers, allUsers,
}: { projectId: string; initialMembers: Member[]; allUsers: AvailUser[] }) {
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [newRole, setNewRole] = useState("Membro")
  const [isPending, startTransition] = useTransition()
  const [removingId, setRemovingId] = useState<string | null>(null)

  const available = allUsers.filter(u => !members.some(m => m.userId === u.id))

  function handleAdd() {
    if (!selectedUserId) return
    const user = allUsers.find(u => u.id === selectedUserId)
    if (!user) return
    startTransition(async () => {
      await addProjectMember(projectId, selectedUserId, newRole)
      setMembers(prev => [...prev, { userId: selectedUserId, role: newRole, user }])
      setSelectedUserId("")
      setNewRole("Membro")
    })
  }

  function handleRemove(userId: string) {
    setRemovingId(userId)
    startTransition(async () => {
      await removeProjectMember(projectId, userId)
      setMembers(prev => prev.filter(m => m.userId !== userId))
      setRemovingId(null)
    })
  }

  return (
    <div className="space-y-4">
      {/* Current members */}
      {members.length > 0 ? (
        <div className="space-y-2">
          {members.map(m => (
            <div
              key={m.userId}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl"
              style={{ border: "1px solid #E2E8F0", background: "#F8FAFC" }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                style={{ background: `hsl(${(m.user.name.charCodeAt(0) * 37) % 360}, 55%, 40%)` }}
              >
                {m.user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#0F172A] truncate">{m.user.name}</p>
                <p className="text-[11px] text-slate-400 truncate">
                  {m.role}{m.user.department ? ` · ${m.user.department}` : ""}
                </p>
              </div>
              <button
                onClick={() => handleRemove(m.userId)}
                disabled={isPending}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
              >
                {removingId === m.userId
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />
                }
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="py-6 rounded-xl text-center"
          style={{ border: "1px dashed #CBD5E1", background: "#F8FAFC" }}
        >
          <p className="text-xs text-slate-400">Nenhum membro adicionado</p>
        </div>
      )}

      {/* Add member */}
      {available.length > 0 && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ border: "1px solid #E2E8F0", background: "white" }}
        >
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Adicionar Membro</p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="relative">
              <select
                className="lp-inp pr-8 appearance-none"
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
              >
                <option value="">Selecionar pessoa...</option>
                {available.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}{u.department ? ` — ${u.department}` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <Field label="Função / Papel">
              <input
                className="lp-inp"
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                placeholder="Ex: Tech Lead, Analista..."
              />
            </Field>
            <button
              onClick={handleAdd}
              disabled={!selectedUserId || isPending}
              className="h-[42px] px-4 rounded-xl text-sm font-bold text-white flex items-center gap-1.5 disabled:opacity-40 transition-opacity shrink-0"
              style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Adicionar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Risks Section ───────────────────────────────────────────────────────────

function RisksSection({
  projectId, initialRisks,
}: { projectId: string; initialRisks: RiskItem[] }) {
  const [risks, setRisks] = useState<RiskItem[]>(initialRisks)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ description: "", level: "MEDIUM", mitigation: "" })
  const [newForm, setNewForm] = useState({ description: "", level: "MEDIUM", mitigation: "" })
  const [showNew, setShowNew] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function startEdit(r: RiskItem) {
    setEditingId(r.id)
    setEditForm({ description: r.description, level: r.level, mitigation: r.mitigation ?? "" })
  }

  function handleUpdate(id: string) {
    startTransition(async () => {
      await updateRisk(id, { description: editForm.description, level: editForm.level, mitigation: editForm.mitigation })
      setRisks(prev => prev.map(r => r.id === id
        ? { ...r, description: editForm.description, level: editForm.level, mitigation: editForm.mitigation }
        : r
      ))
      setEditingId(null)
    })
  }

  function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      await deleteRisk(id)
      setRisks(prev => prev.filter(r => r.id !== id))
      setDeletingId(null)
    })
  }

  function handleCreate() {
    if (!newForm.description.trim()) return
    startTransition(async () => {
      await createRisk(projectId, { description: newForm.description, level: newForm.level, mitigation: newForm.mitigation })
      // optimistically add with temp id — revalidatePath will refresh on next load
      setRisks(prev => [...prev, {
        id: `temp-${Date.now()}`,
        description: newForm.description,
        level: newForm.level,
        mitigation: newForm.mitigation || null,
      }])
      setNewForm({ description: "", level: "MEDIUM", mitigation: "" })
      setShowNew(false)
    })
  }

  return (
    <div className="space-y-3">
      {risks.length === 0 && !showNew && (
        <div className="py-6 rounded-xl text-center" style={{ border: "1px dashed #CBD5E1", background: "#F8FAFC" }}>
          <p className="text-xs text-slate-400">Nenhum risco registrado</p>
        </div>
      )}

      {risks.map(r => {
        const cfg = riskCfg(r.level)
        const isEditing = editingId === r.id
        return (
          <div
            key={r.id}
            className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${isEditing ? "#93C5FD" : "#E2E8F0"}`, background: isEditing ? "#EFF6FF" : "white" }}
          >
            {isEditing ? (
              <div className="p-4 space-y-3">
                <Field label="Descrição do risco">
                  <textarea
                    className="lp-inp"
                    rows={2}
                    style={{ paddingTop: 10, paddingBottom: 10, resize: "vertical" }}
                    value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nível">
                    <div className="relative">
                      <select
                        className="lp-inp pr-8 appearance-none"
                        value={editForm.level}
                        onChange={e => setEditForm(f => ({ ...f, level: e.target.value }))}
                      >
                        {RISK_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </Field>
                  <Field label="Mitigação">
                    <input
                      className="lp-inp"
                      value={editForm.mitigation}
                      onChange={e => setEditForm(f => ({ ...f, mitigation: e.target.value }))}
                      placeholder="Ação de mitigação..."
                    />
                  </Field>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 h-8 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleUpdate(r.id)}
                    disabled={isPending}
                    className="px-3 h-8 text-xs font-bold rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}
                  >
                    {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Salvar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3.5">
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide shrink-0 mt-0.5"
                  style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
                >
                  {cfg.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#0F172A] font-medium leading-snug">{r.description}</p>
                  {r.mitigation && (
                    <p className="text-[11px] text-slate-400 mt-1">Mitigação: {r.mitigation}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(r)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={isPending}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                  >
                    {deletingId === r.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Trash2 className="w-3 h-3" />
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* New risk form */}
      {showNew && (
        <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid #93C5FD", background: "#EFF6FF" }}>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Novo Risco / Issue</p>
          <Field label="Descrição do risco *">
            <textarea
              className="lp-inp"
              rows={2}
              style={{ paddingTop: 10, paddingBottom: 10, resize: "vertical" }}
              value={newForm.description}
              onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descreva o risco ou issue..."
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nível">
              <div className="relative">
                <select
                  className="lp-inp pr-8 appearance-none"
                  value={newForm.level}
                  onChange={e => setNewForm(f => ({ ...f, level: e.target.value }))}
                >
                  {RISK_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </Field>
            <Field label="Mitigação">
              <input
                className="lp-inp"
                value={newForm.mitigation}
                onChange={e => setNewForm(f => ({ ...f, mitigation: e.target.value }))}
                placeholder="Ação de mitigação..."
              />
            </Field>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setShowNew(false)}
              className="px-3 h-8 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-white transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={isPending || !newForm.description.trim()}
              className="px-3 h-8 text-xs font-bold rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}
            >
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Adicionar Risco
            </button>
          </div>
        </div>
      )}

      {!showNew && (
        <button
          onClick={() => setShowNew(true)}
          className="w-full h-10 rounded-xl text-xs font-semibold text-slate-500 flex items-center justify-center gap-1.5 hover:bg-slate-50 transition-colors"
          style={{ border: "1px dashed #CBD5E1" }}
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar Risco / Issue
        </button>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function ProjectEditModal({ project, members, allUsers, risks }: Props) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState("info")
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    title:         project.title         ?? "",
    description:   project.description   ?? "",
    scope:         project.scope         ?? "",
    assumptions:   project.assumptions   ?? "",
    restrictions:  project.restrictions  ?? "",
    origin:        project.origin        ?? "INTERNAL",
    projectArea:   project.projectArea   ?? "TECNOLOGIA",
    budget:        project.budget        != null ? String(project.budget)  : "",
    economy:       project.economy       != null ? String(project.economy) : "",
    expectedStart: toInputDate(project.expectedStart),
    expectedEnd:   toInputDate(project.expectedEnd),
    actualStart:   toInputDate(project.actualStart),
    actualEnd:     toInputDate(project.actualEnd),
    goLiveDate:    toInputDate(project.goLiveDate),
  })

  useEffect(() => {
    setForm({
      title:         project.title         ?? "",
      description:   project.description   ?? "",
      scope:         project.scope         ?? "",
      assumptions:   project.assumptions   ?? "",
      restrictions:  project.restrictions  ?? "",
      origin:        project.origin        ?? "INTERNAL",
      projectArea:   project.projectArea   ?? "TECNOLOGIA",
      budget:        project.budget        != null ? String(project.budget)  : "",
      economy:       project.economy       != null ? String(project.economy) : "",
      expectedStart: toInputDate(project.expectedStart),
      expectedEnd:   toInputDate(project.expectedEnd),
      actualStart:   toInputDate(project.actualStart),
      actualEnd:     toInputDate(project.actualEnd),
      goLiveDate:    toInputDate(project.goLiveDate),
    })
  }, [project])

  function set(k: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))
  }

  function handleSave() {
    startTransition(async () => {
      const parseMoney = (v: string) => {
        const n = parseFloat(v.replace(",", "."))
        return isNaN(n) ? null : n
      }
      await updateProjectDetails(project.id, {
        title:         form.title.trim() || undefined,
        description:   form.description.trim() || undefined,
        scope:         form.scope.trim()        || undefined,
        assumptions:   form.assumptions.trim()  || null,
        restrictions:  form.restrictions.trim() || null,
        origin:        form.origin || undefined,
        projectArea:   form.projectArea || undefined,
        budget:        parseMoney(form.budget),
        economy:       parseMoney(form.economy),
        expectedStart: form.expectedStart || null,
        expectedEnd:   form.expectedEnd   || null,
        actualStart:   form.actualStart   || null,
        actualEnd:     form.actualEnd     || null,
        goLiveDate:    form.goLiveDate    || null,
      })
      setSaved(true)
      setTimeout(() => { setSaved(false); setOpen(false) }, 1000)
    })
  }

  // Sections where the footer save button applies
  const isSaveSection = ["info", "dates", "financial", "scope"].includes(section)

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 h-9 text-sm font-semibold rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
        style={{ background: "linear-gradient(135deg, #0F172A, #1E293B)", boxShadow: "0 4px 20px rgba(15,23,42,0.25)", color: "white" }}
      >
        <Pencil className="w-3.5 h-3.5" />
        Editar Projeto
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          {/* Modal */}
          <div
            className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
            style={{ background: "#ffffff", boxShadow: "0 24px 80px rgba(15,23,42,0.30), 0 0 0 1px rgba(226,232,240,1)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: "1px solid #F1F5F9" }}>
              <div>
                <h2 className="text-base font-black text-[#0F172A]">Editar Projeto</h2>
                <p className="text-xs text-slate-400 mt-0.5 truncate max-w-md">{project.title}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Section tabs */}
            <div className="flex gap-1 px-6 py-2.5 shrink-0 flex-wrap" style={{ borderBottom: "1px solid #F1F5F9", background: "#FAFBFC" }}>
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={section === s.id
                    ? { background: "linear-gradient(135deg, #2463FF, #8B2FFF)", color: "white" }
                    : { background: "transparent", color: "#94A3B8" }
                  }
                >
                  <s.icon className="w-3 h-3" />
                  {s.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {/* ── Informações ─────────────────────────────────── */}
              {section === "info" && (
                <>
                  <Field label="Título do Projeto *">
                    <input className="lp-inp" value={form.title} onChange={set("title")} placeholder="Nome do projeto" />
                  </Field>
                  <Field label="Descrição Resumida">
                    <textarea
                      className="lp-inp" rows={3} value={form.description} onChange={set("description")}
                      placeholder="Breve descrição do projeto..."
                      style={{ height: "auto", paddingTop: 10, paddingBottom: 10, resize: "vertical" }}
                    />
                  </Field>
                  <Field label="Origem / Demanda">
                    <div className="relative">
                      <select className="lp-inp pr-8 appearance-none" value={form.origin} onChange={set("origin")}>
                        {Object.entries(ORIGIN_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </Field>

                  <Field label="Portfólio / Área de Gestão">
                    <div className="grid grid-cols-3 gap-2">
                      {PROJECT_AREAS.map(pa => {
                        const sel = form.projectArea === pa.value
                        return (
                          <button
                            key={pa.value}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, projectArea: pa.value }))}
                            className="p-3 rounded-xl border-2 text-left transition-all duration-150"
                            style={sel
                              ? { borderColor: pa.color, background: `${pa.color}0D` }
                              : { borderColor: "#E2E8F0", background: "#F8FAFC" }
                            }
                          >
                            <div className="text-base mb-1">{pa.icon}</div>
                            <p className="text-xs font-bold leading-tight" style={{ color: sel ? pa.color : "#0F172A" }}>
                              {pa.label}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{pa.desc}</p>
                          </button>
                        )
                      })}
                    </div>
                  </Field>
                </>
              )}

              {/* ── Datas ───────────────────────────────────────── */}
              {section === "dates" && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Início Planejado">
                    <input type="date" className="lp-inp" value={form.expectedStart} onChange={set("expectedStart")} />
                  </Field>
                  <Field label="Fim Planejado">
                    <input type="date" className="lp-inp" value={form.expectedEnd} onChange={set("expectedEnd")} />
                  </Field>
                  <Field label="Início Real">
                    <input type="date" className="lp-inp" value={form.actualStart} onChange={set("actualStart")} />
                  </Field>
                  <Field label="GO LIVE Previsto">
                    <input type="date" className="lp-inp" value={form.goLiveDate} onChange={set("goLiveDate")} />
                  </Field>
                  <Field label="Fim Real / Encerramento">
                    <input type="date" className="lp-inp" value={form.actualEnd} onChange={set("actualEnd")} />
                  </Field>
                </div>
              )}

              {/* ── Financeiro ──────────────────────────────────── */}
              {section === "financial" && (
                <>
                  <Field label="Budget (R$)" hint="Valor total do orçamento aprovado">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                      <input type="text" inputMode="decimal" className="lp-inp" style={{ paddingLeft: 36 }}
                        value={form.budget} onChange={set("budget")} placeholder="0,00" />
                    </div>
                  </Field>
                  <Field label="Economia Esperada (R$)" hint="Ganho financeiro estimado com o projeto">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                      <input type="text" inputMode="decimal" className="lp-inp" style={{ paddingLeft: 36 }}
                        value={form.economy} onChange={set("economy")} placeholder="0,00" />
                    </div>
                  </Field>
                </>
              )}

              {/* ── Escopo ──────────────────────────────────────── */}
              {section === "scope" && (
                <>
                  <Field label="Escopo do Projeto">
                    <textarea className="lp-inp" rows={5} value={form.scope} onChange={set("scope")}
                      placeholder="Descreva o escopo: objetivos, entregas e limites..."
                      style={{ height: "auto", paddingTop: 10, paddingBottom: 10, resize: "vertical" }} />
                  </Field>
                  <Field label="Premissas" hint="O que precisa ser verdadeiro para o projeto ter sucesso">
                    <textarea className="lp-inp" rows={4} value={form.assumptions} onChange={set("assumptions")}
                      placeholder="Liste as premissas do projeto..."
                      style={{ height: "auto", paddingTop: 10, paddingBottom: 10, resize: "vertical" }} />
                  </Field>
                  <Field label="Restrições" hint="Limitações ou condições que o projeto deve respeitar">
                    <textarea className="lp-inp" rows={4} value={form.restrictions} onChange={set("restrictions")}
                      placeholder="Liste as restrições do projeto..."
                      style={{ height: "auto", paddingTop: 10, paddingBottom: 10, resize: "vertical" }} />
                  </Field>
                </>
              )}

              {/* ── Equipe ──────────────────────────────────────── */}
              {section === "team" && (
                <TeamSection projectId={project.id} initialMembers={members} allUsers={allUsers} />
              )}

              {/* ── Riscos ──────────────────────────────────────── */}
              {section === "risks" && (
                <RisksSection projectId={project.id} initialRisks={risks} />
              )}
            </div>

            {/* Footer — save button only for data sections */}
            {isSaveSection && (
              <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderTop: "1px solid #F1F5F9", background: "#FAFBFC" }}>
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 h-9 text-sm font-semibold rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={isPending || !form.title.trim()}
                  className="inline-flex items-center gap-2 px-5 h-9 text-sm font-bold rounded-xl text-white transition-all disabled:opacity-50"
                  style={{
                    background: saved
                      ? "linear-gradient(135deg, #059669, #10B981)"
                      : "linear-gradient(135deg, #2463FF, #8B2FFF)",
                    boxShadow: "0 4px 20px rgba(36,99,255,0.35)",
                  }}
                >
                  {isPending
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</>
                    : saved
                      ? <><Save className="w-3.5 h-3.5" /> Salvo!</>
                      : <><Save className="w-3.5 h-3.5" /> Salvar Alterações</>
                  }
                </button>
              </div>
            )}

            {/* Footer — close only for team/risks (saves happen inline) */}
            {!isSaveSection && (
              <div className="flex items-center justify-end px-6 py-4 shrink-0" style={{ borderTop: "1px solid #F1F5F9", background: "#FAFBFC" }}>
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 h-9 text-sm font-semibold rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all"
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        .lp-inp {
          width: 100%;
          min-height: 42px;
          padding: 0 14px;
          background: #ffffff;
          border: 1.5px solid rgba(0,0,0,0.10);
          border-radius: 10px;
          color: #0F172A;
          font-size: 13.5px;
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04) inset;
          display: block;
        }
        .lp-inp::placeholder { color: #CBD5E1; }
        .lp-inp:focus {
          border-color: #2463FF;
          box-shadow: 0 0 0 3px rgba(36,99,255,0.10), 0 1px 2px rgba(0,0,0,0.04) inset;
        }
      `}</style>
    </>
  )
}
