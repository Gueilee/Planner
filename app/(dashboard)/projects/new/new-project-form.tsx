"use client"

import { useState, useTransition, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Tag, AlignLeft, CalendarDays, ShieldAlert, Paperclip,
  ChevronLeft, ChevronRight, Check, Loader2, Send,
  Plus, Trash2, Upload, X, FileText, FileImage,
  FileArchive, File, AlertTriangle, DollarSign,
  Building2, User, Users, Globe, Lightbulb,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createProjectRequest } from "@/lib/actions/project-request"

// ── Types ─────────────────────────────────────────────────────────────────────
type RiskItem = { description: string; level: "LOW" | "MEDIUM" | "HIGH"; mitigation: string }
type FileItem = { name: string; url: string; size: number; localFile?: File }
type FormState = {
  title: string; area: string; projectArea: string; sponsorId: string; areaSolicitante: string; origin: string
  stakeholders: string[]
  scope: string; asIs: string; toBe: string
  assumptions: string; restrictions: string
  expectedStart: string; expectedEnd: string
  economy: string; estimatedCosts: string; budget: string
  risks: RiskItem[]
  files: FileItem[]
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Identificação",         desc: "Título, área e solicitante",    icon: Tag },
  { id: 2, label: "Escopo & Contexto",      desc: "Escopo, AS IS e TO BE",         icon: AlignLeft },
  { id: 3, label: "Premissas & Financeiro", desc: "Restrições, datas e orçamento", icon: CalendarDays },
  { id: 4, label: "Riscos",                 desc: "Análise de riscos do projeto",  icon: ShieldAlert },
  { id: 5, label: "Documentos & Envio",     desc: "Anexos e revisão final",        icon: Paperclip },
]

const AREAS = ["Tecnologia", "Projetos", "Qualidade", "Operações", "Financeiro", "Comercial",
  "Transportes", "RH", "Marketing", "Compras", "Controller", "Diretoria"]

const PROJECT_AREAS = [
  { value: "TECNOLOGIA",  label: "Tecnologia",            desc: "Sistemas, TI e projetos digitais", color: "#0891B2", icon: "💻" },
  { value: "QUALIDADE",   label: "Qualidade",             desc: "Melhoria contínua e certificações", color: "#059669", icon: "✅" },
  { value: "ESTRATEGICO", label: "Projetos Estratégicos", desc: "Iniciativas de alto impacto",       color: "#7B2FBE", icon: "🎯" },
]

const ORIGINS = [
  { value: "INTERNAL", label: "Interna",    desc: "Demanda da equipe interna",    icon: Building2,  color: "#10B981" },
  { value: "SPONSOR",  label: "Liderança",  desc: "Solicitação da diretoria",     icon: User,       color: "#7B2FBE" },
  { value: "CLIENT",   label: "Cliente",    desc: "Solicitação de cliente externo",icon: Globe,     color: "#2563EB" },
]

