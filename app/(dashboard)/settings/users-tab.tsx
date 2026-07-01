"use client"

import { useState, useEffect, useTransition, useRef } from "react"
import {
  Plus, Search, Pencil, Key, Power, Trash2,
  X, Save, Loader2, Check, AlertCircle, Camera,
  Users, UserCheck, UserX, Shield, ChevronDown, Mail,
} from "lucide-react"
import {
  createUser, updateUserById, toggleUserActive,
  deleteUser, resetUserPassword,
} from "@/lib/actions/profile"
import { createInvitation } from "@/lib/actions/invitations"
import { getUserOrgAccess, setUserOrgAccess } from "@/lib/actions/user-org-access"
import { sendResetToUser } from "@/lib/actions/password-reset"
import type { OrgRow } from "@/lib/actions/organizations"
import { ROLE_LABELS, UserRole } from "@/lib/permissions"

// ─── Types ────────────────────────────────────────────────────────────────────

type User = {
  id:         string
  name:       string
  email:      string
  department: string | null
  phone:      string | null
  image:      string | null
  role:       string
  active:     boolean
  createdAt?: Date
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ROLE_CFG: Record<string, { bg: string; text: string; border: string }> = {
  ADMIN:           { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  DIRECTOR:        { bg: "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" },
  PROJECT_MANAGER: { bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  PROJECT_MEMBER:  { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
  SPONSOR:         { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  CLIENT:          { bg: "#F8FAFC", text: "#475569", border: "#E2E8F0" },
}

const ALL_ROLES = Object.entries(ROLE_LABELS) as [UserRole, string][]

// Departamentos padronizados da Vendemmia
const DEPARTMENTS = [
  "Comercial",
  "Controladoria",
  "Customer Success",
  "Diretoria",
  "Financeiro",
  "Fiscal",
  "Jurídico",
  "Logística",
  "Marketing",
  "Operações",
  "Projetos",
  "Qualidade",
  "Recursos Humanos",
  "Tecnologia",
  "Compras",
]

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

// Converte avatar via canvas (80×80 JPEG) para caber no JWT sem estourar o cookie
function avatarToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 80
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
      const w = Math.max(1, Math.round(img.width  * ratio))
      const h = Math.max(1, Math.round(img.height * ratio))
      const canvas = document.createElement("canvas")
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("Canvas não suportado")); return }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL("image/jpeg", 0.78))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Falha ao ler imagem")) }
    img.src = url
  })
}

// ─── Avatar component ─────────────────────────────────────────────────────────

