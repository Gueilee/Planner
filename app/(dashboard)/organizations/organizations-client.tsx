"use client"

import { useState, useTransition } from "react"
import {
  createOrganization,
  updateOrganization,
  toggleOrganizationActive,
  type OrgRow,
} from "@/lib/actions/organizations"

type Props = { initialOrgs: OrgRow[]; currentOrgId: string }

// Só CRUD de organização (criar, renomear, ativar/desativar) — gestão de
// usuário (papel, filial, perfil de acesso) mudou pra cá: Configurações →
// Usuários (global-users-view.tsx), pra não ter duas telas diferentes
// fazendo a mesma coisa (o alternador "Filiais"/"Usuários" que existia
// aqui foi removido de propósito).
export function OrganizationsClient({ initialOrgs, currentOrgId }: Props) {
  const [orgs, setOrgs] = useState(initialOrgs)

  const [showNewOrg, setShowNewOrg] = useState(false)
  const [newOrgName, setNewOrgName] = useState("")
  const [newOrgSlug, setNewOrgSlug] = useState("")
  const [editOrgId, setEditOrgId] = useState<string | null>(null)
  const [editOrgName, setEditOrgName] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess(null) } else { setSuccess(msg); setError(null) }
    setTimeout(() => { setError(null); setSuccess(null) }, 4000)
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

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Filiais</h1>
          <p className="text-sm text-gray-500 mt-1">Criar, renomear e ativar/desativar organizações</p>
        </div>
        <button onClick={() => setShowNewOrg(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          Nova organização
        </button>
      </div>

      {error   && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{success}</div>}

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

      <div className="space-y-3">
        {orgs.map((org) => (
          <div key={org.id} className={`border rounded-xl bg-white overflow-hidden ${!org.active ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between px-5 py-4">
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

              <div className="flex items-center gap-2">
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
          </div>
        ))}
      </div>
    </div>
  )
}
