"use client"

import { useState, useTransition } from "react"
import {
  Plus, Trash2, Save, Loader2, Check, AlertCircle,
  Eye, Edit3, Shield, X, ChevronDown, Users,
} from "lucide-react"
import { FEATURE_GROUPS } from "@/lib/constants/features"
import type { FeatureDef } from "@/lib/constants/features"
import {
  createAccessProfile, updateAccessProfile, deleteAccessProfile,
  type ProfileRow, type PermissionsMap,
} from "@/lib/actions/access-profiles"

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILE_COLORS = [
  "#7B2FBE", "#2463FF", "#059669", "#DC2626",
  "#D97706", "#0891B2", "#64748B", "#EA580C",
]

function buildAllPermissions(canEdit: boolean): PermissionsMap {
  const result: PermissionsMap = {}
  for (const g of FEATURE_GROUPS) {
    for (const f of g.features) {
      result[f.key] = { canView: true, canEdit: f.hasEdit ? canEdit : false }
    }
  }
  return result
}

const PRESETS = [
  { key: "full",     label: "Liberar tudo",          desc: "Visualizar e editar tudo",     dot: "#059669" },
  { key: "readonly", label: "Somente visualização",   desc: "Ver sem poder editar",         dot: "#2463FF" },
  { key: "clear",    label: "Remover tudo",            desc: "Nenhuma permissão concedida", dot: "#DC2626" },
] as const

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  checked, disabled, onChange,
}: {
  checked: boolean; disabled?: boolean; onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      title={disabled ? "Ative 'Visualizar' primeiro" : undefined}
      className="relative w-9 h-5 rounded-full transition-all duration-200 shrink-0"
      style={{
        background: checked && !disabled ? "#7B2FBE" : "#E2E8F0",
        opacity:    disabled ? 0.4 : 1,
        cursor:     disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200"
        style={{ left: checked ? "calc(100% - 18px)" : "2px" }}
      />
    </button>
  )
}

// ─── Feature Row ──────────────────────────────────────────────────────────────

function FeatureRow({
  feature, perm, onChange,
}: {
  feature:  FeatureDef
  perm:     { canView: boolean; canEdit: boolean }
  onChange: (key: string, p: { canView: boolean; canEdit: boolean }) => void
}) {
  const setView = (v: boolean) =>
    onChange(feature.key, { canView: v, canEdit: v ? perm.canEdit : false })
  const setEdit = (v: boolean) =>
    onChange(feature.key, { canView: perm.canView, canEdit: v })

  return (
    <div className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/70 transition-colors border-b border-slate-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-700 leading-tight">{feature.label}</p>
        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{feature.desc}</p>
      </div>
      <div className="flex items-center gap-8 shrink-0">
        <div className="w-10 flex justify-center">
          <Toggle checked={perm.canView} onChange={setView} />
        </div>
        <div className="w-10 flex justify-center">
          {feature.hasEdit
            ? <Toggle checked={perm.canEdit} disabled={!perm.canView} onChange={setEdit} />
            : <span className="text-slate-200 text-sm font-bold">—</span>}
        </div>
      </div>
    </div>
  )
}

// ─── Permission Summary ───────────────────────────────────────────────────────

function PermSummary({ permissions }: { permissions: PermissionsMap }) {
  const viewCount = Object.values(permissions).filter((p) => p.canView).length
  const editCount = Object.values(permissions).filter((p) => p.canEdit).length
  const total     = FEATURE_GROUPS.flatMap((g) => g.features).length

  return (
    <div className="flex items-center gap-3 mt-1">
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
        <Eye className="w-2.5 h-2.5" /> {viewCount}/{total} ver
      </span>
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
        <Edit3 className="w-2.5 h-2.5" /> {editCount} editar
      </span>
    </div>
  )
}

// ─── Profile Card ─────────────────────────────────────────────────────────────

function ProfileCard({
  profile, active, onClick, onDelete,
}: {
  profile:  ProfileRow
  active:   boolean
  onClick:  () => void
  onDelete: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all"
      style={{
        background:   active ? `${profile.color}12` : "transparent",
        border:       active ? `1.5px solid ${profile.color}35` : "1.5px solid transparent",
        marginBottom: "2px",
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white text-[10px] font-black"
        style={{ background: profile.color }}
      >
        {profile.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-slate-800 truncate leading-tight">{profile.name}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          <Users className="inline w-2.5 h-2.5 mr-0.5" />
          {profile._count.users} usuário{profile._count.users !== 1 ? "s" : ""}
        </p>
      </div>
      {!profile.isSystem && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// ─── Profile Editor ───────────────────────────────────────────────────────────

function ProfileEditor({
  isNew, profileId, initialName, initialDesc, initialColor, initialPerms,
  onCreated, onUpdated,
}: {
  isNew:        boolean
  profileId:    string | null
  initialName:  string
  initialDesc:  string
  initialColor: string
  initialPerms: PermissionsMap
  onCreated:    (p: ProfileRow) => void
  onUpdated:    (id: string, name: string, desc: string, color: string, perms: PermissionsMap) => void
}) {
  const [name,        setName]        = useState(initialName)
  const [description, setDescription] = useState(initialDesc)
  const [color,       setColor]       = useState(initialColor)
  const [permissions, setPermissions] = useState<PermissionsMap>(initialPerms)
  const [error,       setError]       = useState<string | null>(null)
  const [saved,       setSaved]       = useState(false)
  const [expandedGrp, setExpandedGrp] = useState<string | null>(null)
  const [isPending,   start]          = useTransition()

  const perm = (key: string) => permissions[key] ?? { canView: false, canEdit: false }

  function setFeaturePerm(key: string, p: { canView: boolean; canEdit: boolean }) {
    setPermissions((prev) => ({ ...prev, [key]: p }))
    setSaved(false)
  }

  function applyPreset(type: "full" | "readonly" | "clear") {
    if (type === "clear") { setPermissions({}); setSaved(false); return }
    setPermissions(buildAllPermissions(type === "full"))
    setSaved(false)
  }

  function handleSave() {
    if (!name.trim()) { setError("Nome é obrigatório"); return }
    setError(null)
    start(async () => {
      try {
        if (isNew) {
          const created = await createAccessProfile({ name, description, color, permissions })
          onCreated(created)
          setSaved(true)
          setTimeout(() => setSaved(false), 2500)
        } else if (profileId) {
          await updateAccessProfile(profileId, { name, description, color, permissions })
          onUpdated(profileId, name, description, color, permissions)
          setSaved(true)
          setTimeout(() => setSaved(false), 2500)
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao salvar")
      }
    })
  }

  const viewCount = Object.values(permissions).filter((p) => p.canView).length
  const editCount = Object.values(permissions).filter((p) => p.canEdit).length
  const total     = FEATURE_GROUPS.flatMap((g) => g.features).length

  const iCls = "w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-[#F7F6F2] outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all placeholder:text-slate-300"

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden flex flex-col"
      style={{ border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
    >
      {/* ── Top bar ──────────────────────────────── */}
      <div
        className="flex items-center gap-4 px-6 py-4 shrink-0"
        style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
      >
        {/* Profile avatar */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black shrink-0 transition-all"
          style={{ background: color }}
        >
          {name ? name.slice(0, 2).toUpperCase() : "??"}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-800 truncate leading-tight">
            {name || (isNew ? "Novo perfil" : "Perfil sem nome")}
          </p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-slate-400">
              <Eye className="inline w-2.5 h-2.5 mr-0.5 text-blue-400" />
              {viewCount}/{total} visualizar
            </span>
            <span className="text-[10px] text-slate-400">
              <Edit3 className="inline w-2.5 h-2.5 mr-0.5 text-violet-400" />
              {editCount} editar
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {error && (
            <span className="flex items-center gap-1.5 text-xs text-red-600 font-medium px-3 py-1.5 bg-red-50 rounded-xl border border-red-100">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </span>
          )}
          {saved && !error && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium px-3 py-1.5 bg-emerald-50 rounded-xl border border-emerald-100">
              <Check className="w-3.5 h-3.5" /> Salvo!
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}
          >
            {isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</>
              : <><Save className="w-3.5 h-3.5" /> {isNew ? "Criar Perfil" : "Salvar"}</>}
          </button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────── */}
      <div className="flex min-h-0" style={{ maxHeight: "calc(100vh - 300px)" }}>

        {/* Left sidebar: name / color / presets */}
        <div
          className="w-52 shrink-0 p-5 space-y-5 overflow-y-auto"
          style={{ borderRight: "1px solid rgba(0,0,0,0.06)" }}
        >
          {/* Name */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
              Nome <span className="text-red-400">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={iCls}
              placeholder="Ex: Gerente de Projeto"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${iCls} resize-none`}
              placeholder="Descreva as responsabilidades deste perfil..."
            />
          </div>

          {/* Color */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Cor de identificação
            </label>
            <div className="flex flex-wrap gap-2">
              {PROFILE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-lg transition-all"
                  style={{
                    background:   c,
                    outline:      color === c ? `2.5px solid ${c}` : "none",
                    outlineOffset: "2px",
                    transform:    color === c ? "scale(1.1)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Presets */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Aplicar modelo rápido
            </label>
            <div className="space-y-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyPreset(preset.key)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all hover:bg-slate-50 border border-slate-100 hover:border-slate-200 group"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: preset.dot }}
                  />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-700 leading-tight">{preset.label}</p>
                    <p className="text-[10px] text-slate-400 leading-tight">{preset.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Feature permission matrix */}
        <div className="flex-1 overflow-y-auto">

          {/* Column headers — sticky */}
          <div
            className="flex items-center gap-4 px-5 py-2.5 sticky top-0 z-10"
            style={{ background: "#F8F7F3", borderBottom: "1px solid rgba(0,0,0,0.06)" }}
          >
            <div className="flex-1">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Funcionalidade</p>
            </div>
            <div className="flex items-center gap-8 shrink-0">
              <div className="w-10 text-center">
                <Eye className="w-3.5 h-3.5 text-slate-400 mx-auto" />
                <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 mt-0.5">Ver</p>
              </div>
              <div className="w-10 text-center">
                <Edit3 className="w-3.5 h-3.5 text-slate-400 mx-auto" />
                <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 mt-0.5">Editar</p>
              </div>
            </div>
          </div>

          {/* Feature groups */}
          {FEATURE_GROUPS.map((group) => {
            const groupViewCount = group.features.filter((f) => perm(f.key).canView).length
            const isExpanded     = expandedGrp !== group.key
            return (
              <div key={group.key}>
                {/* Group header — clickable to collapse */}
                <button
                  type="button"
                  onClick={() => setExpandedGrp(isExpanded ? group.key : null)}
                  className="w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors hover:opacity-90"
                  style={{
                    background:  `${group.color}0A`,
                    borderLeft:  `3px solid ${group.color}`,
                    borderBottom: "1px solid rgba(0,0,0,0.05)",
                  }}
                >
                  <span
                    className="text-[10px] font-black uppercase tracking-[0.12em] flex-1"
                    style={{ color: group.color }}
                  >
                    {group.label}
                  </span>
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: `${group.color}18`, color: group.color }}
                  >
                    {groupViewCount}/{group.features.length}
                  </span>
                  <ChevronDown
                    className="w-3.5 h-3.5 transition-transform shrink-0"
                    style={{ color: group.color, transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                  />
                </button>

                {/* Feature rows */}
                {isExpanded && group.features.map((f) => (
                  <FeatureRow
                    key={f.key}
                    feature={f}
                    perm={perm(f.key)}
                    onChange={setFeaturePerm}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function AccessProfilesTab({ initialProfiles }: { initialProfiles: ProfileRow[] }) {
  const [profiles,    setProfiles]    = useState<ProfileRow[]>(initialProfiles)
  const [selectedId,  setSelectedId]  = useState<string | "new" | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isPending,   start]          = useTransition()

  const selectedProfile = profiles.find((p) => p.id === selectedId)
  const isNew           = selectedId === "new"

  function openNew() {
    setSelectedId("new")
    setDeleteError(null)
  }

  function openProfile(p: ProfileRow) {
    setSelectedId(p.id)
    setDeleteError(null)
  }

  function handleCreated(p: ProfileRow) {
    setProfiles((prev) => [...prev, p])
    setSelectedId(p.id)
  }

  function handleUpdated(id: string, name: string, desc: string, color: string, perms: PermissionsMap) {
    setProfiles((prev) =>
      prev.map((p) => p.id === id ? { ...p, name, description: desc || null, color, permissions: perms } : p)
    )
  }

  function handleDelete(id: string) {
    setDeleteError(null)
    start(async () => {
      const res = await deleteAccessProfile(id)
      if (!res.success) { setDeleteError(res.error ?? "Erro ao excluir"); return }
      setProfiles((prev) => prev.filter((p) => p.id !== id))
      if (selectedId === id) setSelectedId(null)
    })
  }

  return (
    <div className="flex gap-5 h-full" style={{ minHeight: 600 }}>

      {/* ── Left: Profile list ─────────────────────────────────────────── */}
      <div className="w-56 shrink-0">
        <div
          className="bg-white rounded-2xl p-3 flex flex-col"
          style={{ border: "1px solid rgba(0,0,0,0.06)", minHeight: 400 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-1 mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-violet-400" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Perfis</p>
            </div>
            <button
              onClick={openNew}
              className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg text-violet-600 hover:bg-violet-50 transition-colors border border-violet-100"
            >
              <Plus className="w-3 h-3" /> Novo
            </button>
          </div>

          {deleteError && (
            <div className="mb-2 flex items-center gap-1.5 px-2 py-2 rounded-xl bg-red-50 border border-red-100 text-[10px] text-red-600 font-medium">
              <AlertCircle className="w-3 h-3 shrink-0" /> {deleteError}
            </div>
          )}

          {/* Profile cards */}
          <div className="flex-1">
            {profiles.length === 0 && !isNew ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <Shield className="w-8 h-8 text-slate-100" />
                <p className="text-[11px] text-slate-400 font-medium">Nenhum perfil</p>
                <p className="text-[10px] text-slate-300">Clique em "Novo" para criar</p>
              </div>
            ) : (
              <>
                {profiles.map((p) => (
                  <ProfileCard
                    key={p.id}
                    profile={p}
                    active={selectedId === p.id}
                    onClick={() => openProfile(p)}
                    onDelete={() => handleDelete(p.id)}
                  />
                ))}

                {/* New profile placeholder in list */}
                {isNew && (
                  <div
                    className="flex items-center gap-3 px-3 py-3 rounded-xl mt-0.5"
                    style={{ background: "rgba(123,47,190,0.06)", border: "1.5px dashed rgba(123,47,190,0.25)" }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(123,47,190,0.15)" }}
                    >
                      <Plus className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-violet-600">Novo perfil</p>
                      <p className="text-[10px] text-slate-400">Preenchendo...</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer hint */}
          <div
            className="mt-3 px-3 py-2.5 rounded-xl"
            style={{ background: "rgba(0,0,0,0.025)", border: "1px solid rgba(0,0,0,0.05)" }}
          >
            <p className="text-[9px] text-slate-400 leading-relaxed">
              Perfis definem quais telas e ações cada usuário pode acessar no sistema.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right: Editor ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {!selectedId ? (
          /* Empty state */
          <div
            className="flex flex-col items-center justify-center h-full gap-4 text-center bg-white rounded-2xl"
            style={{ border: "1px solid rgba(0,0,0,0.06)", minHeight: 400 }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(123,47,190,0.06), rgba(36,99,255,0.04))" }}
            >
              <Shield className="w-8 h-8 text-violet-200" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-700">Selecione ou crie um perfil de acesso</p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Perfis controlam quais telas e funcionalidades cada grupo de usuários pode visualizar e editar.
              </p>
            </div>
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}
            >
              <Plus className="w-4 h-4" /> Criar primeiro perfil
            </button>
          </div>
        ) : (
          /* Profile editor — key forces re-mount when switching profiles */
          <ProfileEditor
            key={selectedId}
            isNew={isNew}
            profileId={isNew ? null : (selectedId as string)}
            initialName={selectedProfile?.name ?? ""}
            initialDesc={selectedProfile?.description ?? ""}
            initialColor={selectedProfile?.color ?? "#7B2FBE"}
            initialPerms={selectedProfile?.permissions ?? {}}
            onCreated={handleCreated}
            onUpdated={handleUpdated}
          />
        )}
      </div>
    </div>
  )
}
