"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { Search, X, Check, Users, Plus, UserPlus } from "lucide-react"
import { UserAvatar } from "@/components/ui/user-avatar"
import type { NewParticipant, ParticipantKind } from "@/components/meeting-new-participant"

export type PickerUser = {
  id:         string
  name:       string
  image:      string | null
  department: string | null
  badge:      string
}

interface MeetingParticipantPickerProps {
  /** Participantes já ligados ao projeto — aparecem pré-selecionados */
  projectParticipants: PickerUser[]
  /** Todos os usuários ativos do sistema — usados na busca */
  allUsers:            PickerUser[]
  /** IDs selecionados (estado controlado pelo pai) */
  selectedIds:         string[]
  onChange:            (ids: string[]) => void
  /** Participantes externos (nome livre) */
  externalAttendees?:  NewParticipant[]
  onAddExternal?:      (p: NewParticipant) => void
  onRemoveExternal?:   (id: string) => void
}

const BADGE_CFG: Record<string, { bg: string; color: string }> = {
  Sponsor:        { bg: "rgba(245,158,11,0.12)",  color: "#D97706" },
  Responsável:    { bg: "rgba(36,99,255,0.10)",   color: "#2463FF" },
  ADMIN:          { bg: "rgba(239,68,68,0.10)",   color: "#DC2626" },
  DIRECTOR:       { bg: "rgba(139,92,246,0.10)",  color: "#7C3AED" },
  PROJECT_MANAGER:{ bg: "rgba(16,185,129,0.10)",  color: "#059669" },
  Membro:         { bg: "rgba(100,116,139,0.10)", color: "#475569" },
  Externo:        { bg: "rgba(100,116,139,0.08)", color: "#64748B" },
}

function badgeCfg(badge: string) {
  return BADGE_CFG[badge] ?? { bg: "rgba(100,116,139,0.10)", color: "#475569" }
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase()
}

// ─── External attendee form ───────────────────────────────────────────────────