function UserAvatar({
  name, imageUrl, size = 40, editable = false,
  onUpload,
}: {
  name: string; imageUrl: string | null; size?: number
  editable?: boolean; onUpload?: (url: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(f: File) {
    if (!f.type.startsWith("image/") || !onUpload) return
    setUploading(true)
    try { onUpload(await avatarToBase64(f)) } finally { setUploading(false) }
  }

  const s = size + "px"
  return (
    <div className="relative shrink-0 group" style={{ width: s, height: s }}>
      <div
        className="rounded-xl overflow-hidden flex items-center justify-center text-white font-black"
        style={{
          width: s, height: s,
          fontSize: size * 0.35,
          background: imageUrl ? "transparent" : "linear-gradient(135deg, #7B2FBE, #2463FF)",
        }}
      >
        {imageUrl
          ? <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
          : <span>{initials(name)}</span>}
      </div>
      {editable && (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "rgba(0,0,0,0.45)" }}
          >
            {uploading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Camera className="w-4 h-4 text-white" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </>
      )}
    </div>
  )
}

// ─── Filial Picker ────────────────────────────────────────────────────────────

function FilialPicker({ orgs, selected, onChange }: {
  orgs:     OrgRow[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])

  const selectedOrgs = orgs.filter((o) => selected.includes(o.id))

  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
        Acesso às Filiais
      </label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-xl border bg-[#F7F6F2] text-left transition-all hover:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
        style={{ borderColor: open ? "#a78bfa" : "#e2e8f0" }}
      >
        <span className="text-sm" style={{ color: selected.length ? "#0F172A" : "#CBD5E1" }}>
          {selected.length === 0
            ? "Nenhuma filial selecionada"
            : `${selected.length} filial${selected.length > 1 ? "is" : ""} selecionada${selected.length > 1 ? "s" : ""}`}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-1 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {orgs.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => toggle(org.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0"
            >
              <div
                className="w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0"
                style={{
                  background:   selected.includes(org.id) ? "#7B2FBE" : "#fff",
                  borderColor:  selected.includes(org.id) ? "#7B2FBE" : "#CBD5E1",
                }}
              >
                {selected.includes(org.id) && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span className="text-sm text-slate-700 flex-1 truncate">{org.name}</span>
              <span className="text-[10px] text-slate-400 shrink-0">{org._count.users} usuários</span>
            </button>
          ))}
        </div>
      )}

      {selectedOrgs.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selectedOrgs.map((org) => (
            <span
              key={org.id}
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "#F3EFFE", color: "#7B2FBE", border: "1px solid #DDD6FE" }}
            >
              {org.name}
              <button type="button" onClick={() => toggle(org.id)} className="hover:opacity-70">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── User Form (create / edit) ────────────────────────────────────────────────

type FormMode = "create" | "edit"

function UserForm({
  mode, initial, currentUserId, orgs, onSave, onCancel,
}: {
  mode:          FormMode
  initial?:      User
  currentUserId: string
  orgs:          OrgRow[]
  onSave:        (u: User) => void
  onCancel:      () => void
}) {
  const [name,       setName]       = useState(initial?.name       ?? "")
  // Synthetic users get empty email so the user is forced to type a real one
  const [email,      setEmail]      = useState(
    initial?.email?.includes("@ext.planner") ? "" : (initial?.email ?? "")
  )
  const [password,   setPassword]   = useState("")
  const [role,       setRole]       = useState(initial?.role       ?? "PROJECT_MEMBER")
  const initDept = initial?.department ?? ""
  const [department, setDepartment] = useState(
    DEPARTMENTS.includes(initDept) ? initDept : (initDept ? "__other__" : "")
  )
  const [customDept, setCustomDept] = useState(
    initDept && !DEPARTMENTS.includes(initDept) ? initDept : ""
  )
  const [phone,           setPhone]           = useState(initial?.phone  ?? "")
  const [imageUrl,        setImageUrl]        = useState<string | null>(initial?.image ?? null)
  const [active,          setActive]          = useState(initial?.active ?? true)
  const [selectedOrgIds,  setSelectedOrgIds]  = useState<string[]>([])
  const [error,           setError]           = useState<string | null>(null)
  const [isPending,       start]              = useTransition()

  useEffect(() => {
    if (mode !== "edit" || !initial || !orgs.length) return
    getUserOrgAccess(initial.id).then(setSelectedOrgIds).catch(() => {})
  }, [mode, initial?.id, orgs.length])

  // Effective department: if select is "__other__", use the customDept text
  const effectiveDept = department === "__other__" ? customDept : department

  function handleSubmit() {
    if (!name.trim())  { setError("Nome é obrigatório"); return }
    if (!email.trim()) { setError("E-mail é obrigatório"); return }
    if (mode === "create" && password.length < 6) { setError("Senha deve ter no mínimo 6 caracteres"); return }
    if (department === "__other__" && !customDept.trim()) { setError("Informe o nome do departamento"); return }
    setError(null)
    start(async () => {
      try {
        if (mode === "create") {
          const created = await createUser({
            name, email, password, role, department: effectiveDept, phone,
            extraOrgIds: orgs.length ? selectedOrgIds : undefined,
          })
          onSave({ ...created, phone: created.phone ?? null, createdAt: undefined })
        } else if (initial) {
          const updated = await updateUserById(initial.id, { name, email, department: effectiveDept, phone, image: imageUrl, role, active })
          if (orgs.length) await setUserOrgAccess(initial.id, selectedOrgIds)
          onSave({ ...initial, ...updated, email: email.trim().toLowerCase(), role: updated.role ?? initial.role, active: updated.active ?? initial.active })
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao salvar")
      }
    })
  }

  const iCls = "w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-[#F7F6F2] outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all placeholder:text-slate-300"

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <h3 className="text-sm font-black text-[#0F172A]">{mode === "create" ? "Novo Usuário" : "Editar Usuário"}</h3>
        <button type="button" onClick={onCancel} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Error — always visible, above the scroll area */}
      {error && (
        <div className="mx-6 mt-3 shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

        {/* Avatar */}
        {mode === "edit" && initial && (
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <UserAvatar name={name || initial.name} imageUrl={imageUrl} size={56} editable onUpload={setImageUrl} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{name || initial.name}</p>
              {(!email.trim() || email.includes("@ext.planner")) ? (
                <p className="text-[10px] text-orange-500 mt-0.5 font-semibold">⚠ Preencha o e-mail corporativo abaixo</p>
              ) : (
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{email}</p>
              )}
              <p className="text-[10px] text-slate-300 mt-0.5">Clique no avatar para trocar a foto</p>
            </div>
          </div>
        )}

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Nome Completo <span className="text-red-400">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={iCls} placeholder="Nome do usuário" />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
            E-mail <span className="text-red-400">*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={iCls}
            placeholder="nome@vendemmia.com.br"
          />
        </div>

        {mode === "create" && (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Senha inicial <span className="text-red-400">*</span></label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={iCls} placeholder="Mínimo 6 caracteres" />
          </div>
        )}

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Cargo / Perfil</label>
          <div className="relative">
            <select value={role} onChange={(e) => setRole(e.target.value)} className={`${iCls} appearance-none pr-8 cursor-pointer`}>
              {ALL_ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Departamento</label>
          <div className="relative">
            <select
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value)
                if (e.target.value !== "__other__") setCustomDept("")
              }}
              className={`${iCls} appearance-none pr-8 cursor-pointer`}
            >
              <option value="">— Selecionar —</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              <option value="__other__">Outro (digitar)…</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          {department === "__other__" && (
            <input
              value={customDept}
              onChange={(e) => setCustomDept(e.target.value)}
              className={`${iCls} mt-2`}
              placeholder="Nome do departamento..."
              autoFocus
            />
          )}
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Telefone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={iCls} placeholder="(00) 00000-0000" />
        </div>

        {orgs.length > 0 && (
          <FilialPicker orgs={orgs} selected={selectedOrgIds} onChange={setSelectedOrgIds} />
        )}

        {mode === "edit" && initial && initial.id !== currentUserId && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div>
              <p className="text-xs font-semibold text-slate-700">Status da conta</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{active ? "Usuário ativo pode fazer login" : "Usuário inativo não consegue acessar"}</p>
            </div>
            <button
              type="button"
              onClick={() => setActive(!active)}
              className="relative w-11 h-6 rounded-full transition-all duration-200"
              style={{ background: active ? "linear-gradient(135deg, #7B2FBE, #2463FF)" : "#E2E8F0" }}
            >
              <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200" style={{ left: active ? "calc(100% - 22px)" : "2px" }} />
            </button>
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="shrink-0 px-6 py-4 flex gap-2" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors">
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}
        >
          {isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</> : <><Save className="w-3.5 h-3.5" /> {mode === "create" ? "Criar Usuário" : "Salvar"}</>}
        </button>
      </div>
    </div>
  )
}

// ─── Password Reset Modal ─────────────────────────────────────────────────────

function PasswordModal({ userId, userName, onClose }: { userId: string; userName: string; onClose: () => void }) {
  const [password, setPassword] = useState("")
  const [confirm,  setConfirm]  = useState("")
  const [show,     setShow]     = useState(false)
  const [done,     setDone]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [isPending, start]      = useTransition()

  function handleReset() {
    if (password !== confirm) { setError("As senhas não coincidem"); return }
    if (password.length < 6)  { setError("Mínimo de 6 caracteres"); return }
    setError(null)
    start(async () => {
      try {
        await resetUserPassword(userId, password)
        setDone(true)
        setTimeout(onClose, 1500)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao redefinir")
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-black text-[#0F172A]">Redefinir Senha</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{userName}</p>
          </div>
        </div>

        {done ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 font-semibold">
            <Check className="w-4 h-4" /> Senha redefinida com sucesso!
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Nova senha</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
                  placeholder="Mínimo 6 caracteres"
                />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">
                  {show ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Confirmar</label>
              <input
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleReset()}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
                placeholder="Repita a senha"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-xs text-red-600 font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 hover:bg-slate-100">Cancelar</button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isPending || !password || !confirm}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #D97706, #F59E0B)" }}
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                Redefinir
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteModal({ user, onConfirm, onClose, onDeactivate, isPending, error }: {
  user: User
  onConfirm: () => void
  onClose: () => void
  onDeactivate: () => void
  isPending: boolean
  error: string | null
}) {
  const isFkError = error?.startsWith("FK_CONSTRAINT:")
  const errorMsg  = error?.replace("FK_CONSTRAINT: ", "") ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-black text-[#0F172A]">Excluir Usuário</p>
            <p className="text-[11px] text-red-500 mt-0.5">Esta ação não pode ser desfeita</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Tem certeza que deseja excluir <span className="font-bold text-[#0F172A]">{user.name}</span>?<br />
          Todos os dados vinculados a este usuário serão removidos.
        </p>
        {errorMsg && (
          <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
        {isFkError ? (
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 hover:bg-slate-100">Fechar</button>
            <button type="button" onClick={onDeactivate} disabled={isPending} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-50">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
              Desativar
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 hover:bg-slate-100">Cancelar</button>
            <button type="button" onClick={onConfirm} disabled={isPending} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Excluir
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Invite Form ─────────────────────────────────────────────────────────────

function InviteForm({ orgs, onClose }: { orgs: OrgRow[]; onClose: () => void }) {
  const [name,           setName]           = useState("")
  const [email,          setEmail]          = useState("")
  const [role,           setRole]           = useState<string>("PROJECT_MEMBER")
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([])
  const [error,          setError]          = useState<string | null>(null)
  const [success,        setSuccess]        = useState(false)
  const [isPending,      start]             = useTransition()

  function handleSubmit() {
    if (!name.trim())  { setError("Nome é obrigatório"); return }
    if (!email.trim()) { setError("E-mail é obrigatório"); return }
    setError(null)
    start(async () => {
      const res = await createInvitation({
        name, email, role: role as UserRole,
        extraOrgIds: orgs.length ? selectedOrgIds : undefined,
      })
      if ("error" in res && res.error) { setError(res.error); return }
      setSuccess(true)
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4" style={{ color: "#16a34a" }} />
          <h3 className="text-sm font-bold text-slate-800">Convidar usuário</h3>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {success ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-bold text-slate-800">Convite enviado!</p>
            <p className="text-xs text-slate-400">O usuário receberá um e-mail com o link de acesso.</p>
            <button
              onClick={() => { setName(""); setEmail(""); setRole("PROJECT_MEMBER"); setSelectedOrgIds([]); setSuccess(false) }}
              className="mt-2 text-xs font-semibold text-violet-600 hover:underline"
            >
              Convidar outro usuário
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nome completo *</label>
              <input
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Ana Silva"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">E-mail *</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@vendemmia.com.br"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Perfil de acesso</label>
              <select
                value={role} onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-violet-200 cursor-pointer"
              >
                {ALL_ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {orgs.length > 0 && (
              <FilialPicker orgs={orgs} selected={selectedOrgIds} onChange={setSelectedOrgIds} />
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}
          </>
        )}
      </div>

      {!success && (
        <div className="p-5 border-t border-slate-100">
          <button
            onClick={handleSubmit} disabled={isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #16a34a, #059669)" }}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Enviar convite
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Send Reset Email Modal ───────────────────────────────────────────────────

function SendResetEmailModal({ user, orgs, onClose }: { user: User; orgs: OrgRow[]; onClose: () => void }) {
  const [done,           setDone]           = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([])
  const [isPending,      start]             = useTransition()

  useEffect(() => {
    if (!orgs.length) return
    getUserOrgAccess(user.id).then(setSelectedOrgIds).catch(() => {})
  }, [user.id, orgs.length])

  function handleSend() {
    setError(null)
    start(async () => {
      if (orgs.length) await setUserOrgAccess(user.id, selectedOrgIds).catch(() => {})
      const res = await sendResetToUser(user.id)
      if ("error" in res && res.error) { setError(res.error); return }
      setDone(true)
      setTimeout(onClose, 2000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-sm font-black text-[#0F172A]">Enviar e-mail de senha</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{user.name}</p>
          </div>
        </div>

        {done ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 font-semibold">
            <Check className="w-4 h-4" /> E-mail enviado com sucesso!
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Será enviado um link de redefinição de senha para{" "}
              <span className="font-semibold text-[#0F172A]">{user.email}</span>.
              O link ficará válido por <strong>24 horas</strong>.
            </p>

            {orgs.length > 0 && (
              <div className="pt-1">
                <FilialPicker orgs={orgs} selected={selectedOrgIds} onChange={setSelectedOrgIds} />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-xs text-red-600 font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 hover:bg-slate-100">Cancelar</button>
              <button
                type="button"
                onClick={handleSend}
                disabled={isPending}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                Enviar e-mail
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Users Tab ───────────────────────────────────────────────────────────

export function UsersTab({ initialUsers, currentUserId, orgs = [] }: { initialUsers: User[]; currentUserId: string; orgs?: OrgRow[] }) {
  const [users,      setUsers]     = useState<User[]>(initialUsers)
  const [search,     setSearch]    = useState("")
  const [roleFilter, setRoleFilter] = useState<string>("ALL")
  const [panel,      setPanel]     = useState<"none" | "create" | "edit" | "invite">("none")
  const [editUser,   setEditUser]  = useState<User | null>(null)
  const [passwordUser,  setPasswordUser]  = useState<User | null>(null)
  const [sendResetUser, setSendResetUser] = useState<User | null>(null)
  const [deleteTarget,  setDeleteTarget]  = useState<User | null>(null)
  const [deleteError,  setDeleteError]  = useState<string | null>(null)
  const [isPending,  start]        = useTransition()

  // Derived stats
  const total    = users.length
  const active   = users.filter((u) => u.active).length
  const inactive = total - active

  // Filter
  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.department ?? "").toLowerCase().includes(q)
    const matchRole   = roleFilter === "ALL" || u.role === roleFilter
    return matchSearch && matchRole
  })

  function openEdit(u: User) { setEditUser(u); setPanel("edit") }
  function closePanel() { setPanel("none"); setEditUser(null) }

  function handleSaved(updated: User) {
    setUsers((prev) => {
      const exists = prev.find((u) => u.id === updated.id)
      return exists ? prev.map((u) => u.id === updated.id ? updated : u) : [updated, ...prev]
    })
    closePanel()
  }

  async function handleToggle(user: User) {
    start(async () => {
      try {
        await toggleUserActive(user.id, !user.active)
        setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, active: !u.active } : u))
      } catch { /* ignore */ }
    })
  }

  async function handleDelete(user: User) {
    setDeleteError(null)
    start(async () => {
      const result = await deleteUser(user.id)
      if ("error" in result) {
        setDeleteError(result.error)
        return
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
      setDeleteTarget(null)
    })
  }

  async function handleDeactivateInstead(user: User) {
    setDeleteError(null)
    start(async () => {
      try {
        await toggleUserActive(user.id, false)
        setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, active: false } : u))
        setDeleteTarget(null)
      } catch (err: unknown) {
        setDeleteError(err instanceof Error ? err.message : "Erro ao desativar usuário.")
      }
    })
  }

  return (
    <div className="flex gap-4 h-full min-h-0">

      {/* ── Main panel ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total de usuários", value: total,    icon: Users,     color: "#2463FF",  bg: "#EFF6FF"  },
            { label: "Usuários ativos",   value: active,   icon: UserCheck, color: "#059669",  bg: "#ECFDF5"  },
            { label: "Usuários inativos", value: inactive, icon: UserX,     color: "#DC2626",  bg: "#FEF2F2"  },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl p-4 flex items-center gap-3" style={{ border: "1px solid rgba(0,0,0,0.06)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                <Icon className="w-4.5 h-4.5" style={{ color, width: 18, height: 18 }} />
              </div>
              <div>
                <p className="text-xl font-black leading-none" style={{ color }}>{value}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3" style={{ border: "1px solid rgba(0,0,0,0.06)" }}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, e-mail ou departamento..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"
            />
          </div>
          <div className="relative">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="pl-3 pr-8 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 outline-none cursor-pointer appearance-none focus:ring-2 focus:ring-violet-200"
            >
              <option value="ALL">Todos os cargos</option>
              {ALL_ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          <button
            onClick={() => setPanel("invite")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-90 shrink-0"
            style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}
          >
            <Mail className="w-3.5 h-3.5" />
            Convidar
          </button>
          <button
            onClick={() => { setEditUser(null); setPanel("create") }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shrink-0"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Usuário
          </button>
        </div>

        {/* User list */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-300">
              <Users className="w-8 h-8" />
              <p className="text-sm font-semibold text-slate-400">Nenhum usuário encontrado</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filtered.map((user) => {
                const roleCfg = ROLE_CFG[user.role] ?? ROLE_CFG.CLIENT
                const isSelf  = user.id === currentUserId
                return (
                  <div
                    key={user.id}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/60 transition-colors group"
                    style={{ opacity: user.active ? 1 : 0.55 }}
                  >
                    {/* Avatar */}
                    <UserAvatar name={user.name} imageUrl={user.image} size={40} />

                    {/* Name + email */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-[#0F172A] truncate">{user.name}</p>
                        {isSelf && <span className="text-[9px] font-black text-violet-500 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-md uppercase tracking-wide">Você</span>}
                      </div>
                      <p className="text-xs text-slate-400 truncate">{user.email}</p>
                    </div>

                    {/* Role */}
                    <div className="shrink-0 min-w-[120px] hidden sm:block">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border" style={{ background: roleCfg.bg, color: roleCfg.text, borderColor: roleCfg.border }}>
                        {ROLE_LABELS[user.role as UserRole] ?? user.role}
                      </span>
                      {user.department && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{user.department}</p>}
                    </div>

                    {/* Status */}
                    <div className="shrink-0 hidden md:block">
                      <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: user.active ? "#059669" : "#DC2626" }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: user.active ? "#22C55E" : "#EF4444" }} />
                        {user.active ? "Ativo" : "Inativo"}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(user)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors" title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setPasswordUser(user)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Redefinir senha">
                        <Key className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setSendResetUser(user)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Enviar e-mail de senha">
                        <Mail className="w-3.5 h-3.5" />
                      </button>
                      {!isSelf && (
                        <button onClick={() => handleToggle(user)} disabled={isPending} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title={user.active ? "Desativar" : "Ativar"}>
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!isSelf && (
                        <button onClick={() => setDeleteTarget(user)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Side panel (create / edit / invite) ─────────────────────────── */}
      {panel !== "none" && (
        <div
          className="w-80 shrink-0 bg-white rounded-2xl overflow-hidden flex flex-col sticky top-4"
          style={{
            border: "1px solid rgba(0,0,0,0.06)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            maxHeight: "calc(100vh - 120px)",
          }}
        >
          {panel === "invite" ? (
            <InviteForm orgs={orgs} onClose={closePanel} />
          ) : (
            <UserForm
              mode={panel}
              initial={editUser ?? undefined}
              currentUserId={currentUserId}
              orgs={orgs}
              onSave={handleSaved}
              onCancel={closePanel}
            />
          )}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {passwordUser && (
        <PasswordModal userId={passwordUser.id} userName={passwordUser.name} onClose={() => setPasswordUser(null)} />
      )}
      {sendResetUser && (
        <SendResetEmailModal user={sendResetUser} orgs={orgs} onClose={() => setSendResetUser(null)} />
      )}
      {deleteTarget && (
        <DeleteModal
          user={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onClose={() => { setDeleteTarget(null); setDeleteError(null) }}
          onDeactivate={() => handleDeactivateInstead(deleteTarget)}
          isPending={isPending}
          error={deleteError}
        />
      )}
    </div>
  )
}
