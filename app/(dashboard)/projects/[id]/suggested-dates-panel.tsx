"use client"

import { useState, useTransition } from "react"
import { CalendarCheck2, CalendarX2, Clock, Pencil, Check, X } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { updateSuggestedDates } from "@/lib/actions/projects"

function fmtDate(d: Date | string | null): string {
  if (!d) return "—"
  return format(new Date(d), "dd/MM/yyyy", { locale: ptBR })
}

function toInputValue(d: Date | string | null): string {
  if (!d) return ""
  const dt = new Date(d)
  return dt.toISOString().split("T")[0]
}

export function SuggestedDatesPanel({
  projectId,
  requestedStart,
  requestedEnd,
  suggestedStart,
  suggestedEnd,
}: {
  projectId: string
  requestedStart: Date | null
  requestedEnd: Date | null
  suggestedStart: Date | null
  suggestedEnd: Date | null
}) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [start, setStart] = useState(toInputValue(suggestedStart))
  const [end, setEnd]     = useState(toInputValue(suggestedEnd))

  function handleSave() {
    startTransition(async () => {
      await updateSuggestedDates(projectId, {
        suggestedStart: start || null,
        suggestedEnd:   end   || null,
      })
      setEditing(false)
    })
  }

  function handleCancel() {
    setStart(toInputValue(suggestedStart))
    setEnd(toInputValue(suggestedEnd))
    setEditing(false)
  }

  const hasSuggestion = suggestedStart || suggestedEnd

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid #E2E8F0", background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: "1px solid #F1F5F9", background: "#F8FAFC" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}
          >
            <CalendarCheck2 className="w-3.5 h-3.5" style={{ color: "#2463FF" }} />
          </div>
          <div>
            <p className="text-xs font-black text-[#0F172A] uppercase tracking-wider">Análise de Prazo</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Avaliação do time de projetos sobre as datas solicitadas</p>
          </div>
        </div>

        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 px-3 h-7 text-[11px] font-semibold rounded-lg border transition-all hover:bg-blue-50"
            style={{ color: "#2463FF", borderColor: "#BFDBFE" }}
          >
            <Pencil className="w-3 h-3" />
            {hasSuggestion ? "Editar" : "Preencher"}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="inline-flex items-center gap-1 px-3 h-7 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <X className="w-3 h-3" />
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="inline-flex items-center gap-1 px-3 h-7 text-[11px] font-bold rounded-lg text-white transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #2463FF, #7B2FBE)" }}
            >
              {isPending ? (
                <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Salvar
            </button>
          </div>
        )}
      </div>

      <div className="p-5 grid grid-cols-2 gap-4">
        {/* Solicitado */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Prazo Solicitado
          </p>
          <div className="space-y-2">
            <div
              className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
              style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}
            >
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Início</span>
              <span className="text-xs font-bold text-slate-700">{fmtDate(requestedStart)}</span>
            </div>
            <div
              className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
              style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}
            >
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Término</span>
              <span className="text-xs font-bold text-slate-700">{fmtDate(requestedEnd)}</span>
            </div>
          </div>
        </div>

        {/* Sugerido pelo time */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: "#2463FF" }}>
            <CalendarCheck2 className="w-3 h-3" />
            Sugestão do Time
          </p>

          {editing ? (
            <div className="space-y-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Início sugerido</label>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 transition-all"
                  style={{ border: "1px solid #93C5FD", background: "#EFF6FF" }}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Término sugerido</label>
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 transition-all"
                  style={{ border: "1px solid #93C5FD", background: "#EFF6FF" }}
                />
              </div>
            </div>
          ) : hasSuggestion ? (
            <div className="space-y-2">
              <div
                className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
                style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#2463FF" }}>Início</span>
                <span className="text-xs font-black" style={{ color: "#1D4ED8" }}>{fmtDate(suggestedStart)}</span>
              </div>
              <div
                className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
                style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#2463FF" }}>Término</span>
                <span className="text-xs font-black" style={{ color: "#1D4ED8" }}>{fmtDate(suggestedEnd)}</span>
              </div>
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center rounded-xl py-5 gap-1.5 cursor-pointer hover:bg-blue-50 transition-colors"
              style={{ border: "1px dashed #93C5FD", background: "#F0F9FF" }}
              onClick={() => setEditing(true)}
            >
              <CalendarX2 className="w-5 h-5" style={{ color: "#93C5FD" }} />
              <p className="text-[10px] font-semibold text-slate-400">Nenhuma sugestão registrada</p>
              <p className="text-[9px] text-slate-300">Clique para preencher</p>
            </div>
          )}
        </div>
      </div>

      {/* Delta — só se ambos os lados estiverem preenchidos */}
      {!editing && requestedEnd && (suggestedStart || suggestedEnd) && (() => {
        const reqEnd  = requestedEnd ? new Date(requestedEnd).getTime()  : null
        const sugEnd  = suggestedEnd ? new Date(suggestedEnd).getTime()  : null
        if (!reqEnd || !sugEnd) return null
        const diffDays = Math.round((sugEnd - reqEnd) / 86_400_000)
        if (diffDays === 0) return (
          <div className="px-5 pb-4">
            <div className="rounded-xl px-4 py-2 flex items-center gap-2" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
              <p className="text-[11px] font-semibold text-green-700">Prazo sugerido alinhado com o solicitado</p>
            </div>
          </div>
        )
        const color   = diffDays > 0 ? { bg: "#FEF9C3", border: "#FDE047", text: "#713F12" } : { bg: "#F0FDF4", border: "#BBF7D0", text: "#14532D" }
        const label   = diffDays > 0
          ? `Sugestão ${diffDays} dia${diffDays !== 1 ? "s" : ""} além do prazo solicitado`
          : `Sugestão ${Math.abs(diffDays)} dia${Math.abs(diffDays) !== 1 ? "s" : ""} antes do prazo solicitado`
        return (
          <div className="px-5 pb-4">
            <div className="rounded-xl px-4 py-2 flex items-center gap-2" style={{ background: color.bg, border: `1px solid ${color.border}` }}>
              <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: color.text }} />
              <p className="text-[11px] font-semibold" style={{ color: color.text }}>{label}</p>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
