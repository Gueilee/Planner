"use client"

import { useState, useRef, useEffect } from "react"
import { Plus, X, Check } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParticipantKind = "INTERNO" | "EXTERNO" | "FORNECEDOR"

export type NewParticipant = {
  id: string
  name: string
  area: string
  kind: ParticipantKind
}

// ─── Config ───────────────────────────────────────────────────────────────────

export const AREA_SUGGESTIONS = [
  "TI / Sistemas",
  "Operações",
  "Comercial",
  "Financeiro",
  "Logística",
  "RH / Pessoas",
  "Jurídico",
  "Marketing",
  "PMO / Projetos",
  "Fiscal",
  "Controladoria",
  "Qualidade",
  "Consultoria",
  "Cliente",
]

const KIND_CFG: Record<ParticipantKind, { label: string; bg: string; text: string; border: string; activeBg: string; dot: string }> = {
  INTERNO:    { label: "Colaborador",  bg: "#EEF2FF", text: "#4338CA", border: "#C7D2FE", activeBg: "#4338CA", dot: "#6366F1" },
  EXTERNO:    { label: "Externo",      bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0", activeBg: "#15803D", dot: "#22C55E" },
  FORNECEDOR: { label: "Fornecedor",   bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", activeBg: "#D97706", dot: "#F59E0B" },
}

// ─── Participant Card (already-added participant) ──────────────────────────────

export function ParticipantCard({
  participant,
  onRemove,
}: {
  participant: NewParticipant
  onRemove: () => void
}) {
  const cfg = KIND_CFG[participant.kind]
  const initials = participant.name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  return (
    <div
      className="relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 group"
      style={{ background: cfg.bg, borderColor: cfg.border }}
    >
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0"
        style={{ background: `linear-gradient(135deg, ${cfg.dot}, ${cfg.dot}99)` }}
      >
        {initials}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold truncate" style={{ color: cfg.text }}>{participant.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {participant.area && (
            <span className="text-[10px] truncate" style={{ color: cfg.text + "99" }}>{participant.area}</span>
          )}
          <span
            className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0"
            style={{ background: cfg.activeBg + "20", color: cfg.text }}
          >
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
        style={{ background: "#EF4444" }}
      >
        <X className="w-2.5 h-2.5 text-white" />
      </button>
    </div>
  )
}

// ─── New Participant Form (inline expand) ─────────────────────────────────────

export function NewParticipantForm({
  onAdd,
  onCancel,
}: {
  onAdd: (p: Omit<NewParticipant, "id">) => void
  onCancel: () => void
}) {
  const [kind, setKind]       = useState<ParticipantKind>("EXTERNO")
  const [name, setName]       = useState("")
  const [area, setArea]       = useState("")
  const [customArea, setCustomArea] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  function selectArea(a: string) {
    setArea(a)
    setCustomArea(false)
  }

  function handleAdd() {
    if (!name.trim()) return
    onAdd({ name: name.trim(), area: area.trim(), kind })
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleAdd()
    if (e.key === "Escape") onCancel()
  }

  return (
    <div
      className="col-span-full rounded-2xl border-2 border-dashed p-4 space-y-3"
      style={{ borderColor: KIND_CFG[kind].border, background: KIND_CFG[kind].bg }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: KIND_CFG[kind].text }}>
          + Novo Participante
        </span>
        <button type="button" onClick={onCancel} className="w-5 h-5 rounded-full bg-white/60 hover:bg-red-50 flex items-center justify-center transition-colors">
          <X className="w-3 h-3 text-slate-400 hover:text-red-400" />
        </button>
      </div>

      {/* Kind selector */}
      <div className="flex gap-1.5">
        {(Object.entries(KIND_CFG) as [ParticipantKind, typeof KIND_CFG[ParticipantKind]][]).map(([k, cfg]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className="flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all border"
            style={kind === k
              ? { background: cfg.activeBg, color: "#fff", borderColor: cfg.activeBg }
              : { background: "#fff", color: "#64748B", borderColor: "#E2E8F0" }
            }
          >
            {cfg.label}
          </button>
        ))}
      </div>

      {/* Name */}
      <input
        ref={nameRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Nome completo..."
        className="w-full px-3 py-2 text-sm rounded-xl border bg-white outline-none transition-all placeholder:text-slate-300"
        style={{ borderColor: name ? KIND_CFG[kind].border : "#E2E8F0",
                 boxShadow: name ? `0 0 0 3px ${KIND_CFG[kind].dot}18` : "none" }}
      />

      {/* Area label */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: KIND_CFG[kind].text }}>
          Área / Departamento
        </p>

        {/* Area chips */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {AREA_SUGGESTIONS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => selectArea(a)}
              className="px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all"
              style={area === a && !customArea
                ? { background: KIND_CFG[kind].activeBg, color: "#fff", borderColor: KIND_CFG[kind].activeBg }
                : { background: "#fff", color: "#64748B", borderColor: "#E2E8F0" }
              }
            >
              {a}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setCustomArea(true); setArea("") }}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all"
            style={customArea
              ? { background: KIND_CFG[kind].activeBg, color: "#fff", borderColor: KIND_CFG[kind].activeBg }
              : { background: "#fff", color: "#64748B", borderColor: "#E2E8F0" }
            }
          >
            Outra...
          </button>
        </div>

        {/* Custom area input */}
        {customArea && (
          <input
            autoFocus
            value={area}
            onChange={(e) => setArea(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Digite a área..."
            className="w-full px-3 py-2 text-sm rounded-xl border bg-white outline-none placeholder:text-slate-300"
            style={{ borderColor: KIND_CFG[kind].border }}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={!name.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black text-white transition-all disabled:opacity-40"
          style={{ background: !name.trim() ? "#CBD5E1" : `linear-gradient(135deg, ${KIND_CFG[kind].dot}, ${KIND_CFG[kind].activeBg})` }}
        >
          <Check className="w-3.5 h-3.5" />
          Adicionar Participante
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── Trigger Button (the "+ Novo" chip) ───────────────────────────────────────

export function NewParticipantTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border-2 border-dashed transition-all group"
      style={{ borderColor: "#CBD5E1", color: "#94A3B8", background: "transparent" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#7C3AED"
        e.currentTarget.style.color = "#7C3AED"
        e.currentTarget.style.background = "#F5F3FF"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#CBD5E1"
        e.currentTarget.style.color = "#94A3B8"
        e.currentTarget.style.background = "transparent"
      }}
    >
      <Plus className="w-3.5 h-3.5" />
      Novo
    </button>
  )
}
