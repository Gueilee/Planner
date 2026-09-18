"use client"

import { useState, useEffect, useTransition, useMemo } from "react"
import { Search, Building2, Plus, UserX, UserCheck, Link2, Copy, Check, Clock3 } from "lucide-react"
import { getAllUsers, createUser, toggleUserActive, type CreateUserResult } from "@/lib/actions/profile"
import { createInvitation, listPendingInvitations, revokeInvitation, type PendingInvitation } from "@/lib/actions/invitations"
import type { UserRole } from "@/lib/generated/prisma/enums"
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

  // Duas formas de dar acesso a alguém novo: definir a senha na hora (fica
  // por sua conta repassar) ou gerar um link de convite (a pessoa define a
  // própria senha em /invite/[token], sem você precisar saber/repassar
  // nada). O link é gerado e devolvido pela action mesmo que o envio por
  // e-mail falhe (SMTP fora do ar etc.) — por isso sempre mostramos o
  // "copiar link" depois de gerar, em vez de depender só do e-mail chegar.
  const [createMode, setCreateMode] = useState<"password" | "link">("link")
  const [inviteResult, setInviteResult] = useState<{ link: string; emailSent: boolean } | null>(null)
  const [copied, setCopied] = useState(false)

  const [pendingInvites, setPendingInvites] = useState<PendingInvitation[] | null>(null)
  const [showPending, setShowPending] = useState(false)

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

  function handleCreateInvite() {
    if (!newUserName.trim() || !newUserEmail.trim()) return
    startTransition(async () => {
      const res = await createInvitation({
        name: newUserName, email: newUserEmail, role: newUserRole as UserRole,
        organizationId: isGlobalAdmin ? newUserOrgId : undefined,
      })
      if ("error" in res) { flash(res.error, true); return }
      setInviteResult({ link: `${window.location.origin}/invite/${res.token}`, emailSent: res.emailSent })
      setNewUserName(""); setNewUserEmail(""); setNewUserRole("PROJECT_MEMBER"); setNewUserDept("")
      flash(res.emailSent ? "Convite enviado por e-mail — o link abaixo também funciona" : "Link de convite gerado")
      loadPendingInvites()
    })
  }

  function loadPendingInvites() {
    listPendingInvitations().then(setPendingInvites).catch((e: unknown) => flash(e instanceof Error ? e.message : "Erro ao carregar convites", true))
  }

  function handleCopyInviteLink(link: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleRevokeInvite(id: string) {
    if (!confirm("Revogar este convite? O link parará de funcionar.")) return
    startTransition(async () => {
      try {
        await revokeInvitation(id)
        setPendingInvites((prev) => (prev ?? []).filter((i) => i.id !== id))
        flash("Convite revogado")
      } catch (e: unknown) {
        flash(e instanceof Error ? e.message : "Erro ao revogar convite", true)
      }
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
        <button onClick={() => { setShowPending((v) => !v); if (!showPending && pendingInvites === null) loadPendingInvites() }}
          className="flex items-center gap-1.5 text-gray-600 text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors shrink-0">
          <Clock3 size={15} /> Convites pendentes
        </button>
        <button onClick={() => { setShowCreate((v) => !v); setInviteResult(null) }}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors shrink-0">
          <Plus size={15} /> Novo usuário
        </button>
      </div>

      {/* Convites pendentes — link gerado (por e-mail ou não) que ainda não
          foi usado. Existe justamente pro caso de fechar a tela antes de
          copiar, ou o e-mail nunca ter chegado. */}
      {showPending && (
        <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
          {pendingInvites === null ? (
            <p className="text-sm text-gray-400 px-5 py-4">Carregando convites...</p>
          ) : pendingInvites.length === 0 ? (
            <p className="text-sm text-gray-400 px-5 py-4">Nenhum convite pendente.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800 truncate">{inv.name}</span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{ROLE_LABELS[inv.role] ?? inv.role}</span>
                      {isGlobalAdmin && <span className="text-xs text-gray-400">{inv.organizationName}</span>}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{inv.email} · expira em {new Date(inv.expiresAt).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleCopyInviteLink(`${window.location.origin}/invite/${inv.token}`)}
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 px-2 py-1.5 rounded-lg border border-blue-100 hover:bg-blue-50 transition-colors">
                      {copied ? <Check size={13} /> : <Copy size={13} />} Copiar link
                    </button>
                    <button onClick={() => handleRevokeInvite(inv.id)}
                      className="text-xs text-red-500 hover:text-red-600 px-2 py-1.5 rounded-lg border border-red-100 hover:bg-red-50 transition-colors">
                      Revogar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Formulário de criação */}
      {showCreate && (
        <div className="border border-gray-200 rounded-xl p-5 bg-white space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Novo usuário</h3>
            <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden">
              <button onClick={() => { setCreateMode("link"); setInviteResult(null) }}
                className={`px-3 py-1.5 transition-colors ${createMode === "link" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                Gerar link de convite
              </button>
              <button onClick={() => { setCreateMode("password"); setInviteResult(null) }}
                className={`px-3 py-1.5 transition-colors ${createMode === "password" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                Definir senha agora
              </button>
            </div>
          </div>

          {inviteResult ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                {inviteResult.emailSent
                  ? "Convite enviado por e-mail. O link abaixo também funciona, caso precise repassar direto:"
                  : "Não foi possível confirmar o envio do e-mail — copie o link abaixo e envie manualmente (Teams, WhatsApp etc.):"}
              </p>
              <div className="flex items-center gap-2">
                <input readOnly value={inviteResult.link} className={`${inputCls} bg-gray-50 text-gray-500`} onFocus={(e) => e.target.select()} />
                <button onClick={() => handleCopyInviteLink(inviteResult.link)}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded-lg transition-colors shrink-0">
                  {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
              <p className="text-xs text-gray-400">Válido por 7 dias. A pessoa define a própria senha ao abrir o link.</p>
              <button onClick={() => setInviteResult(null)} className="text-xs text-blue-600 hover:text-blue-700">
                Gerar outro convite
              </button>
            </div>
          ) : (
            <>
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
                {createMode === "password" && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Senha inicial *</label>
                    <input value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} placeholder="Mínimo 6 caracteres" type="text" className={inputCls} />
                  </div>
                )}
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
              {createMode === "password" ? (
                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  Anote a senha e envie para o usuário — ela não poderá ser recuperada depois.
                </p>
              ) : (
                <p className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg flex items-center gap-1.5">
                  <Link2 size={13} className="shrink-0" /> A pessoa recebe um link (por e-mail, se o servidor de e-mail estiver configurado) e define a própria senha ao acessar.
                </p>
              )}
              <div className="flex gap-3">
                {createMode === "password" ? (
                  <button onClick={handleCreateUser}
                    disabled={isPending || !newUserName.trim() || !newUserEmail.trim() || newUserPassword.length < 6}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                    {isPending ? "Criando..." : "Criar usuário"}
                  </button>
                ) : (
                  <button onClick={handleCreateInvite}
                    disabled={isPending || !newUserName.trim() || !newUserEmail.trim()}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                    <Link2 size={15} /> {isPending ? "Gerando..." : "Gerar link de convite"}
                  </button>
                )}
                <button onClick={() => setShowCreate(false)}
                  className="text-gray-600 text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
              </div>
            </>
          )}
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
