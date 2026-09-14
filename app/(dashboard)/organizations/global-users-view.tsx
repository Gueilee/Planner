"use client"

import { useState, useEffect, useTransition, useMemo } from "react"
import { Search, Building2, Plus, UserX, UserCheck } from "lucide-react"
import { getAllUsers, createUser, toggleUserActive, type CreateUserResult } from "@/lib/actions/profile"
import type { OrgRow } from "@/lib/actions/organizations"
import { PeoplePicker } from "@/components/kronex/people-picker"
import { UserDetailModal, type ManagedUser } from "./user-detail-modal"

const ROLES = ["ADMIN", "PROJECT_MANAGER", "PROJECT_MEMBER", "DIRECTOR", "SPONSOR", "CLIENT"]
const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin", PROJECT_MANAGER: "GP", PROJECT_MEMBER: "Membro",
  DIRECTOR: "Diretor", SPONSOR: "Sponsor", CLIENT: "Cliente",
}

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

// A tela de usuários — ponto único de gestão, substituindo a antiga divisão
// "entra numa filial pra ver os usuários dela" (organizations-client.tsx)
// e a tela separada de Configurações → Usuários (users-tab.tsx). Um admin
// de filial vê só a própria filial; um admin global (isGlobalAdmin) vê
// todo mundo, com filtro por filial. Clicar num usuário abre o painel
// único (UserDetailModal) — filial(is), papel e perfil de acesso, tudo
// junto, em vez de espalhado em telas diferentes.
export function GlobalUsersView({ orgs, isGlobalAdmin, currentOrgId }: { orgs: OrgRow[]; isGlobalAdmin: boolean; currentOrgId: string }) {
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [search, setSearch] = useState("")
  const [orgFilter, setOrgFilter] = useState<string>("ALL")
  const [managingUser, setManagingUser] = useState<ManagedUser | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const [newUserName, setNewUserName] = useState("")
  const [newUserEmail, setNewUserEmail] = useState("")
  const [newUserPassword, setNewUserPassword] = useState("")
  const [newUserRole, setNewUserRole] = useState("PROJECT_MEMBER")
  const [newUserDept, setNewUserDept] = useState("")
  const [newUserOrgId, setNewUserOrgId] = useState(currentOrgId)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getAllUsers()
      .then((rows) => setUsers(rows.map(toManagedUser)))
      .catch((e: unknown) => flash(e instanceof Error ? e.message : "Erro ao carregar usuários", true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toManagedUser(u: Awaited<ReturnType<typeof getAllUsers>>[number]): ManagedUser {
    return {
      id: u.id, name: u.name, email: u.email, role: u.role, department: u.department, phone: u.phone,
      image: u.image, active: u.active, profileId: u.profileId,
      accessProfile: u.accessProfile, organizationId: u.organizationId, organizationName: u.organization.name,
    }
  }

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

  function handleCreateUser() {
    if (!newUserName.trim() || !newUserEmail.trim() || newUserPassword.length < 6) return
    startTransition(async () => {
      const res: CreateUserResult = await createUser({
        name: newUserName, email: newUserEmail, password: newUserPassword,
        role: newUserRole, department: newUserDept || undefined,
        organizationId: isGlobalAdmin ? newUserOrgId : undefined,
      })
      if (!res.success) { flash(res.error, true); return }
      setUsers((prev) => [...(prev ?? []), toManagedUser(res.user)])
      setNewUserName(""); setNewUserEmail(""); setNewUserPassword("")
      setNewUserRole("PROJECT_MEMBER"); setNewUserDept(""); setShowCreate(false)
      flash("Usuário criado com sucesso")
    })
  }

  function handleToggleActive(user: ManagedUser) {
    startTransition(async () => {
      try {
        await toggleUserActive(user.id, !user.active)
        setUsers((prev) => (prev ?? []).map((u) => u.id === user.id ? { ...u, active: !user.active } : u))
      } catch (e: unknown) { flash(e instanceof Error ? e.message : "Erro", true) }
    })
  }

  function handleSaved(updated: ManagedUser) {
    setUsers((prev) => (prev ?? []).map((u) => u.id === updated.id ? updated : u))
    setManagingUser(null)
    flash("Usuário atualizado")
  }

  return (
    <div className="space-y-4">
      {error   && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{success}</div>}

      {/* Busca + filtro por filial (só admin global) + novo usuário */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {isGlobalAdmin && (
          <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} className={`${inputCls} w-56`}>
            <option value="ALL">Todas as filiais</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <button onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors shrink-0">
          <Plus size={15} /> Novo usuário
        </button>
      </div>

      {/* Formulário de criação */}
      {showCreate && (
        <div className="border border-gray-200 rounded-xl p-5 bg-white space-y-4">
          <h3 className="text-sm font-medium text-gray-700">Novo usuário</h3>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Buscar no diretório da empresa</label>
            <PeoplePicker
              autoLink={false}
              placeholder="Digite o nome ou e-mail..."
              onPick={(person) => { setNewUserName(person.name); setNewUserEmail(person.email) }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Nome *</label>
              <input value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="Nome completo" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">E-mail *</label>
              <input value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="email@empresa.com" type="email" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Senha inicial *</label>
              <input value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} placeholder="Mínimo 6 caracteres" type="text" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Perfil</label>
              <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)} className={inputCls}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Área / Departamento</label>
              <input value={newUserDept} onChange={(e) => setNewUserDept(e.target.value)} placeholder="Ex: Logística" className={inputCls} />
            </div>
            {isGlobalAdmin && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Filial</label>
                <select value={newUserOrgId} onChange={(e) => setNewUserOrgId(e.target.value)} className={inputCls}>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            Anote a senha e envie para o usuário — ela não poderá ser recuperada depois.
          </p>
          <div className="flex gap-3">
            <button onClick={handleCreateUser}
              disabled={isPending || !newUserName.trim() || !newUserEmail.trim() || newUserPassword.length < 6}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              {isPending ? "Criando..." : "Criar usuário"}
            </button>
            <button onClick={() => setShowCreate(false)}
              className="text-gray-600 text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {users === null ? (
        <p className="text-sm text-gray-400 px-1 py-6 text-center">Carregando usuários...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 px-1 py-6 text-center">Nenhum usuário encontrado.</p>
      ) : (
        <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
          <div className="divide-y divide-gray-50">
            {filtered.map((user) => (
              <div key={user.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <button className="flex items-center gap-3 min-w-0 text-left flex-1" onClick={() => setManagingUser(user)}>
                  <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden">
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
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
                      {user.accessProfile && (
                        <span className="text-xs px-1.5 py-0.5 rounded text-white" style={{ background: user.accessProfile.color }}>
                          {user.accessProfile.name}
                        </span>
                      )}
                      {isGlobalAdmin && (
                        <span className="text-xs bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Building2 className="w-2.5 h-2.5" /> {user.organizationName}
                        </span>
                      )}
                      {!user.active && (
                        <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded">Inativo</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">
                      {user.email}{user.department ? ` · ${user.department}` : ""}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => setManagingUser(user)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-50 transition-colors">
                    Gerenciar
                  </button>
                  <button onClick={() => handleToggleActive(user)} disabled={isPending} title={user.active ? "Desativar usuário" : "Ativar usuário"}
                    className={`p-1.5 rounded-lg transition-colors ${user.active ? "hover:bg-red-50 text-gray-400 hover:text-red-500" : "hover:bg-green-50 text-gray-400 hover:text-green-600"}`}>
                    {user.active ? <UserX size={14} /> : <UserCheck size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {managingUser && (
        <UserDetailModal
          user={managingUser}
          orgs={orgs}
          isGlobalAdmin={isGlobalAdmin}
          onClose={() => setManagingUser(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
