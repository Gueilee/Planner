"use client"

import { useState, useRef, useTransition } from "react"
import { useSession } from "next-auth/react"
import {
  Camera, Save, Key, Eye, EyeOff, Check,
  AlertCircle, Loader2, User, ChevronDown,
} from "lucide-react"
import { updateProfile, updateUserById, changePassword, resetUserPassword } from "@/lib/actions/profile"
import type { UserProfile } from "./settings-client"
import { ROLE_LABELS } from "@/lib/permissions"
import { UserRole } from "@/lib/generated/prisma/enums"

// ─── Avatar → base64 (resized, no external storage needed) ──────────────────

function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      // Máx 80×80 px para o base64 caber no JWT sem estourar o cookie de sessão
      const MAX = 80
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
      const w = Math.max(1, Math.round(img.width  * ratio))
      const h = Math.max(1, Math.round(img.height * ratio))
      const canvas = document.createElement("canvas")
      canvas.width  = w
      canvas.height = h
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("Canvas não suportado")); return }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(objectUrl)
      resolve(canvas.toDataURL("image/jpeg", 0.78))
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Falha ao ler imagem")) }
    img.src = objectUrl
  })
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

// ─── Avatar Upload Widget ────────────────────────────────────────────────────

function AvatarUpload({
  name, imageUrl, uploading, onUpload,
}: {
  name: string
  imageUrl: string | null
  uploading: boolean
  onUpload: (file: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  function handleFile(f: File) {
    if (!f.type.startsWith("image/")) return
    onUpload(f)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        className="relative group"
        title="Clique ou arraste uma foto"
      >
        {/* Avatar */}
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden text-2xl font-black text-white transition-all"
          style={{
            background: imageUrl
              ? "transparent"
              : "linear-gradient(135deg, #7B2FBE, #2463FF)",
            outline: drag ? "3px dashed #7B2FBE" : "none",
            outlineOffset: "4px",
            boxShadow: "0 4px 24px rgba(123,47,190,0.25)",
          }}
        >
          {imageUrl ? (
            <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span>{initials(name)}</span>
          )}
        </div>

        {/* Overlay */}
        <div
          className="absolute inset-0 rounded-full flex items-center justify-center transition-all"
          style={{ background: "rgba(0,0,0,0)", opacity: 0 }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(0,0,0,0.45)"
            e.currentTarget.style.opacity = "1"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(0,0,0,0)"
            e.currentTarget.style.opacity = "0"
          }}
        >
          {uploading
            ? <Loader2 className="w-6 h-6 text-white animate-spin" />
            : <Camera className="w-6 h-6 text-white" />}
        </div>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />

      <p className="text-[10px] text-slate-400 text-center leading-tight">
        Clique ou arraste uma foto<br />
        <span className="text-slate-300">JPG, PNG, WEBP — máx. 10 MB</span>
      </p>
    </div>
  )
}

// ─── Password Section ────────────────────────────────────────────────────────

function PasswordSection({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [open, setOpen]         = useState(false)
  const [current, setCurrent]   = useState("")
  const [next, setNext]         = useState("")
  const [confirm, setConfirm]   = useState("")
  const [show, setShow]         = useState(false)
  const [isPending, start]      = useTransition()
  const [result, setResult]     = useState<{ ok: boolean; msg: string } | null>(null)

  function handleSubmit() {
    if (next !== confirm) { setResult({ ok: false, msg: "As senhas não coincidem" }); return }
    if (next.length < 6)  { setResult({ ok: false, msg: "Mínimo de 6 caracteres" }); return }
    start(async () => {
      try {
        if (isAdmin) {
          await resetUserPassword(userId, next)
        } else {
          await changePassword(current, next)
        }
        setResult({ ok: true, msg: "Senha alterada com sucesso!" })
        setCurrent(""); setNext(""); setConfirm("")
        setTimeout(() => { setOpen(false); setResult(null) }, 2000)
      } catch (e: unknown) {
        setResult({ ok: false, msg: e instanceof Error ? e.message : "Erro ao alterar senha" })
      }
    })
  }

  const iCls = "w-full px-3 py-2.5 text-sm rounded-xl border bg-[#F7F6F2] outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(0,0,0,0.06)" }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
            <Key className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-[#0F172A]">
              {isAdmin ? "Redefinir Senha" : "Alterar Senha"}
            </p>
            <p className="text-[11px] text-slate-400">
              {isAdmin ? "Redefina a senha deste usuário" : "Atualize sua senha de acesso"}
            </p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 pt-2 bg-white space-y-3" style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
          {!isAdmin && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Senha Atual</label>
              <div className="relative">
                <input type={show ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} className={iCls} placeholder="••••••••" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Nova Senha</label>
              <input type={show ? "text" : "password"} value={next} onChange={(e) => setNext(e.target.value)} className={iCls} placeholder="Mín. 6 caracteres" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Confirmar</label>
              <input type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={iCls} placeholder="Repita a senha" />
            </div>
          </div>

          {result && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              {result.ok ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {result.msg}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !next || !confirm || (!isAdmin && !current)}
            className="w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #D97706, #F59E0B)" }}
          >
            {isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />Salvando...</> : "Salvar Nova Senha"}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Profile Tab ────────────────────────────────────────────────────────

type Props = {
  profile:  UserProfile
  allUsers: UserProfile[]
  isAdmin:  boolean
}

export function ProfileTab({ profile, allUsers, isAdmin }: Props) {
  const { update: updateSession } = useSession()

  // Which user is being edited (admin can switch)
  const [editingUser, setEditingUser] = useState<UserProfile>(profile)

  // Form state
  const [name,       setName]       = useState(editingUser.name)
  const [department, setDepartment] = useState(editingUser.department ?? "")
  const [phone,      setPhone]      = useState(editingUser.phone      ?? "")
  const [imageUrl,   setImageUrl]   = useState<string | null>(editingUser.image)
  const [uploading,  setUploading]  = useState(false)

  const [isPending, start] = useTransition()
  const [saved,     setSaved]    = useState(false)
  const [error,     setError]    = useState<string | null>(null)

  const isOwnProfile = editingUser.id === profile.id

  // When admin switches user to edit
  function switchUser(userId: string) {
    const u = allUsers.find((x) => x.id === userId) ?? profile
    setEditingUser(u)
    setName(u.name)
    setDepartment(u.department ?? "")
    setPhone(u.phone      ?? "")
    setImageUrl(u.image)
    setSaved(false)
    setError(null)
  }

  async function handleAvatarUpload(file: File) {
    setUploading(true)
    setError(null)
    try {
      const dataUrl = await imageToBase64(file)
      setImageUrl(dataUrl)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao processar imagem")
    } finally {
      setUploading(false)
    }
  }

  function handleSave() {
    if (!name.trim()) { setError("Nome é obrigatório"); return }
    setError(null)
    start(async () => {
      try {
        const data = { name, department, phone, image: imageUrl }
        if (isOwnProfile) {
          await updateProfile(data)
          // Refresh NextAuth session so sidebar/header update immediately
          await updateSession()
        } else {
          await updateUserById(editingUser.id, data)
        }
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao salvar")
      }
    })
  }

  const iCls = "w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-[#F7F6F2] outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all placeholder:text-slate-300"

  return (
    <div className="space-y-4">

      {/* Admin user selector */}
      {isAdmin && allUsers.length > 0 && (
        <div
          className="bg-white rounded-2xl p-4 flex items-center gap-4"
          style={{ border: "1px solid rgba(239,68,68,0.15)", background: "rgba(239,68,68,0.02)" }}
        >
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(239,68,68,0.08)" }}>
            <User className="w-4 h-4 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Modo Administrador</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Editando o perfil de outro usuário</p>
          </div>
          <select
            value={editingUser.id}
            onChange={(e) => switchUser(e.target.value)}
            className="text-sm rounded-xl border border-red-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-red-100 cursor-pointer"
          >
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} {u.id === profile.id ? "(você)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Profile card */}
      <div className="bg-white rounded-2xl p-6" style={{ border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>

        {/* Avatar + basic info */}
        <div className="flex items-start gap-6 mb-6 pb-6" style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
          <AvatarUpload
            name={name || editingUser.name}
            imageUrl={imageUrl}
            uploading={uploading}
            onUpload={handleAvatarUpload}
          />
          <div className="flex-1 min-w-0">
            <p className="text-xl font-black text-[#0F172A] truncate">{name || editingUser.name}</p>
            <p className="text-sm text-slate-500 mt-0.5">{editingUser.email}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span
                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: "rgba(123,47,190,0.08)", color: "#7B2FBE", border: "1px solid rgba(123,47,190,0.15)" }}
              >
                {ROLE_LABELS[editingUser.role as UserRole] ?? editingUser.role}
              </span>
              {department && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">
                  {department}
                </span>
              )}
              <span
                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                style={editingUser.active
                  ? { background: "rgba(16,185,129,0.08)", color: "#059669", border: "1px solid rgba(16,185,129,0.15)" }
                  : { background: "rgba(239,68,68,0.08)", color: "#DC2626", border: "1px solid rgba(239,68,68,0.15)" }}
              >
                {editingUser.active ? "Ativo" : "Inativo"}
              </span>
            </div>
          </div>
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Nome Completo <span className="text-red-400">*</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={iCls} placeholder="Seu nome completo" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Departamento / Área</label>
              <input value={department} onChange={(e) => setDepartment(e.target.value)} className={iCls} placeholder="Ex: TI, Operações, Comercial…" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Telefone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={iCls} placeholder="(00) 00000-0000" />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">E-mail</label>
              <input value={editingUser.email} disabled className={`${iCls} opacity-50 cursor-not-allowed`} />
              <p className="text-[10px] text-slate-300 mt-1">O e-mail não pode ser alterado por esta tela.</p>
            </div>
          </div>

          {/* Feedback */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Save button */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || uploading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}
            >
              {isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                : saved
                  ? <><Check className="w-4 h-4" /> Salvo!</>
                  : <><Save className="w-4 h-4" /> Salvar Alterações</>}
            </button>
            {saved && (
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Perfil atualizado com sucesso
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Password section */}
      <PasswordSection userId={editingUser.id} isAdmin={!isOwnProfile && isAdmin} />

    </div>
  )
}
