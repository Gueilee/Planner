"use client"

// Painel único de um usuário — nome/e-mail/departamento/telefone/papel,
// filial(is), qual Perfil de Acesso ele tem (com o que aquele perfil libera,
// tela por tela) e segurança (resetar senha), tudo num lugar só. Antes
// isso ficava espalhado em 3 telas diferentes (organizations-client.tsx,
// settings/users-tab.tsx, global-users-view.tsx) — este modal substitui
// os formulários inline que existiam em cada uma delas.

import { useEffect, useRef, useState, useTransition } from "react"
import { X, Camera, KeyRound, Check, AlertCircle, Eye, ShieldCheck, UserX, UserCheck, Building2 } from "lucide-react"
import { updateUserById, resetUserPassword, toggleUserActive } from "@/lib/actions/profile"
import { listAccessProfilesForOrg, type ProfileRow } from "@/lib/actions/access-profiles"
import { getUserOrgAccess, setUserOrgAccess } from "@/lib/actions/user-org-access"
import { SCREEN_GROUPS } from "@/lib/constants/features"
import { FilialPicker } from "@/components/kronex/filial-picker"
import { imageToBase64 } from "@/lib/utils/image-to-base64"
import type { OrgRow } from "@/lib/actions/organizations"

export type ManagedUser = {
  id: string
  name: string
  email: string
  role: string
  department: string | null
  phone: string | null
  image: string | null
  active: boolean
  profileId: string | null
  accessProfile: { id: string; name: string; color: string } | null
  organizationId: string
  organizationName: string
}

const ROLES = ["ADMIN", "PROJECT_MANAGER", "PROJECT_MEMBER", "DIRECTOR", "SPONSOR", "CLIENT"]
const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin", PROJECT_MANAGER: "Gerente de Projeto", PROJECT_MEMBER: "Membro",
  DIRECTOR: "Diretor", SPONSOR: "Sponsor", CLIENT: "Cliente",
}
const ALL_SCREENS = SCREEN_GROUPS.flatMap((g) => g.screens)

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
const labelCls = "text-xs font-medium text-gray-600 block mb-1"

