"use client"

import { useState, useEffect, useTransition, useMemo } from "react"
import { Search, Pencil, KeyRound, UserX, UserCheck, Check, X, Building2 } from "lucide-react"
import {
  getAllUsersGlobal, updateUserInOrg, resetUserPassword, toggleUserActiveInOrg,
  type GlobalUserRow, type OrgRow,
} from "@/lib/actions/organizations"
import { getUserOrgAccess, setUserOrgAccess } from "@/lib/actions/user-org-access"
import { FilialPicker } from "@/components/kronex/filial-picker"

const ROLES = ["ADMIN", "PROJECT_MANAGER", "PROJECT_MEMBER", "DIRECTOR", "SPONSOR", "CLIENT"]
const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin", PROJECT_MANAGER: "GP", PROJECT_MEMBER: "Membro",
  DIRECTOR: "Diretor", SPONSOR: "Sponsor", CLIENT: "Cliente",
}

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

// Lista plana de TODOS os usuários, de todas as filiais — pedido da
// especialista de projetos: um lugar só pra ver quem já está cadastrado
// (não precisa entrar filial por filial) e conceder acesso a outras
// filiais além da própria (UserOrganizationAccess, via FilialPicker —
// mesmo componente já usado em Configurações → Usuários). Mover o usuário
// de filial de origem não está aqui — é uma operação mais invasiva
// (muda a quem o usuário "pertence") que não foi pedida; o que foi pedido
// é conceder VISÃO de outras filiais, que é o que esta tela faz.
export function GlobalUsersView({ orgs }: { orgs: OrgRow[] }) {
  const [users, setUsers] = useState<GlobalUserRow[] | null>(null)
  const [search, setSearch] = useState("")
  const [orgFilter, setOrgFilter] = useState<string>("ALL")

  const [editUserId, setEditUserId] = useState<string | null>(null)
  const [editUserName, setEditUserName] = useState("")
  const [editUserEmail, setEditUserEmail] = useState("")
  const [editUserRole, setEditUserRole] = useState("")
  const [editUserDept, setEditUserDept] = useState("")
  const [editUserPhone, setEditUserPhone] = useState("")

  const [resetPwdUserId, setResetPwdUserId] = useState<string | null>(null)
  const [resetPwdValue, setResetPwdValue] = useState("")

  const [accessUserId, setAccessUserId] = useState<string | null>(null)
  const [accessSelected, setAccessSelected] = useState<string[]>([])
  const [accessLoading, setAccessLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getAllUsersGlobal()
      .then(setUsers)
      .catch((e: unknown) => flash(e instanceof Error ? e.message : "Erro ao carregar usuários", true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess(null) } else { setSuccess(msg); setError(null) }
    setTimeout(() => { setError(null); setSuccess(null) }, 4000)
  }

  const filtered = useMemo(() => {
    if (!users) return []
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (orgFilter !== "ALL" && u.organizationId !== orgFilter) return false
      if (!q) return true
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    })
  }, [users, search, orgFilter])

  function startEditUser(user: GlobalUserRow) {
    setEditUserId(user.id)
    setEditUserName(user.name)
    setEditUserEmail(user.email)
    setEditUserRole(user.role)
    setEditUserDept(user.department ?? "")
    setEditUserPhone(user.phone ?? "")
    setResetPwdUserId(null)
  }

  function handleUpdateUser() {
    if (!editUserId || !editUserName.trim() || !editUserEmail.trim()) return
    startTransition(async () => {
      try {
        await updateUserInOrg(editUserId, {
          name: editUserName, email: editUserEmail,
          role: editUserRole, department: editUserDept || null, phone: editUserPhone || null,
        })
        setUsers((prev) => (prev ?? []).map((u) =>
          u.id === editUserId
            ? { ...u, name: editUserName, email: editUserEmail, role: editUserRole, department: editUserDept || null }
            : u
        ))
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

  function handleToggleActive(userId: string) {
    startTransition(async () => {
      try {
        const { active } = await toggleUserActiveInOrg(userId)
        setUsers((prev) => (prev ?? []).map((u) => u.id === userId ? { ...u, active } : u))
      } catch (e: unknown) { flash(e instanceof Error ? e.message : "Erro", true) }
    })
  }

  function openAccess(userId: string) {
    setAccessUserId(userId)
    setAccessLoading(true)
    getUserOrgAccess(userId)
      .then(setAccessSelected)
      .catch(() => setAccessSelected([]))
      .finally(() => setAccessLoading(false))
  }

  function handleSaveAccess() {
    if (!accessUserId) return
    startTransition(async () => {
      try {
        await setUserOrgAccess(accessUserId, accessSelected)
        setAccessUserId(null)
        flash("Acessos atualizados")
      } catch (e: unknown) { flash(e instanceof Error ? e.message : "Erro", true) }
    })
  }

  const accessUser = users?.find((u) => u.id === accessUserId) ?? null

  return (
    <div className="space-y-4">
      {error   && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{success}</div>}

      {/* Busca + filtro por filial */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} className={`${inputCls} w-56`}>
          <option value="ALL">Todas as filiais</option>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      {users === null ? (
        <p className="text-sm text-gray-400 px-1 py-6 text-center">Carregando usuários...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 px-1 py-6 text-center">Nenhum usuário encontrado.</p>
      ) : (
        <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
          <div className="divide-y divide-gray-50">
            {filtered.map((user) => (
              <div key={user.id} className="px-5 py-3">
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
                      <button onClick={handleUpdateUser} disabled={isPending || !editUserName.trim() || !editUserEmail.trim()}
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
                    <button onClick={() => { setResetPwdUserId(null); setResetPwdValue("") }} className="text-gray-400 hover:text-gray-600">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden">
                        {user.image ? (
                          <img src={user.image} alt={user.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-semibold"
                            style={{ background: "linear-gradient(135deg, #7B2FBE22, #2463FF22)" }}>
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800 truncate">{user.name}</span>
                          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                            {ROLE_LABELS[user.role] ?? user.role}
                          </span>
                          <span className="text-xs bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Building2 className="w-2.5 h-2.5" /> {user.organizationName}
                          </span>
                          {!user.active && (
                            <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded">Inativo</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate">
                          {user.email}{user.department ? ` · ${user.department}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => openAccess(user.id)} title="Gerenciar acesso a outras filiais"
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-50 transition-colors flex items-center gap-1.5">
                        <Building2 size={13} /> Acessos
                      </button>
                      <button onClick={() => startEditUser(user)} title="Editar usuário"
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => { setResetPwdUserId(user.id); setResetPwdValue(""); setEditUserId(null) }} title="Redefinir senha"
                        className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors">
                        <KeyRound size={14} />
                      </button>
                      <button onClick={() => handleToggleActive(user.id)} disabled={isPending} title={user.active ? "Desativar usuário" : "Ativar usuário"}
                        className={`p-1.5 rounded-lg transition-colors ${user.active ? "hover:bg-red-50 text-gray-400 hover:text-red-500" : "hover:bg-green-50 text-gray-400 hover:text-green-600"}`}>
                        {user.active ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: acesso a outras filiais */}
      {accessUserId && accessUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={() => setAccessUserId(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-black text-slate-800 mb-1">Acesso a outras filiais</h3>
            <p className="text-xs text-slate-400 mb-4">
              {accessUser.name} é da filial <strong>{accessUser.organizationName}</strong> por padrão. Marque outras filiais que essa pessoa também pode acessar (aparece no seletor de organização dela).
            </p>
            {accessLoading ? (
              <p className="text-xs text-slate-400 text-center py-4">Carregando...</p>
            ) : (
              <FilialPicker orgs={orgs} selected={accessSelected} onChange={setAccessSelected} />
            )}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setAccessUserId(null)} className="px-3.5 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveAccess} disabled={isPending || accessLoading}
                className="px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 transition-colors">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
