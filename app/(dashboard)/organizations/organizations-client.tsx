"use client"

import { useState, useTransition, useRef } from "react"
import { ChevronDown, ChevronRight, Pencil, KeyRound, UserX, UserCheck, X, Check, Camera } from "lucide-react"
import {
  createOrganization,
  updateOrganization,
  toggleOrganizationActive,
  createUserInOrganization,
  getUsersByOrg,
  updateUserInOrg,
  updateUserAvatarInOrg,
  resetUserPassword,
  toggleUserActiveInOrg,
  type OrgRow,
  type OrgUserRow,
} from "@/lib/actions/organizations"

function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
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
      URL.revokeObjectURL(objectUrl)
      resolve(canvas.toDataURL("image/jpeg", 0.78))
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Falha ao ler imagem")) }
    img.src = objectUrl
  })
}

const ROLES = ["ADMIN", "PROJECT_MANAGER", "PROJECT_MEMBER", "DIRECTOR", "SPONSOR", "CLIENT"]

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin", PROJECT_MANAGER: "GP", PROJECT_MEMBER: "Membro",
  DIRECTOR: "Diretor", SPONSOR: "Sponsor", CLIENT: "Cliente",
}

type Props = { initialOrgs: OrgRow[]; currentOrgId: string }

export function OrganizationsClient({ initialOrgs, currentOrgId }: Props) {
  const [orgs, setOrgs] = useState(initialOrgs)
  const [orgUsers, setOrgUsers] = useState<Record<string, OrgUserRow[]>>({})
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set())
  const [loadingOrgId, setLoadingOrgId] = useState<string | null>(null)

  // Org form state
  const [showNewOrg, setShowNewOrg] = useState(false)
  const [newOrgName, setNewOrgName] = useState("")
  const [newOrgSlug, setNewOrgSlug] = useState("")
  const [editOrgId, setEditOrgId] = useState<string | null>(null)
  const [editOrgName, setEditOrgName] = useState("")

  // New user form state
  const [newUserOrgId, setNewUserOrgId] = useState<string | null>(null)
  const [newUserName, setNewUserName] = useState("")
  const [newUserEmail, setNewUserEmail] = useState("")
  const [newUserPassword, setNewUserPassword] = useState("")
  const [newUserRole, setNewUserRole] = useState("PROJECT_MEMBER")
  const [newUserDept, setNewUserDept] = useState("")

  // Edit user state
  const [editUserId, setEditUserId] = useState<string | null>(null)
  const [editUserName, setEditUserName] = useState("")
  const [editUserEmail, setEditUserEmail] = useState("")
  const [editUserRole, setEditUserRole] = useState("")
  const [editUserDept, setEditUserDept] = useState("")
  const [editUserPhone, setEditUserPhone] = useState("")

  // Reset password state
  const [resetPwdUserId, setResetPwdUserId] = useState<string | null>(null)
  const [resetPwdValue, setResetPwdValue] = useState("")

  // Avatar upload state
  const [uploadingAvatarUserId, setUploadingAvatarUserId] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const avatarTargetRef = useRef<{ userId: string; orgId: string } | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess(null) } else { setSuccess(msg); setError(null) }
    setTimeout(() => { setError(null); setSuccess(null) }, 4000)
  }

  async function handleToggleExpand(orgId: string) {
    if (expandedOrgs.has(orgId)) {
      setExpandedOrgs((prev) => { const s = new Set(prev); s.delete(orgId); return s })
      return
    }
    setLoadingOrgId(orgId)
    try {
      const users = await getUsersByOrg(orgId)
      setOrgUsers((prev) => ({ ...prev, [orgId]: users }))
      setExpandedOrgs((prev) => new Set([...prev, orgId]))
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Erro ao carregar usuários", true)
    } finally {
      setLoadingOrgId(null)
    }
  }

  function handleCreateOrg() {
    if (!newOrgName.trim()) return
    startTransition(async () => {
      try {
        const org = await createOrganization({ name: newOrgName, slug: newOrgSlug || newOrgName.toLowerCase().replace(/\s+/g, "-") })
        setOrgs((prev) => [...prev, org])
        setNewOrgName(""); setNewOrgSlug(""); setShowNewOrg(false)
        flash("Organização criada com sucesso")
      } catch (e: unknown) { flash(e instanceof Error ? e.message : "Erro", true) }
    })
  }

  function handleUpdateOrg(id: string) {
    if (!editOrgName.trim()) return
    startTransition(async () => {
      try {
        await updateOrganization(id, { name: editOrgName })
        setOrgs((prev) => prev.map((o) => o.id === id ? { ...o, name: editOrgName } : o))
        setEditOrgId(null)
        flash("Organização atualizada")
      } catch (e: unknown) { flash(e instanceof Error ? e.message : "Erro", true) }
    })
  }

  function handleToggleOrgActive(id: string) {
    startTransition(async () => {
      try {
        const { active } = await toggleOrganizationActive(id)
        setOrgs((prev) => prev.map((o) => o.id === id ? { ...o, active } : o))
      } catch (e: unknown) { flash(e instanceof Error ? e.message : "Erro", true) }
    })
  }

  function handleCreateUser(orgId: string) {
    if (!newUserName.trim() || !newUserEmail.trim() || newUserPassword.length < 6) return
    startTransition(async () => {
      try {
        await createUserInOrganization({
          organizationId: orgId, name: newUserName, email: newUserEmail,
          password: newUserPassword, role: newUserRole, department: newUserDept || null,
        })
        setOrgs((prev) => prev.map((o) => o.id === orgId ? { ...o, _count: { ...o._count, users: o._count.users + 1 } } : o))
        // Refresh user list if expanded
        if (expandedOrgs.has(orgId)) {
          const users = await getUsersByOrg(orgId)
          setOrgUsers((prev) => ({ ...prev, [orgId]: users }))
        }
        setNewUserName(""); setNewUserEmail(""); setNewUserPassword("")
        setNewUserRole("PROJECT_MEMBER"); setNewUserDept(""); setNewUserOrgId(null)
        flash("Usuário criado com sucesso")
      } catch (e: unknown) { flash(e instanceof Error ? e.message : "Erro", true) }
    })
  }

  function startEditUser(user: OrgUserRow) {
    setEditUserId(user.id)
    setEditUserName(user.name)
    setEditUserEmail(user.email)
    setEditUserRole(user.role)
    setEditUserDept(user.department ?? "")
    setEditUserPhone(user.phone ?? "")
    setResetPwdUserId(null)
  }

  function handleUpdateUser(orgId: string) {
    if (!editUserId || !editUserName.trim() || !editUserEmail.trim()) return
    startTransition(async () => {
      try {
        await updateUserInOrg(editUserId, {
          name: editUserName, email: editUserEmail,
          role: editUserRole, department: editUserDept || null, phone: editUserPhone || null,
        })
        setOrgUsers((prev) => ({
          ...prev,
          [orgId]: (prev[orgId] ?? []).map((u) =>
            u.id === editUserId
              ? { ...u, name: editUserName, email: editUserEmail, role: editUserRole, department: editUserDept || null }
              : u
          ),
        }))
        setEditUserId(null)
        flash("Usuário atualizado")
      } catch (e: unknown) { flash(e instanceof Error ? e.message : "Erro", true) }
    })
  }

  function handleResetPassword() {
    if (!resetPwdUserId || resetPwdValue.length < 6) return
    startTransition(async () => {
      try {
        await resetUserPassword(resetPwdUserId, resetPwdValue)
        setResetPwdUserId(null); setResetPwdValue("")
        flash("Senha redefinida com sucesso")
      } catch (e: unknown) { flash(e instanceof Error ? e.message : "Erro", true) }
    })
  }

  async function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !avatarTargetRef.current) return
    const { userId, orgId } = avatarTargetRef.current
    setUploadingAvatarUserId(userId)
    try {
      const base64 = await imageToBase64(file)
      await updateUserAvatarInOrg(userId, base64)
      setOrgUsers((prev) => ({
        ...prev,
        [orgId]: (prev[orgId] ?? []).map((u) => u.id === userId ? { ...u, image: base64 } : u),
      }))
      flash("Foto atualizada")
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Erro ao enviar foto", true)
    } finally {
      setUploadingAvatarUserId(null)
      avatarTargetRef.current = null
    }
  }

  function triggerAvatarUpload(userId: string, orgId: string) {
    avatarTargetRef.current = { userId, orgId }
    avatarInputRef.current?.click()
  }

  function handleToggleUserActive(userId: string, orgId: string) {
    startTransition(async () => {
      try {
        const { active } = await toggleUserActiveInOrg(userId)
        setOrgUsers((prev) => ({
          ...prev,
          [orgId]: (prev[orgId] ?? []).map((u) => u.id === userId ? { ...u, active } : u),
        }))
      } catch (e: unknown) { flash(e instanceof Error ? e.message : "Erro", true) }
    })
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Hidden file input for avatar upload */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleAvatarFileChange}
      />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Organizações</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie filiais, usuários e acessos</p>
        </div>
        <button onClick={() => setShowNewOrg(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          Nova organização
        </button>
      </div>

      {error   && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{success}</div>}

      {/* New org form */}
      {showNewOrg && (
        <div className="border border-gray-200 rounded-xl p-5 bg-white space-y-4">
          <h2 className="font-medium text-gray-800">Nova organização</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Nome *</label>
              <input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Ex: Vendemmia Filial SP" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Slug</label>
              <input value={newOrgSlug} onChange={(e) => setNewOrgSlug(e.target.value)}
                placeholder="filial-sp (auto-gerado se vazio)" className={inputCls} />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleCreateOrg} disabled={isPending || !newOrgName.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              {isPending ? "Criando..." : "Criar"}
            </button>
            <button onClick={() => { setShowNewOrg(false); setNewOrgName(""); setNewOrgSlug("") }}
              className="text-gray-600 text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Org list */}
      <div className="space-y-4">
        {orgs.map((org) => {
          const isExpanded = expandedOrgs.has(org.id)
          const users = orgUsers[org.id] ?? []
          const isLoadingUsers = loadingOrgId === org.id

          return (
            <div key={org.id} className={`border rounded-xl bg-white overflow-hidden ${!org.active ? "opacity-60" : ""}`}>

              {/* Org header row */}
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  {/* Expand toggle */}
                  <button onClick={() => handleToggleExpand(org.id)}
                    className="w-10 h-10 rounded-lg bg-blue-100 hover:bg-blue-200 flex items-center justify-center text-blue-700 font-semibold text-sm transition-colors flex-shrink-0"
                    title={isExpanded ? "Ocultar usuários" : "Ver usuários"}>
                    {isLoadingUsers
                      ? <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      : isExpanded
                        ? <ChevronDown size={16} />
                        : <ChevronRight size={16} />
                    }
                  </button>

                  <div>
                    {editOrgId === org.id ? (
                      <div className="flex items-center gap-2">
                        <input value={editOrgName} onChange={(e) => setEditOrgName(e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
                        <button onClick={() => handleUpdateOrg(org.id)} disabled={isPending}
                          className="text-blue-600 text-xs hover:underline">Salvar</button>
                        <button onClick={() => setEditOrgId(null)}
                          className="text-gray-400 text-xs hover:underline">Cancelar</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{org.name}</span>
                        {org.id === currentOrgId && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Sua organização</span>
                        )}
                        {!org.active && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inativa</span>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      slug: {org.slug} · {org._count.users} usuário{org._count.users !== 1 ? "s" : ""} · {org._count.projects} projeto{org._count.projects !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => setNewUserOrgId(newUserOrgId === org.id ? null : org.id)}
                    className="text-sm text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors">
                    + Usuário
                  </button>
                  {editOrgId !== org.id && (
                    <button onClick={() => { setEditOrgId(org.id); setEditOrgName(org.name) }}
                      className="text-sm text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                      Editar
                    </button>
                  )}
                  {org.id !== "org_vendemmia" && (
                    <button onClick={() => handleToggleOrgActive(org.id)} disabled={isPending}
                      className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${org.active ? "text-red-600 border-red-200 hover:bg-red-50" : "text-green-600 border-green-200 hover:bg-green-50"}`}>
                      {org.active ? "Desativar" : "Ativar"}
                    </button>
                  )}
                </div>
              </div>

              {/* Users list */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {users.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-gray-400 italic">Nenhum usuário nesta organização.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {users.map((user) => (
                        <div key={user.id} className="px-5 py-3">
                          {/* Edit user form */}
                          {editUserId === user.id ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs font-medium text-gray-600 block mb-1">Nome *</label>
                                  <input value={editUserName} onChange={(e) => setEditUserName(e.target.value)} className={inputCls} />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-gray-600 block mb-1">E-mail *</label>
                                  <input value={editUserEmail} onChange={(e) => setEditUserEmail(e.target.value)} type="email" className={inputCls} />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-gray-600 block mb-1">Perfil</label>
                                  <select value={editUserRole} onChange={(e) => setEditUserRole(e.target.value)} className={inputCls}>
                                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-gray-600 block mb-1">Área / Departamento</label>
                                  <input value={editUserDept} onChange={(e) => setEditUserDept(e.target.value)} placeholder="Ex: Logística" className={inputCls} />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => handleUpdateUser(org.id)} disabled={isPending || !editUserName.trim() || !editUserEmail.trim()}
                                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                                  <Check size={13} /> Salvar
                                </button>
                                <button onClick={() => setEditUserId(null)}
                                  className="flex items-center gap-1.5 text-gray-600 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                                  <X size={13} /> Cancelar
                                </button>
                              </div>
                            </div>
                          ) : resetPwdUserId === user.id ? (
                            /* Reset password form */
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2 flex-1">
                                <KeyRound size={14} className="text-amber-500 flex-shrink-0" />
                                <span className="text-sm text-gray-700 font-medium">{user.name}</span>
                                <span className="text-xs text-gray-400">— definir nova senha</span>
                              </div>
                              <input value={resetPwdValue} onChange={(e) => setResetPwdValue(e.target.value)}
                                placeholder="Nova senha (mín. 6 caracteres)" type="text"
                                className="border border-amber-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-64" />
                              <button onClick={handleResetPassword} disabled={isPending || resetPwdValue.length < 6}
                                className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                                <Check size={13} /> Salvar
                              </button>
                              <button onClick={() => { setResetPwdUserId(null); setResetPwdValue("") }}
                                className="text-gray-400 hover:text-gray-600">
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            /* Normal user row */
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => triggerAvatarUpload(user.id, org.id)}
                                  title="Alterar foto"
                                  className="relative group w-8 h-8 rounded-full flex-shrink-0 overflow-hidden"
                                >
                                  {user.image ? (
                                    <img src={user.image} alt={user.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-semibold"
                                      style={{ background: "linear-gradient(135deg, #7B2FBE22, #2463FF22)" }}>
                                      {user.name.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                                    {uploadingAvatarUserId === user.id
                                      ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      : <Camera size={11} className="text-white" />
                                    }
                                  </div>
                                </button>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-800">{user.name}</span>
                                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                      {ROLE_LABELS[user.role] ?? user.role}
                                    </span>
                                    {!user.active && (
                                      <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded">Inativo</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-400">
                                    {user.email}{user.department ? ` · ${user.department}` : ""}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => startEditUser(user)} title="Editar usuário"
                                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                                  <Pencil size={14} />
                                </button>
                                <button onClick={() => { setResetPwdUserId(user.id); setResetPwdValue(""); setEditUserId(null) }} title="Redefinir senha"
                                  className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors">
                                  <KeyRound size={14} />
                                </button>
                                <button onClick={() => handleToggleUserActive(user.id, org.id)} disabled={isPending} title={user.active ? "Desativar usuário" : "Ativar usuário"}
                                  className={`p-1.5 rounded-lg transition-colors ${user.active ? "hover:bg-red-50 text-gray-400 hover:text-red-500" : "hover:bg-green-50 text-gray-400 hover:text-green-600"}`}>
                                  {user.active ? <UserX size={14} /> : <UserCheck size={14} />}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Add user form */}
              {newUserOrgId === org.id && (
                <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-4">
                  <h3 className="text-sm font-medium text-gray-700">
                    Adicionar usuário em <span className="text-blue-600">{org.name}</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Nome *</label>
                      <input value={newUserName} onChange={(e) => setNewUserName(e.target.value)}
                        placeholder="Nome completo" className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">E-mail *</label>
                      <input value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="email@empresa.com" type="email" className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Senha inicial *</label>
                      <input value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres" type="text" className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Perfil</label>
                      <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)} className={inputCls}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Área / Departamento</label>
                      <input value={newUserDept} onChange={(e) => setNewUserDept(e.target.value)}
                        placeholder="Ex: Logística" className={inputCls} />
                    </div>
                  </div>
                  <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                    Anote a senha e envie para o usuário — ela não poderá ser recuperada depois.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => handleCreateUser(org.id)}
                      disabled={isPending || !newUserName.trim() || !newUserEmail.trim() || newUserPassword.length < 6}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                      {isPending ? "Criando..." : "Criar usuário"}
                    </button>
                    <button onClick={() => setNewUserOrgId(null)}
                      className="text-gray-600 text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
