"use client"

import { useState, useTransition, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Tag, AlignLeft, CalendarDays, Paperclip,
  ChevronLeft, ChevronRight, Check, Loader2, Send,
  Upload, X, FileText, FileImage,
  FileArchive, File,
  Building2, User, Globe,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createProjectRequest } from "@/lib/actions/project-request"

// ── Types ─────────────────────────────────────────────────────────────────────
type FileItem    = { id?: string; name: string; url: string; size: number; localFile?: File }
type FormState = {
  title: string; area: string; projectArea: string; sponsorId: string; areaSolicitante: string; origin: string
  stakeholders: string[]
  scope: string; justification: string
  assumptions: string; restrictions: string
  expectedStart: string; expectedDurationMonths: string
  files: FileItem[]
}

// ── Constants ─────────────────────────────────────────────────────────────────
// Wizard reduzido de 6 para 4 passos — Riscos e Benefícios saem da
// solicitação inicial e passam a ser preenchidos DEPOIS que o projeto é
// criado (aba "Riscos" da tela do projeto, e a página /benefits), não mais
// como requisito pra abrir um projeto novo.
const STEPS = [
  { id: 1, label: "Identificação",          desc: "Título, área e solicitante",     icon: Tag },
  { id: 2, label: "Escopo & Contexto",      desc: "Escopo e justificativa",         icon: AlignLeft },
  { id: 3, label: "Premissas & Prazo",      desc: "Restrições e prazo estimado",    icon: CalendarDays },
  { id: 4, label: "Documentos & Envio",     desc: "Anexos e revisão final",         icon: Paperclip },
]

const AREAS = ["Tecnologia", "Projetos", "Qualidade", "Armazéns", "Operações", "Financeiro", "Comercial",
  "Transportes", "RH", "Marketing", "Compras", "Controller", "Diretoria"]

const PROJECT_AREAS = [
  { value: "TECNOLOGIA",  label: "Tecnologia",            desc: "Sistemas, TI e projetos digitais", color: "#0891B2", icon: "💻" },
  { value: "QUALIDADE",   label: "Qualidade",             desc: "Melhoria contínua e certificações", color: "#059669", icon: "✅" },
  { value: "ESTRATEGICO", label: "Projetos Estratégicos", desc: "Iniciativas de alto impacto",       color: "#7B2FBE", icon: "🎯" },
  { value: "ARMAZEM",     label: "Armazéns",              desc: "Rede de Licenciamento de Armazéns", color: "#EA580C", icon: "📦" },
]

const ORIGINS = [
  { value: "INTERNAL", label: "Interna",    desc: "Demanda da equipe interna",    icon: Building2,  color: "#10B981" },
  { value: "SPONSOR",  label: "Liderança",  desc: "Solicitação da diretoria",     icon: User,       color: "#7B2FBE" },
  { value: "CLIENT",   label: "Cliente",    desc: "Solicitação de cliente externo",icon: Globe,     color: "#2563EB" },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
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
    scope: "", justification: "",
    assumptions: "", restrictions: "",
    expectedStart: "", expectedDurationMonths: "",
    files: [],
  })

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  // Prazo é só uma estimativa (nem início nem duração são obrigatórios pra
  // avançar) — a data de término de verdade vem do cronograma, não daqui.
  const canNext = () => {
    switch (step) {
      case 1: return !!(form.title.trim() && form.projectArea && form.area && form.areaSolicitante && form.sponsorId && form.origin)
      case 2: return !!(form.scope.trim() && form.justification.trim())
      case 3: return !!(form.assumptions.trim() && form.restrictions.trim())
      default: return true
    }
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
        justification:  form.justification,
        assumptions:    form.assumptions,
        restrictions:   form.restrictions,
        expectedStart:  form.expectedStart || undefined,
        expectedDurationMonths: form.expectedDurationMonths ? parseInt(form.expectedDurationMonths, 10) : undefined,
        files:          form.files,
      })
      router.push(`/projects/${id}`)
    })
  }

  // Só pra pré-visualizar o término no resumo (etapa 4) — o cálculo de
  // verdade acontece no servidor, em createProjectRequest.
  const previewEnd = (() => {
    if (!form.expectedStart || !form.expectedDurationMonths) return null
    const d = new Date(`${form.expectedStart}T00:00:00`)
    d.setMonth(d.getMonth() + parseInt(form.expectedDurationMonths, 10))
    return d
  })()

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
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
                    <Label required>Área Solicitante</Label>
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

                <div>
                  <Label required>Justificativa</Label>
                  <p className="text-[11px] text-[#9c99b0] mb-2">Por que este projeto precisa acontecer agora</p>
                  <textarea className={textareaCls} rows={4}
                    placeholder="Este projeto é necessário porque..."
                    value={form.justification} onChange={e => set("justification", e.target.value)} />
                </div>
              </>
            )}

            {/* ══ STEP 3 — Premissas & Prazo ═══════════════════════════ */}
            {step === 3 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label required>Premissas</Label>
                    <p className="text-[11px] text-[#9c99b0] mb-2">Eventos que devem acontecer para o projeto ter sucesso</p>
                    <textarea className={textareaCls} rows={5}
                      placeholder="Recursos estarão disponíveis; Apoio das partes interessadas garantido..."
                      value={form.assumptions} onChange={e => set("assumptions", e.target.value)} />
                  </div>
                  <div>
                    <Label required>Restrições</Label>
                    <p className="text-[11px] text-[#9c99b0] mb-2">Limitações que podem afetar o desempenho</p>
                    <textarea className={textareaCls} rows={5}
                      placeholder="Prazo fixo de 90 dias; Orçamento limitado; Não interferir nas operações..."
                      value={form.restrictions} onChange={e => set("restrictions", e.target.value)} />
                  </div>
                </div>

                <div className="h-px bg-[rgba(0,0,0,0.06)]" />

                <div>
                  <p className="text-sm font-semibold text-[#1a1625]">Prazo Estimado</p>
                  <p className="text-[11px] text-[#9c99b0] mb-2">
                    Uma estimativa inicial, não obrigatória — a data de término de verdade vem do cronograma do projeto
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Início Esperado</Label>
                      <input type="date" className={inputCls}
                        value={form.expectedStart} onChange={e => set("expectedStart", e.target.value)} />
                    </div>
                    <div>
                      <Label>Duração Estimada (meses)</Label>
                      <input type="number" min={0} className={inputCls} placeholder="Ex: 6"
                        value={form.expectedDurationMonths} onChange={e => set("expectedDurationMonths", e.target.value)} />
                    </div>
                  </div>
                  {previewEnd && (
                    <p className="text-[11px] text-[#9c99b0] mt-2">
                      Término estimado: <span className="font-semibold text-[#6b6880]">{previewEnd.toLocaleDateString("pt-BR")}</span>
                    </p>
                  )}
                </div>
              </>
            )}

            {/* ══ STEP 4 — Documentos & Envio ═════════════════════════ */}
            {step === 4 && (
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
                      { label: "Término",       value: previewEnd ? previewEnd.toLocaleDateString("pt-BR") : "—" },
                      { label: "Documentos",  value: `${form.files.length} anexo(s)` },
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