export function UserDetailModal({
  user, orgs, isGlobalAdmin, onClose, onSaved,
}: {
  user: ManagedUser
  orgs: OrgRow[]
  isGlobalAdmin: boolean
  onClose: () => void
  onSaved: (updated: ManagedUser) => void
}) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [department, setDepartment] = useState(user.department ?? "")
  const [phone, setPhone] = useState(user.phone ?? "")
  const [role, setRole] = useState(user.role)
  const [orgId, setOrgId] = useState(user.organizationId)
  const [profileId, setProfileId] = useState(user.profileId ?? "")
  const [image, setImage] = useState(user.image)

  const [profiles, setProfiles] = useState<ProfileRow[] | null>(null)
  const [extraOrgIds, setExtraOrgIds] = useState<string[] | null>(null)
  const [active, setActive] = useState(user.active)

  const [resetPwdValue, setResetPwdValue] = useState("")
  const [resetPwdDone, setResetPwdDone] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [isPending, startTransition] = useTransition()
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Perfis de Acesso são por filial — recarrega sempre que a filial
  // escolhida no formulário mudar (só um admin global muda isso).
  useEffect(() => {
    setProfiles(null)
    listAccessProfilesForOrg(orgId)
      .then(setProfiles)
      .catch(() => setProfiles([]))
  }, [orgId])

  useEffect(() => {
    if (!isGlobalAdmin) return
    getUserOrgAccess(user.id).then(setExtraOrgIds).catch(() => setExtraOrgIds([]))
  }, [user.id, isGlobalAdmin])

  // Perfil escolhido pode não pertencer mais à filial atual (trocou de
  // filial) — some da seleção em vez de mandar um profileId inválido.
  useEffect(() => {
    if (profiles && profileId && !profiles.some((p) => p.id === profileId)) setProfileId("")
  }, [profiles, profileId])

  function handleSave() {
    if (!name.trim() || !email.trim()) { setError("Nome e e-mail são obrigatórios"); return }
    setError(null)
    startTransition(async () => {
      const res = await updateUserById(user.id, {
        name, email, department, phone, image,
        role,
        profileId: profileId || null,
        ...(isGlobalAdmin && orgId !== user.organizationId ? { organizationId: orgId } : {}),
      })
      if (!res.success) { setError(res.error); return }

      if (isGlobalAdmin && extraOrgIds !== null) {
        await setUserOrgAccess(user.id, extraOrgIds)
      }

      onSaved({
        id: res.user.id, name: res.user.name, email: res.user.email, role: res.user.role,
        department: res.user.department, phone: res.user.phone, image: res.user.image, active,
        profileId: res.user.profileId, accessProfile: res.user.accessProfile,
        organizationId: res.user.organizationId, organizationName: res.user.organization.name,
      })
    })
  }

  function handleResetPassword() {
    if (resetPwdValue.length < 6) return
    startTransition(async () => {
      try {
        await resetUserPassword(user.id, resetPwdValue)
        setResetPwdDone(true)
        setResetPwdValue("")
        setTimeout(() => setResetPwdDone(false), 2500)
      } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erro ao redefinir senha") }
    })
  }

  function handleToggleActive() {
    startTransition(async () => {
      try {
        await toggleUserActive(user.id, !active)
        setActive((v) => !v)
      } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erro") }
    })
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUploadingAvatar(true)
    try {
      const base64 = await imageToBase64(file)
      setImage(base64)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao ler imagem")
    } finally {
      setUploadingAvatar(false)
    }
  }

  const grantedScreens = ALL_SCREENS.filter((s) => {
    const p = profiles?.find((p) => p.id === profileId)
    return p?.permissions[s.key]?.canView
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-full overflow-y-auto rounded-2xl bg-white shadow-xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} />
          <button onClick={() => avatarInputRef.current?.click()} title="Alterar foto" className="relative group w-11 h-11 rounded-full flex-shrink-0 overflow-hidden">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-600 text-sm font-semibold"
                style={{ background: "linear-gradient(135deg, #7B2FBE22, #2463FF22)" }}>
                {name.charAt(0).toUpperCase() || "?"}
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
              {uploadingAvatar ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={14} className="text-white" />}
            </div>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black text-slate-800 truncate">Gerenciar usuário</h2>
            <p className="text-xs text-slate-400 truncate">{user.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {/* Perfil */}
          <section className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Perfil</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Nome *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>E-mail *</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Departamento</label>
                <input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Telefone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Papel</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* Acesso a filiais */}
          <section className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Building2 className="w-3 h-3" /> Acesso a filiais
            </h3>
            {isGlobalAdmin ? (
              <>
                <div>
                  <label className={labelCls}>Filial principal</label>
                  <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={inputCls}>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Filiais extras (além da principal)</label>
                  {extraOrgIds === null ? (
                    <p className="text-xs text-slate-400">Carregando...</p>
                  ) : (
                    <FilialPicker orgs={orgs.filter((o) => o.id !== orgId)} selected={extraOrgIds} onChange={setExtraOrgIds} />
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                {user.organizationName} — só um admin global pode mudar a filial ou dar acesso a outras.
              </p>
            )}
          </section>

          {/* Permissões */}
          <section className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3" /> Permissões
            </h3>
            <div>
              <label className={labelCls}>Perfil de acesso</label>
              <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={inputCls} disabled={!profiles}>
                <option value="">— Nenhum (sem telas liberadas) —</option>
                {profiles?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {profileId && (
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-500 mb-1.5 flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Este perfil libera visualizar:
                </p>
                {grantedScreens.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhuma tela</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {grantedScreens.map((s) => (
                      <span key={s.key} className="text-[10px] bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{s.label}</span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-slate-400 mt-2">Para mudar o que este perfil libera, use Configurações → Perfis de Acesso.</p>
              </div>
            )}
          </section>

          {/* Segurança */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <KeyRound className="w-3 h-3" /> Segurança
            </h3>
            <div className="flex items-center gap-2">
              <input value={resetPwdValue} onChange={(e) => setResetPwdValue(e.target.value)}
                placeholder="Nova senha (mín. 6 caracteres)" type="text" className={inputCls} />
              <button onClick={handleResetPassword} disabled={isPending || resetPwdValue.length < 6}
                className="shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs px-3 py-2 rounded-lg transition-colors">
                {resetPwdDone ? <Check size={13} /> : <KeyRound size={13} />} Redefinir
              </button>
            </div>
          </section>

          {/* Zona de risco */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-red-400">Zona de risco</h3>
            <button onClick={handleToggleActive} disabled={isPending}
              className={`w-full flex items-center justify-center gap-2 text-sm font-semibold px-3 py-2.5 rounded-lg border transition-colors ${active ? "text-red-600 border-red-200 hover:bg-red-50" : "text-green-600 border-green-200 hover:bg-green-50"}`}>
              {active ? <UserX size={15} /> : <UserCheck size={15} />}
              {active ? "Desativar usuário" : "Ativar usuário"}
            </button>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-3.5 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={isPending}
            className="px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 transition-colors">
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
