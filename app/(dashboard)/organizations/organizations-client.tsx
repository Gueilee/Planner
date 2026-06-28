"use client"

import { useState, useTransition } from "react"
import {
  createOrganization,
  updateOrganization,
  toggleOrganizationActive,
  createUserInOrganization,
  type OrgRow,
} from "@/lib/actions/organizations"

const ROLES = ["ADMIN", "PROJECT_MANAGER", "PROJECT_MEMBER", "DIRECTOR", "SPONSOR", "CLIENT"]

type Props = { initialOrgs: OrgRow[]; currentOrgId: string }

export function OrganizationsClient({ initialOrgs, currentOrgId }: Props) {
  const [orgs, setOrgs] = useState(initialOrgs)
  const [showNewOrg, setShowNewOrg] = useState(false)
  const [newUserOrgId, setNewUserOrgId] = useState<string | null>(null)
  const [editOrgId, setEditOrgId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // New org form state
  const [newOrgName, setNewOrgName] = useState("")
  const [newOrgSlug, setNewOrgSlug] = useState("")

  // New user form state
  const [newUserName, setNewUserName] = useState("")
  const [newUserEmail, setNewUserEmail] = useState("")
  const [newUserRole, setNewUserRole] = useState("PROJECT_MEMBER")
  const [newUserDept, setNewUserDept] = useState("")
  const [newUserPhone, setNewUserPhone] = useState("")

  // Edit org form state
  const [editName, setEditName] = useState("")

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess(null) }
    else { setSuccess(msg); setError(null) }
    setTimeout(() => { setError(null); setSuccess(null) }, 4000)
  }

  function handleCreateOrg() {
    if (!newOrgName.trim()) return
    startTransition(async () => {
      try {
        const org = await createOrganization({ name: newOrgName, slug: newOrgSlug || newOrgName.toLowerCase().replace(/\s+/g, "-") })
        setOrgs((prev) => [...prev, org])
        setNewOrgName("")
        setNewOrgSlug("")
        setShowNewOrg(false)
        flash("Organização criada com sucesso")
      } catch (e: unknown) {
        flash(e instanceof Error ? e.message : "Erro ao criar organização", true)
      }
    })
  }

  function handleToggleActive(id: string) {
    startTransition(async () => {
      try {
        const { active } = await toggleOrganizationActive(id)
        setOrgs((prev) => prev.map((o) => (o.id === id ? { ...o, active } : o)))
      } catch (e: unknown) {
        flash(e instanceof Error ? e.message : "Erro ao alterar status", true)
      }
    })
  }

  function handleUpdateOrg(id: string) {
    if (!editName.trim()) return
    startTransition(async () => {
      try {
        await updateOrganization(id, { name: editName })
        setOrgs((prev) => prev.map((o) => (o.id === id ? { ...o, name: editName } : o)))
        setEditOrgId(null)
        flash("Organização atualizada")
      } catch (e: unknown) {
        flash(e instanceof Error ? e.message : "Erro ao atualizar", true)
      }
    })
  }

  function handleCreateUser(orgId: string) {
    if (!newUserName.trim() || !newUserEmail.trim()) return
    startTransition(async () => {
      try {
        await createUserInOrganization({
          organizationId: orgId,
          name: newUserName,
          email: newUserEmail,
          role: newUserRole,
          department: newUserDept || null,
          phone: newUserPhone || null,
        })
        setOrgs((prev) =>
          prev.map((o) =>
            o.id === orgId ? { ...o, _count: { ...o._count, users: o._count.users + 1 } } : o
          )
        )
        setNewUserName("")
        setNewUserEmail("")
        setNewUserRole("PROJECT_MEMBER")
        setNewUserDept("")
        setNewUserPhone("")
        setNewUserOrgId(null)
        flash("Usuário criado com sucesso")
      } catch (e: unknown) {
        flash(e instanceof Error ? e.message : "Erro ao criar usuário", true)
      }
    })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Organizações</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie filiais e unidades de negócio</p>
        </div>
        <button
          onClick={() => setShowNewOrg(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          Nova organização
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* New org form */}
      {showNewOrg && (
        <div className="border border-gray-200 rounded-xl p-5 bg-white space-y-4">
          <h2 className="font-medium text-gray-800">Nova organização</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Nome *</label>
              <input
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Ex: Vendemmia Filial SP"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Slug (URL)</label>
              <input
                value={newOrgSlug}
                onChange={(e) => setNewOrgSlug(e.target.value)}
                placeholder="filial-sp (auto-gerado se vazio)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreateOrg}
              disabled={isPending || !newOrgName.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {isPending ? "Criando..." : "Criar"}
            </button>
            <button
              onClick={() => { setShowNewOrg(false); setNewOrgName(""); setNewOrgSlug("") }}
              className="text-gray-600 hover:text-gray-800 text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Org list */}
      <div className="space-y-4">
        {orgs.map((org) => (
          <div
            key={org.id}
            className={`border rounded-xl bg-white overflow-hidden ${!org.active ? "opacity-60" : ""}`}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                  {org.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  {editOrgId === org.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleUpdateOrg(org.id)}
                        disabled={isPending}
                        className="text-blue-600 text-xs hover:underline"
                      >
                        Salvar
                      </button>
                      <button
                        onClick={() => setEditOrgId(null)}
                        className="text-gray-400 text-xs hover:underline"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{org.name}</span>
                      {org.id === currentOrgId && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          Sua organização
                        </span>
                      )}
                      {!org.active && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          Inativa
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    slug: {org.slug} · {org._count.users} usuário{org._count.users !== 1 ? "s" : ""} · {org._count.projects} projeto{org._count.projects !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNewUserOrgId(newUserOrgId === org.id ? null : org.id)}
                  className="text-sm text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors"
                >
                  + Usuário
                </button>
                {editOrgId !== org.id && (
                  <button
                    onClick={() => { setEditOrgId(org.id); setEditName(org.name) }}
                    className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    Editar
                  </button>
                )}
                {org.id !== "org_vendemmia" && (
                  <button
                    onClick={() => handleToggleActive(org.id)}
                    disabled={isPending}
                    className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                      org.active
                        ? "text-red-600 border-red-200 hover:bg-red-50"
                        : "text-green-600 border-green-200 hover:bg-green-50"
                    }`}
                  >
                    {org.active ? "Desativar" : "Ativar"}
                  </button>
                )}
              </div>
            </div>

            {/* Add user inline form */}
            {newUserOrgId === org.id && (
              <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-4">
                <h3 className="text-sm font-medium text-gray-700">
                  Adicionar usuário em <span className="text-blue-600">{org.name}</span>
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Nome *</label>
                    <input
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="Nome completo"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">E-mail *</label>
                    <input
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="email@empresa.com"
                      type="email"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Perfil</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Área / Departamento</label>
                    <input
                      value={newUserDept}
                      onChange={(e) => setNewUserDept(e.target.value)}
                      placeholder="Ex: Logística"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  A senha inicial será gerada automaticamente. O usuário pode redefinir no primeiro acesso.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleCreateUser(org.id)}
                    disabled={isPending || !newUserName.trim() || !newUserEmail.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
                  >
                    {isPending ? "Criando..." : "Criar usuário"}
                  </button>
                  <button
                    onClick={() => setNewUserOrgId(null)}
                    className="text-gray-600 text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
