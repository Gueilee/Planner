"use client"

import { useState, useTransition, useEffect } from "react"
import { Pencil, X, Save, Loader2, Calendar, DollarSign, FileText, Info } from "lucide-react"
import { updateProjectDetails } from "@/lib/actions/projects"

type Props = {
  project: {
    id: string
    title: string
    description: string | null
    scope: string | null
    origin: string | null
    budget: number | null
    economy: number | null
    expectedStart: Date | null
    expectedEnd: Date | null
    actualStart: Date | null
    actualEnd: Date | null
    goLiveDate: Date | null
  }
}

function toInputDate(d: Date | null): string {
  if (!d) return ""
  const dt = new Date(d)
  return dt.toISOString().split("T")[0]
}

const ORIGIN_LABELS: Record<string, string> = {
  INTERNAL: "Interna",
  CLIENT:   "Cliente",
  SPONSOR:  "Sponsor / Diretoria",
}

const SECTIONS = [
  { id: "info",       label: "Informações",  icon: Info },
  { id: "dates",      label: "Datas",        icon: Calendar },
  { id: "financial",  label: "Financeiro",   icon: DollarSign },
  { id: "scope",      label: "Escopo",       icon: FileText },
]

export function ProjectEditModal({ project }: Props) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState("info")
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    title:         project.title         ?? "",
    description:   project.description   ?? "",
    scope:         project.scope         ?? "",
    origin:        project.origin        ?? "INTERNAL",
    budget:        project.budget        != null ? String(project.budget)  : "",
    economy:       project.economy       != null ? String(project.economy) : "",
    expectedStart: toInputDate(project.expectedStart),
    expectedEnd:   toInputDate(project.expectedEnd),
    actualStart:   toInputDate(project.actualStart),
    actualEnd:     toInputDate(project.actualEnd),
    goLiveDate:    toInputDate(project.goLiveDate),
  })

  // Reset form when project changes
  useEffect(() => {
    setForm({
      title:         project.title         ?? "",
      description:   project.description   ?? "",
      scope:         project.scope         ?? "",
      origin:        project.origin        ?? "INTERNAL",
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
        scope:         form.scope.trim() || undefined,
        origin:        form.origin || undefined,
        budget:        parseMoney(form.budget),
        economy:       parseMoney(form.economy),
        expectedStart: form.expectedStart || null,
        expectedEnd:   form.expectedEnd   || null,
        actualStart:   form.actualStart   || null,
        actualEnd:     form.actualEnd     || null,
        goLiveDate:    form.goLiveDate    || null,
      })
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        setOpen(false)
      }, 1000)
    })
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 h-9 text-sm font-semibold rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
        style={{
          background: "linear-gradient(135deg, #0F172A, #1E293B)",
          boxShadow: "0 4px 20px rgba(15,23,42,0.25)",
          color: "white",
        }}
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
            style={{
              background: "#ffffff",
              boxShadow: "0 24px 80px rgba(15,23,42,0.30), 0 0 0 1px rgba(226,232,240,1)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ borderBottom: "1px solid #F1F5F9" }}
            >
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
            <div
              className="flex gap-1 px-6 py-2.5 shrink-0"
              style={{ borderBottom: "1px solid #F1F5F9", background: "#FAFBFC" }}
            >
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
                    <input
                      className="lp-inp"
                      value={form.title}
                      onChange={set("title")}
                      placeholder="Nome do projeto"
                    />
                  </Field>
                  <Field label="Descrição Resumida">
                    <textarea
                      className="lp-inp"
                      rows={3}
                      value={form.description}
                      onChange={set("description")}
                      placeholder="Breve descrição do projeto..."
                      style={{ height: "auto", paddingTop: 10, paddingBottom: 10, resize: "vertical" }}
                    />
                  </Field>
                  <Field label="Origem / Demanda">
                    <select className="lp-inp" value={form.origin} onChange={set("origin")}>
                      {Object.entries(ORIGIN_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </Field>
                </>
              )}

              {/* ── Datas ───────────────────────────────────────── */}
              {section === "dates" && (
                <>
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
                </>
              )}

              {/* ── Financeiro ──────────────────────────────────── */}
              {section === "financial" && (
                <>
                  <Field label="Budget (R$)" hint="Valor total do orçamento aprovado">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="lp-inp"
                        style={{ paddingLeft: 36 }}
                        value={form.budget}
                        onChange={set("budget")}
                        placeholder="0,00"
                      />
                    </div>
                  </Field>
                  <Field label="Economia Esperada (R$)" hint="Ganho financeiro estimado com o projeto">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="lp-inp"
                        style={{ paddingLeft: 36 }}
                        value={form.economy}
                        onChange={set("economy")}
                        placeholder="0,00"
                      />
                    </div>
                  </Field>
                </>
              )}

              {/* ── Escopo ──────────────────────────────────────── */}
              {section === "scope" && (
                <Field label="Escopo do Projeto">
                  <textarea
                    className="lp-inp"
                    rows={10}
                    value={form.scope}
                    onChange={set("scope")}
                    placeholder="Descreva o escopo completo do projeto: objetivos, entregas, limites e premissas..."
                    style={{ height: "auto", paddingTop: 10, paddingBottom: 10, resize: "vertical" }}
                  />
                </Field>
              )}
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ borderTop: "1px solid #F1F5F9", background: "#FAFBFC" }}
            >
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