function ExternalForm({ onAdd, onCancel }: { onAdd: (p: NewParticipant) => void; onCancel: () => void }) {
  const [name, setName] = useState("")
  const [area, setArea] = useState("")
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  function submit() {
    const n = name.trim()
    if (!n) return
    onAdd({ id: Math.random().toString(36).slice(2), name: n, area: area.trim(), kind: "EXTERNO" as ParticipantKind })
    setName(""); setArea("")
  }

  return (
    <div className="flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-[#7B2FBE] bg-violet-50/40">
      <input
        ref={ref}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel() }}
        placeholder="Nome do participante"
        className="flex-1 text-xs bg-transparent outline-none text-[#0F172A] placeholder:text-slate-300 min-w-0"
      />
      <input
        value={area}
        onChange={(e) => setArea(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel() }}
        placeholder="Área/Empresa (opcional)"
        className="w-36 text-xs bg-transparent outline-none text-[#0F172A] placeholder:text-slate-300"
      />
      <button onClick={submit} disabled={!name.trim()}
        className="p-1 rounded-lg bg-[#7B2FBE] text-white disabled:opacity-40 hover:bg-[#6D28D9] transition-colors">
        <Check className="w-3 h-3" />
      </button>
      <button onClick={onCancel} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MeetingParticipantPicker({
  projectParticipants,
  allUsers,
  selectedIds,
  onChange,
  externalAttendees = [],
  onAddExternal,
  onRemoveExternal,
}: MeetingParticipantPickerProps) {
  const [search, setSearch]           = useState("")
  const [dropdownOpen, setDropdown]   = useState(false)
  const [addingExternal, setAddingExt]= useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Users NOT in project — shown in the search dropdown
  const projectIds = useMemo(() => new Set(projectParticipants.map((p) => p.id)), [projectParticipants])
  const externalIds = useMemo(() => new Set(externalAttendees.map((e) => e.id)), [externalAttendees])

  const otherUsers = useMemo(() =>
    allUsers.filter((u) => !projectIds.has(u.id)),
    [allUsers, projectIds])

  const searchResults = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return otherUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || (u.department ?? "").toLowerCase().includes(q)
    ).slice(0, 8)
  }, [search, otherUsers])

  // Additional users picked from search (not project members)
  const addedFromSearch = useMemo(() =>
    allUsers.filter((u) => !projectIds.has(u.id) && selectedIds.includes(u.id)),
    [allUsers, projectIds, selectedIds])

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
  }

  function addFromSearch(u: PickerUser) {
    if (!selectedIds.includes(u.id)) onChange([...selectedIds, u.id])
    setSearch("")
    setDropdown(false)
  }

  function removeFromSearch(id: string) {
    onChange(selectedIds.filter((x) => x !== id))
  }

  const totalSelected = selectedIds.length + externalAttendees.length

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <Users className="w-3 h-3" />
          Participantes
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#7B2FBE]/10 text-[#7B2FBE]">
            {totalSelected} selecionado{totalSelected !== 1 ? "s" : ""}
          </span>
        </p>
        <button
          type="button"
          onClick={() => {
            const allIds = projectParticipants.map((p) => p.id)
            const allSelected = allIds.every((id) => selectedIds.includes(id))
            onChange(allSelected ? [] : allIds)
          }}
          className="text-[9px] font-semibold text-[#7B2FBE] hover:underline"
        >
          {projectParticipants.every((p) => selectedIds.includes(p.id)) ? "Desmarcar todos" : "Selecionar todos"}
        </button>
      </div>

      {/* Project participants — chips com foto */}
      {projectParticipants.length > 0 && (
        <div>
          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Equipe do projeto
          </p>
          <div className="flex flex-wrap gap-2">
            {projectParticipants.map((p) => {
              const selected = selectedIds.includes(p.id)
              const bc = badgeCfg(p.badge)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all border"
                  style={selected
                    ? { background: "linear-gradient(135deg,#2463FF,#7B2FBE)", color: "#fff", borderColor: "transparent", boxShadow: "0 2px 10px rgba(36,99,255,0.30)" }
                    : { background: "#fff", borderColor: "#E2E8F0", color: "#475569" }
                  }
                >
                  <div className={`rounded-full overflow-hidden shrink-0 ${selected ? "ring-2 ring-white/40" : ""}`}
                    style={{ width: 24, height: 24 }}>
                    <UserAvatar name={p.name} image={p.image} size={24} />
                  </div>
                  <div className="text-left leading-tight min-w-0">
                    <p className="truncate max-w-[100px]">{p.name.split(" ")[0]} {p.name.split(" ")[1] ?? ""}</p>
                    {p.badge && (
                      <p className="text-[8.5px] font-normal"
                        style={{ color: selected ? "rgba(255,255,255,0.65)" : bc.color }}>
                        {p.badge}
                      </p>
                    )}
                  </div>
                  {selected && <Check className="w-3 h-3 shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Added from search */}
      {addedFromSearch.length > 0 && (
        <div>
          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Adicionados da busca
          </p>
          <div className="flex flex-wrap gap-2">
            {addedFromSearch.map((u) => (
              <div key={u.id}
                className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold border"
                style={{ background: "rgba(16,185,129,0.06)", borderColor: "rgba(16,185,129,0.25)", color: "#059669" }}>
                <UserAvatar name={u.name} image={u.image} size={22} />
                <span>{u.name.split(" ")[0]} {u.name.split(" ")[1] ?? ""}</span>
                {u.department && <span className="text-[8.5px] text-slate-400">{u.department}</span>}
                <button onClick={() => removeFromSearch(u.id)} className="ml-1 hover:text-red-500 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search to add other users */}
      <div className="relative">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white focus-within:border-[#7B2FBE] focus-within:ring-2 focus-within:ring-violet-50 transition-all">
          <Search className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setDropdown(true) }}
            onFocus={() => setDropdown(true)}
            onBlur={() => setTimeout(() => setDropdown(false), 150)}
            placeholder="Buscar e adicionar outros participantes do sistema..."
            className="flex-1 text-xs bg-transparent outline-none text-[#0F172A] placeholder:text-slate-300"
          />
          {search && (
            <button onClick={() => { setSearch(""); setDropdown(false) }} className="text-slate-300 hover:text-slate-500">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {dropdownOpen && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            {searchResults.map((u) => {
              const already = selectedIds.includes(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={() => addFromSearch(u)}
                  disabled={already}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-violet-50 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed border-b border-slate-50 last:border-0"
                >
                  <UserAvatar name={u.name} image={u.image} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#0F172A] truncate">{u.name}</p>
                    {u.department && <p className="text-[10px] text-slate-400">{u.department}</p>}
                  </div>
                  {already
                    ? <span className="text-[9px] text-emerald-500 font-semibold shrink-0">Já adicionado</span>
                    : <Plus className="w-3.5 h-3.5 text-[#7B2FBE] shrink-0" />
                  }
                </button>
              )
            })}
          </div>
        )}

        {dropdownOpen && search.trim() && searchResults.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-slate-200 bg-white shadow-xl px-4 py-3">
            <p className="text-xs text-slate-400">Nenhum usuário encontrado para "{search}"</p>
          </div>
        )}
      </div>

      {/* External attendees */}
      {(onAddExternal || externalAttendees.length > 0) && (
        <div>
          {externalAttendees.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {externalAttendees.map((ext) => (
                <div key={ext.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold border"
                  style={{ background: "#F8FAFC", borderColor: "#E2E8F0", color: "#475569" }}>
                  <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-black text-slate-500 shrink-0">
                    {initials(ext.name)}
                  </div>
                  <span>{ext.name}</span>
                  {ext.area && <span className="text-[9px] text-slate-400">· {ext.area}</span>}
                  {onRemoveExternal && (
                    <button onClick={() => onRemoveExternal(ext.id)} className="ml-1 hover:text-red-500 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {addingExternal ? (
            <ExternalForm
              onAdd={(p) => { onAddExternal?.(p); setAddingExt(false) }}
              onCancel={() => setAddingExt(false)}
            />
          ) : (
            onAddExternal && (
              <button
                type="button"
                onClick={() => setAddingExt(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 border border-dashed border-slate-300 hover:border-[#7B2FBE] hover:text-[#7B2FBE] hover:bg-violet-50 transition-all"
              >
                <UserPlus className="w-3 h-3" />
                Adicionar participante externo
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