const RISK_LEVELS = [
  { value: "LOW",    label: "Baixo",  color: "#10B981", bg: "#ECFDF5" },
  { value: "MEDIUM", label: "Médio",  color: "#F59E0B", bg: "#FFFBEB" },
  { value: "HIGH",   label: "Alto",   color: "#EF4444", bg: "#FEF2F2" },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(raw: string): string {
  const d = raw.replace(/\D/g, "")
  if (!d) return ""
  return (parseInt(d, 10) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
function parseBRL(v: string): number | undefined {
  const n = parseFloat(v.replace(/[R$\s.]/g, "").replace(",", "."))
  return isNaN(n) ? undefined : n
}
function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return FileImage
  if (["zip", "rar", "7z", "tar"].includes(ext)) return FileArchive
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return FileText
  return File
}
function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-bold uppercase tracking-[0.07em] text-[#4a4760] mb-1.5">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}
const inputCls = "w-full h-[46px] px-3.5 text-sm rounded-xl border-[1.5px] border-[rgba(0,0,0,0.11)] bg-white text-[#1a1625] outline-none transition-all placeholder:text-[#b0adc0] focus:border-[#7B2FBE] focus:shadow-[0_0_0_3px_rgba(123,47,190,0.12)]"
const textareaCls = "w-full px-3.5 py-3 text-sm rounded-xl border-[1.5px] border-[rgba(0,0,0,0.11)] bg-white text-[#1a1625] outline-none transition-all resize-none placeholder:text-[#b0adc0] focus:border-[#7B2FBE] focus:shadow-[0_0_0_3px_rgba(123,47,190,0.12)]"

// ── Main Form ─────────────────────────────────────────────────────────────────
interface Props {
  users: { id: string; name: string; department: string | null; role: string }[]
  currentUserId: string
}

export function NewProjectForm({ users, currentUserId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>({
    title: "", area: "", projectArea: "TECNOLOGIA", sponsorId: currentUserId, areaSolicitante: "",
    origin: "INTERNAL", stakeholders: [],
    scope: "", asIs: "", toBe: "",
    assumptions: "", restrictions: "",
    expectedStart: "", expectedEnd: "",
    economy: "", estimatedCosts: "", budget: "",
    risks: [{ description: "", level: "MEDIUM", mitigation: "" }],
    files: [],
  })

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const canNext = () => {
    if (step === 1) return form.title.trim() && form.area && form.sponsorId && form.origin
    return true
  }

  // ── File upload ──────────────────────────────────────────────────────────
  const uploadFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return
    setUploading(true)
    const fd = new FormData()
    Array.from(fileList).forEach(f => fd.append("files", f))
    try {
      const res  = await fetch("/api/upload", { method: "POST", body: fd })
      const json = await res.json()
      set("files", [...form.files, ...json.files])
    } finally {
      setUploading(false)
    }
  }, [form.files])

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    startTransition(async () => {
      const { id } = await createProjectRequest({
        title:          form.title,
        area:           form.area,
        projectArea:    form.projectArea,
        sponsorId:      form.sponsorId,
        areaSolicitante:form.areaSolicitante,
        origin:         form.origin,
        stakeholders:   form.stakeholders,
        scope:          form.scope,
        asIs:           form.asIs,
        toBe:           form.toBe,
        assumptions:    form.assumptions,
        restrictions:   form.restrictions,
        expectedStart:  form.expectedStart,
        expectedEnd:    form.expectedEnd,
        economy:        parseBRL(form.economy),
        estimatedCosts: parseBRL(form.estimatedCosts),
        budget:         parseBRL(form.budget),
        risks:          form.risks.filter(r => r.description.trim()),
        files:          form.files,
      })
      router.push(`/projects/${id}`)
    })
  }

  return (
    <div className="flex gap-8 items-start">

      {/* ── Step sidebar ─────────────────────────────────────────────── */}
      <div className="w-56 shrink-0 sticky top-6 space-y-3">
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] shadow-sm p-3 space-y-1">
          {STEPS.map((s) => {
            const done   = s.id < step
            const active = s.id === step
            const Icon   = s.icon
            return (
              <button key={s.id} type="button"
                onClick={() => done && setStep(s.id)}
                disabled={s.id > step}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                  active && "bg-[rgba(123,47,190,0.07)] border border-[rgba(123,47,190,0.18)]",
                  done   && "hover:bg-[rgba(0,0,0,0.03)] cursor-pointer",
                  !active && !done && "opacity-40 cursor-not-allowed"
                )}
              >
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white transition-all",
                  done   && "bg-[#10B981]",
                  !done  && !active && "bg-[rgba(0,0,0,0.07)]"
                )}
                  style={active ? { background: "linear-gradient(135deg, #7B2FBE, #9333EA)" } : undefined}
                >
                  {done
                    ? <Check className="w-3.5 h-3.5 text-white" />
                    : <Icon className={cn("w-3.5 h-3.5", active ? "text-white" : "text-[#9c99b0]")} />
                  }
                </div>
                <div>
                  <p className={cn("text-sm font-semibold leading-tight",
                    active ? "text-[#7B2FBE]" : done ? "text-[#1a1625]" : "text-[#9c99b0]"
                  )}>
                    {s.label}
                  </p>
                  <p className="text-[10px] text-[#9c99b0] mt-0.5">{s.desc}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Progress bar */}
        <div className="px-3">
          <div className="flex justify-between text-[10px] text-[#9c99b0] mb-1.5">
            <span>Progresso</span>
            <span>{Math.round(((step - 1) / (STEPS.length - 1)) * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%`, background: "linear-gradient(90deg, #7B2FBE, #9333EA, #A855F7)" }} />
          </div>
        </div>
      </div>

      {/* ── Form card ────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] shadow-sm overflow-hidden">

          {/* Step header */}
          <div className="px-6 py-5 border-b border-[rgba(0,0,0,0.06)]"
            style={{ background: "linear-gradient(135deg, #faf9f5 0%, #f8f5ff 100%)" }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9c99b0]">
                Etapa {step} de {STEPS.length}
              </span>
            </div>
            <h2 className="text-xl font-black text-[#1a1625] leading-tight">{STEPS[step - 1].label}</h2>
            <p className="text-sm text-[#6b6880] mt-0.5">{STEPS[step - 1].desc}</p>
          </div>

          <div className="p-6 space-y-5">

            {/* ══ STEP 1 — Identificação ══════════════════════════════ */}
            {step === 1 && (
              <>
                <div>
                  <Label required>Nome do Projeto</Label>
                  <input className={inputCls} placeholder="Ex: Implantação de Combos Metálicos Retornáveis"
                    value={form.title} onChange={e => set("title", e.target.value)} />
                </div>

                <div>
                  <Label required>Portfólio / Área de Gestão</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {PROJECT_AREAS.map(pa => {
                      const sel = form.projectArea === pa.value
                      return (
                        <button key={pa.value} type="button" onClick={() => set("projectArea", pa.value)}
                          className={cn(
                            "p-4 rounded-xl border-2 text-left transition-all duration-200",
                            sel
                              ? "border-[2px] bg-[rgba(0,0,0,0.02)]"
                              : "border-[rgba(0,0,0,0.09)] hover:border-[rgba(0,0,0,0.2)] hover:bg-[rgba(0,0,0,0.01)]"
                          )}
                          style={sel ? { borderColor: pa.color, background: `${pa.color}08` } : {}}
                        >
                          <div className="w-9 h-9 rounded-lg mb-2.5 flex items-center justify-center text-lg"
                            style={{ background: `${pa.color}18` }}>
                            {pa.icon}
                          </div>
                          <p className="text-sm font-bold leading-tight" style={{ color: sel ? pa.color : "#1a1625" }}>{pa.label}</p>
                          <p className="text-[11px] text-[#9c99b0] mt-0.5 leading-snug">{pa.desc}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label required>Área Responsável</Label>
                    <select className={inputCls} value={form.area} onChange={e => set("area", e.target.value)}>
                      <option value="">Selecione a área...</option>
                      {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Área Solicitante</Label>
                    <select className={inputCls} value={form.areaSolicitante} onChange={e => set("areaSolicitante", e.target.value)}>
                      <option value="">Selecione a área...</option>
                      {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <Label required>Patrocinador / Solicitante</Label>
                  <select className={inputCls} value={form.sponsorId} onChange={e => set("sponsorId", e.target.value)}>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}{u.department ? ` — ${u.department}` : ""}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label required>Origem</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {ORIGINS.map(o => {
                      const Icon = o.icon
                      const sel  = form.origin === o.value
                      return (
                        <button key={o.value} type="button" onClick={() => set("origin", o.value)}
                          className={cn(
                            "p-4 rounded-xl border-2 text-left transition-all duration-200",
                            sel ? "border-[#7B2FBE] bg-[rgba(123,47,190,0.05)]" : "border-[rgba(0,0,0,0.09)] hover:border-[rgba(123,47,190,0.35)] hover:bg-[rgba(123,47,190,0.02)]"
                          )}
                        >
                          <div className="w-8 h-8 rounded-lg mb-2 flex items-center justify-center"
                            style={{ background: o.color + "20" }}>
                            <Icon className="w-4 h-4" style={{ color: o.color }} />
                          </div>
                          <p className={cn("text-sm font-semibold", sel ? "text-[#7B2FBE]" : "text-[#1a1625]")}>{o.label}</p>
                          <p className="text-[11px] text-[#9c99b0] mt-0.5 leading-tight">{o.desc}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <Label>Partes Interessadas (Stakeholders)</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {form.stakeholders.map(s => (
                      <span key={s} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-[#7B2FBE] bg-[rgba(123,47,190,0.08)] border border-[rgba(123,47,190,0.18)]">
                        {s}
                        <button type="button" onClick={() => set("stakeholders", form.stakeholders.filter(x => x !== s))}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <select className={cn(inputCls, "flex-1")} defaultValue=""
                      onChange={e => {
                        const v = e.target.value
                        if (v && !form.stakeholders.includes(v)) set("stakeholders", [...form.stakeholders, v])
                        e.target.value = ""
                      }}>
                      <option value="">+ Adicionar área...</option>
                      {AREAS.filter(a => !form.stakeholders.includes(a)).map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* ══ STEP 2 — Escopo & Contexto ══════════════════════════ */}
            {step === 2 && (
              <>
                <div>
                  <Label required>Escopo do Projeto</Label>
                  <p className="text-[11px] text-[#9c99b0] mb-2">Defina o resultado, metas e entregáveis que pretende atingir</p>
                  <textarea className={textareaCls} rows={4}
                    placeholder="O projeto visa desenvolver e implementar... O resultado final será..."
                    value={form.scope} onChange={e => set("scope", e.target.value)} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-[rgba(0,0,0,0.08)] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[rgba(0,0,0,0.06)]"
                      style={{ background: "rgba(239,68,68,0.04)" }}>
                      <p className="text-xs font-bold text-[#DC2626] uppercase tracking-[0.08em]">AS IS — Situação Atual</p>
                    </div>
                    <div className="p-3">
                      <textarea className={cn(textareaCls, "border-0 shadow-none focus:shadow-none bg-transparent p-0")} rows={5}
                        placeholder="Como o processo funciona hoje? Quais problemas existem?"
                        value={form.asIs} onChange={e => set("asIs", e.target.value)} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-[rgba(0,0,0,0.08)] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[rgba(0,0,0,0.06)]"
                      style={{ background: "rgba(16,185,129,0.05)" }}>
                      <p className="text-xs font-bold text-[#059669] uppercase tracking-[0.08em]">TO BE — Situação Futura</p>
                    </div>
                    <div className="p-3">
                      <textarea className={cn(textareaCls, "border-0 shadow-none focus:shadow-none bg-transparent p-0")} rows={5}
                        placeholder="Como o processo deve funcionar após o projeto? Quais benefícios?"
                        value={form.toBe} onChange={e => set("toBe", e.target.value)} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ══ STEP 3 — Premissas & Financeiro ═════════════════════ */}
            {step === 3 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Premissas</Label>
                    <p className="text-[11px] text-[#9c99b0] mb-2">Eventos que devem acontecer para o projeto ter sucesso</p>
                    <textarea className={textareaCls} rows={5}
                      placeholder="Recursos estarão disponíveis; Apoio das partes interessadas garantido..."
                      value={form.assumptions} onChange={e => set("assumptions", e.target.value)} />
                  </div>
                  <div>
                    <Label>Restrições</Label>
                    <p className="text-[11px] text-[#9c99b0] mb-2">Limitações que podem afetar o desempenho</p>
                    <textarea className={textareaCls} rows={5}
                      placeholder="Prazo fixo de 90 dias; Orçamento limitado; Não interferir nas operações..."
                      value={form.restrictions} onChange={e => set("restrictions", e.target.value)} />
                  </div>
                </div>

                <div className="h-px bg-[rgba(0,0,0,0.06)]" />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Data de Início Esperada</Label>
                    <input type="date" className={inputCls}
                      value={form.expectedStart} onChange={e => set("expectedStart", e.target.value)} />
                  </div>
                  <div>
                    <Label>Data de Conclusão Esperada</Label>
                    <input type="date" className={inputCls}
                      value={form.expectedEnd} onChange={e => set("expectedEnd", e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {([
                    { field: "economy" as const, label: "Economia Esperada", color: "#059669" },
                    { field: "estimatedCosts" as const, label: "Custos Estimados", color: "#D97706" },
                    { field: "budget" as const, label: "Orçamento (Budget)", color: "#7B2FBE" },
                  ]).map(({ field, label, color }) => (
                    <div key={field}>
                      <Label>{label}</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color }}>R$</span>
                        <input type="text" className={cn(inputCls, "pl-9")} placeholder="0,00"
                          value={form[field]}
                          onChange={e => {
                            const raw = e.target.value.replace(/\D/g, "")
                            set(field, raw ? fmt(raw) : "")
                          }} />
                      </div>
                    </div>
                  ))}
                </div>

                {(form.economy || form.estimatedCosts || form.budget) && (
                  <div className="rounded-xl p-4 border border-[rgba(123,47,190,0.15)] bg-[rgba(123,47,190,0.03)]">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9c99b0] mb-3">Resumo Financeiro</p>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      {[
                        { label: "Economia", value: form.economy, color: "#059669" },
                        { label: "Custo Estimado", value: form.estimatedCosts, color: "#D97706" },
                        { label: "Budget", value: form.budget, color: "#7B2FBE" },
                      ].map(({ label, value, color }) => (
                        <div key={label}>
                          <p className="text-[10px] text-[#9c99b0]">{label}</p>
                          <p className="text-sm font-black mt-0.5" style={{ color }}>{value || "—"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ══ STEP 4 — Riscos ═════════════════════════════════════ */}
            {step === 4 && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="text-sm font-semibold text-[#1a1625]">Riscos Identificados</p>
                    <p className="text-[11px] text-[#9c99b0]">Descreva os riscos e suas estratégias de mitigação</p>
                  </div>
                  <button type="button"
                    onClick={() => set("risks", [...form.risks, { description: "", level: "MEDIUM", mitigation: "" }])}
                    className="flex items-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-lg text-[#7B2FBE] bg-[rgba(123,47,190,0.08)] hover:bg-[rgba(123,47,190,0.14)] transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Risco
                  </button>
                </div>

                {form.risks.length === 0 && (
                  <div className="text-center py-10 text-[#9c99b0] text-sm border-2 border-dashed border-[rgba(0,0,0,0.08)] rounded-xl">
                    Nenhum risco adicionado — clique em "Adicionar Risco" acima
                  </div>
                )}

                <div className="space-y-3">
                  {form.risks.map((risk, i) => {
                    const lvl = RISK_LEVELS.find(l => l.value === risk.level) ?? RISK_LEVELS[1]
                    return (
                      <div key={i} className="rounded-xl border border-[rgba(0,0,0,0.08)] overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(0,0,0,0.06)]"
                          style={{ background: lvl.bg }}>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5" style={{ color: lvl.color }} />
                            <span className="text-xs font-bold" style={{ color: lvl.color }}>Risco {i + 1}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1">
                              {RISK_LEVELS.map(l => (
                                <button key={l.value} type="button"
                                  onClick={() => {
                                    const r = [...form.risks]; r[i] = { ...r[i], level: l.value as any }; set("risks", r)
                                  }}
                                  className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold transition-all",
                                    risk.level === l.value ? "text-white" : "text-[#9c99b0] hover:opacity-80"
                                  )}
                                  style={risk.level === l.value ? { background: l.color } : { background: "rgba(0,0,0,0.05)" }}>
                                  {l.label}
                                </button>
                              ))}
                            </div>
                            <button type="button"
                              onClick={() => set("risks", form.risks.filter((_, j) => j !== i))}
                              className="p-1 rounded-lg text-[#9c99b0] hover:text-red-500 hover:bg-red-50 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <Label>Descrição do Risco</Label>
                            <textarea className={cn(textareaCls, "h-20 resize-none")} rows={3}
                              placeholder="Descreva o risco identificado..."
                              value={risk.description}
                              onChange={e => {
                                const r = [...form.risks]; r[i] = { ...r[i], description: e.target.value }; set("risks", r)
                              }} />
                          </div>
                          <div>
                            <Label>Estratégia de Mitigação</Label>
                            <textarea className={cn(textareaCls, "h-20 resize-none")} rows={3}
                              placeholder="Como será mitigado este risco?"
                              value={risk.mitigation}
                              onChange={e => {
                                const r = [...form.risks]; r[i] = { ...r[i], mitigation: e.target.value }; set("risks", r)
                              }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* ══ STEP 5 — Documentos & Envio ═════════════════════════ */}
            {step === 5 && (
              <>
                {/* Drop zone */}
                <div>
                  <Label>Anexos do Projeto</Label>
                  <p className="text-[11px] text-[#9c99b0] mb-3">
                    Anexe a abertura de projeto, planilhas, apresentações ou qualquer documento relevante
                  </p>
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files) }}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200",
                      dragOver
                        ? "border-[#7B2FBE] bg-[rgba(123,47,190,0.07)] scale-[1.01]"
                        : "border-[rgba(0,0,0,0.12)] hover:border-[#7B2FBE] hover:bg-[rgba(123,47,190,0.03)]"
                    )}>
                    <input ref={fileInputRef} type="file" multiple className="hidden"
                      onChange={e => uploadFiles(e.target.files)} />
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                      style={{ background: "rgba(123,47,190,0.08)", border: "1px solid rgba(123,47,190,0.18)" }}>
                      {uploading
                        ? <Loader2 className="w-6 h-6 text-[#7B2FBE] animate-spin" />
                        : <Upload className="w-6 h-6 text-[#7B2FBE]" />
                      }
                    </div>
                    <p className="text-sm font-semibold text-[#1a1625]">
                      {uploading ? "Enviando arquivos..." : "Arraste arquivos aqui ou clique para selecionar"}
                    </p>
                    <p className="text-xs text-[#9c99b0] mt-1">PDF, Word, Excel, imagens — até 50 MB por arquivo</p>
                  </div>

                  {/* File list */}
                  {form.files.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {form.files.map((f, i) => {
                        const Icon = fileIcon(f.name)
                        return (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-[rgba(0,0,0,0.07)] bg-[rgba(123,47,190,0.02)] hover:bg-[rgba(123,47,190,0.04)] transition-colors">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                              style={{ background: "rgba(123,47,190,0.10)" }}>
                              <Icon className="w-4 h-4 text-[#7B2FBE]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-[#1a1625] truncate">{f.name}</p>
                              <p className="text-[10px] text-[#9c99b0]">{fileSize(f.size)}</p>
                            </div>
                            <button type="button"
                              onClick={() => set("files", form.files.filter((_, j) => j !== i))}
                              className="p-1.5 rounded-lg text-[#9c99b0] hover:text-red-500 hover:bg-red-50 transition-all">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Review summary */}
                <div className="h-px bg-[rgba(0,0,0,0.06)] my-2" />
                <div>
                  <p className="text-sm font-bold text-[#1a1625] mb-3 flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#10B981]" /> Resumo da Solicitação
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Projeto",       value: form.title || "—" },
                      { label: "Área",          value: form.area || "—" },
                      { label: "Patrocinador",  value: users.find(u => u.id === form.sponsorId)?.name || "—" },
                      { label: "Origem",        value: ORIGINS.find(o => o.value === form.origin)?.label || "—" },
                      { label: "Início",        value: form.expectedStart ? new Date(form.expectedStart).toLocaleDateString("pt-BR") : "—" },
                      { label: "Término",       value: form.expectedEnd   ? new Date(form.expectedEnd).toLocaleDateString("pt-BR")   : "—" },
                      { label: "Economia",      value: form.economy || "—" },
                      { label: "Custo Est.",    value: form.estimatedCosts || "—" },
                      { label: "Riscos",        value: `${form.risks.filter(r => r.description).length} identificado(s)` },
                      { label: "Documentos",    value: `${form.files.length} anexo(s)` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-start gap-2 py-2 border-b border-[rgba(0,0,0,0.05)] last:border-0">
                        <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#9c99b0] w-24 shrink-0 mt-0.5">{label}</span>
                        <span className="text-sm font-semibold text-[#1a1625] truncate">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Navigation ─────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-[rgba(0,0,0,0.06)]"
            style={{ background: "rgba(250,249,245,0.6)" }}>
            <button type="button" onClick={() => setStep(s => Math.max(1, s - 1))}
              disabled={step === 1}
              className="flex items-center gap-2 px-4 h-10 text-sm font-semibold rounded-xl border border-[rgba(0,0,0,0.10)] text-[#6b6880] bg-white hover:bg-[rgba(0,0,0,0.03)] disabled:opacity-30 disabled:cursor-not-allowed transition-all">
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>

            {step < STEPS.length ? (
              <button type="button" onClick={() => setStep(s => s + 1)}
                disabled={!canNext()}
                className="flex items-center gap-2 px-6 h-10 text-sm font-semibold rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)", boxShadow: "0 4px 14px rgba(123,47,190,0.35)" }}>
                Próximo
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button type="button" onClick={handleSubmit}
                disabled={isPending || !form.title.trim() || !form.area || !form.sponsorId}
                className="flex items-center gap-2 px-6 h-10 text-sm font-semibold rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA, #A855F7)", boxShadow: "0 4px 16px rgba(123,47,190,0.40)" }}>
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isPending ? "Enviando..." : "Enviar Solicitação"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
