"use client"

import { useState, useTransition } from "react"
import { updateReportStatus, resetReportStatusToAuto } from "@/lib/actions/report-status"
import { Zap, PenLine, RotateCcw } from "lucide-react"

type TrafficLight = "GREEN" | "YELLOW" | "RED"

const LIGHT_CFG: Record<TrafficLight, { label: string; color: string; bg: string; border: string; ring: string }> = {
  GREEN:  { label: "Em Linha", color: "#059669", bg: "#ECFDF5", border: "#A7F3D0", ring: "#10B98140" },
  YELLOW: { label: "Atenção",  color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", ring: "#F59E0B40" },
  RED:    { label: "Risco",    color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", ring: "#EF444440" },
}

const ORDER: TrafficLight[] = ["GREEN", "YELLOW", "RED"]

const INDICATOR_HINTS: Record<string, string> = {
  cost:      "Budget vs custo estimado + risco de custos — clique para ciclar",
  schedule:  "Progresso real vs progresso esperado + tarefas vencidas — clique para ciclar",
  resources: "Taxa de entrega das tarefas dentro do prazo — clique para ciclar",
  overall:   "Pior status entre Custos, Cronograma e Recursos — clique para ciclar",
}

interface Props {
  projectId:      string
  isManual:       boolean
  autoSuggestion: { cost: TrafficLight; schedule: TrafficLight; resources: TrafficLight; overall: TrafficLight }
  initial: {
    cost:      TrafficLight
    schedule:  TrafficLight
    resources: TrafficLight
    overall:   TrafficLight
    notes:     string | null
  }
}

export function ReportStatusWidget({ projectId, isManual, autoSuggestion, initial }: Props) {
  const [cost,      setCost]      = useState<TrafficLight>(initial.cost)
  const [schedule,  setSchedule]  = useState<TrafficLight>(initial.schedule)
  const [resources, setResources] = useState<TrafficLight>(initial.resources)
  const [overall,   setOverall]   = useState<TrafficLight>(initial.overall)
  const [notes,     setNotes]     = useState(initial.notes ?? "")
  const [manual,    setManual]    = useState(isManual)
  const [saved,     setSaved]     = useState(false)
  const [pending,   startTransition] = useTransition()

  function cycle(val: TrafficLight, set: (v: TrafficLight) => void) {
    const next = ORDER[(ORDER.indexOf(val) + 1) % ORDER.length]
    set(next)
    setManual(true)
    setSaved(false)
  }

  function save() {
    startTransition(async () => {
      await updateReportStatus({
        projectId,
        reportStatusCost:      cost,
        reportStatusSchedule:  schedule,
        reportStatusResources: resources,
        reportStatusOverall:   overall,
        reportStatusNotes:     notes,
      })
      setManual(true)
      setSaved(true)
    })
  }

  function resetToAuto() {
    startTransition(async () => {
      await resetReportStatusToAuto(projectId)
      setCost(autoSuggestion.cost)
      setSchedule(autoSuggestion.schedule)
      setResources(autoSuggestion.resources)
      setOverall(autoSuggestion.overall)
      setManual(false)
      setSaved(false)
    })
  }

  const indicators: { key: string; label: string; val: TrafficLight; set: (v: TrafficLight) => void }[] = [
    { key: "cost",      label: "Custos",      val: cost,      set: setCost      },
    { key: "schedule",  label: "Cronograma",  val: schedule,  set: setSchedule  },
    { key: "resources", label: "Recursos",    val: resources, set: setResources },
    { key: "overall",   label: "Geral",       val: overall,   set: setOverall   },
  ]

  return (
    <div className="bg-white rounded-2xl p-5 space-y-4" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status para o Report</p>
            {manual ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                style={{ background: "rgba(217,119,6,0.10)", color: "#D97706" }}>
                <PenLine className="w-2.5 h-2.5" /> Manual
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                style={{ background: "rgba(123,47,190,0.08)", color: "#7B2FBE" }}>
                <Zap className="w-2.5 h-2.5" /> Auto
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {manual
              ? "Modo manual — os valores foram definidos por você"
              : "Calculado automaticamente — clique em um indicador para ajustar"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {manual && (
            <button
              onClick={resetToAuto}
              disabled={pending}
              className="flex items-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-xl border transition-all hover:bg-slate-50 disabled:opacity-50"
              style={{ borderColor: "#E2E8F0", color: "#64748B" }}
              title="Voltar ao cálculo automático"
            >
              <RotateCcw className="w-3 h-3" />
              Voltar ao Auto
            </button>
          )}
          <button
            onClick={save}
            disabled={pending}
            className="flex items-center gap-2 px-4 h-8 text-xs font-bold rounded-xl text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 16px rgba(123,47,190,0.30)" }}
          >
            {pending ? "Salvando…" : saved ? "✓ Salvo" : "Salvar"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {indicators.map(({ key, label, val, set }) => {
          const cfg    = LIGHT_CFG[val]
          const autoCfg = LIGHT_CFG[autoSuggestion[key as keyof typeof autoSuggestion]]
          const differsFromAuto = manual && val !== autoSuggestion[key as keyof typeof autoSuggestion]
          return (
            <button
              key={key}
              onClick={() => cycle(val, set)}
              title={INDICATOR_HINTS[key]}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all hover:scale-[1.03] active:scale-[0.98] cursor-pointer relative"
              style={{
                background: cfg.bg,
                borderColor: cfg.border,
                boxShadow: `0 0 0 3px ${cfg.ring}`,
              }}
            >
              {differsFromAuto && (
                <span
                  className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                  style={{ background: autoCfg.color }}
                  title={`Auto: ${autoCfg.label}`}
                />
              )}
              <div
                className="w-8 h-8 rounded-lg"
                style={{
                  background: cfg.color,
                  boxShadow: `0 0 14px ${cfg.ring}, 0 2px 6px rgba(0,0,0,0.15)`,
                }}
              />
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: cfg.color }}>
                {label}
              </span>
              <span className="text-[9px] font-semibold" style={{ color: cfg.color }}>
                {cfg.label}
              </span>
            </button>
          )
        })}
      </div>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
          Observações do Report
        </label>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setSaved(false) }}
          placeholder="Comentários gerais para o status report (opcional)…"
          rows={2}
          className="w-full text-sm rounded-xl border px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 transition-all"
          style={{ borderColor: "#E2E8F0", color: "#0F172A", background: "#FAFBFC" }}
        />
      </div>
    </div>
  )
}
