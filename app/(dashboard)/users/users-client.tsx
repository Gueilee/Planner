"use client"

import { useState, useTransition, useMemo } from "react"
import {
  Plus, Search, Pencil, X, Loader2, UserCheck, UserX, Users,
  AlertTriangle, Check,
} from "lucide-react"
import { createUser, updateUser, toggleUserActive, type UserRow } from "@/lib/actions/users"
import type { UserRole } from "@/lib/generated/prisma/enums"

// ── Role display config ────────────────────────────────────────────────────

const ROLES: { value: UserRole; label: string; color: string; bg: string }[] = [
  { value: "ADMIN",           label: "Administrador",     color: "#7B2FBE", bg: "#F5F3FF" },
  { value: "DIRECTOR",        label: "Diretor",           color: "#1D4ED8", bg: "#EFF6FF" },
  { value: "PROJECT_MANAGER", label: "Gerente de Projeto", color: "#0369A1", bg: "#F0F9FF" },
  { value: "PROJECT_MEMBER",  label: "Membro",            color: "#374151", bg: "#F1F5F9" },
  { value: "SPONSOR",         label: "Sponsor",           color: "#B45309", bg: "#FFFBEB" },
  { value: "CLIENT",          label: "Cliente",           color: "#065F46", bg: "#ECFDF5" },
]

function roleCfg(role: UserRole) {
  return ROLES.find((r) => r.value === role) ?? ROLES[3]
}

function isSynthetic(user: UserRow) {
  return user.email.includes("@ext.planner")
}

function avatarColor(name: string) {
  return `hsl(${(name.charCodeAt(0) * 37) % 360}, 55%, 40%)`
}

const inputBase =
  "w-full h-10 px-3 rounded-xl text-sm text-[#0F172A] outline-none transition-all"

// ── Create/Edit Modal ──────────────────────────────────────────────────────

type FormData = {
  name: string
  email: string
  department: string
  role: UserRole
  phone: string
}

const EMPTY_FORM: FormData = {
  name: "",
  email: "",
  department: "",
  role: "PROJECT_MEMBER",
  phone: "",
}

function UserModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: UserRow | null
  onClose: () => void
  onSaved: (u: UserRow) => void
}) {
  const [form, setForm] = useState<FormData>(
    editing
      ? {
          name: editing.name,
          email: isSynthetic(editing) ? "" : editing.email,
          department: editing.department ?? "",
          role: editing.role,
          phone: editing.phone ?? "",
        }
      : EMPTY_FORM
  )
  const [error, setError] = useState("")
  const [isPending, start] = useTransition()

  function upd(k: keyof FormData, v: string) {
    setForm((p) => ({ ...p, [k]: v }))
  }

  function handleSubmit() {
    if (!form.name.trim()) { setError("Nome é obrigatório"); return }
    if (!form.email.trim()) { setError("E-mail é obrigatório"); return }
    setError("")
    start(async () => {
      try {
        let saved: UserRow
        if (editing) {
          saved = await updateUser(editing.id, {
            name: form.name,
            email: form.email,
            department: form.department || null,
            role: form.role,
            phone: form.phone || null,
          })
        } else {
          saved = await createUser({
            name: form.name,
            email: form.email,
            department: form.department || null,
            role: form.role,
            phone: form.phone || null,
          })
        }
        onSaved(saved)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar")
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "white", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid #E2E8F0" }}
        >
          <div>
            <h2 className="text-base font-black text-[#0F172A]">
              {editing ? "Editar Usuário" : "Novo Usuário"}
            </h2>
            {editing && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                Cadastrado em {new Date(editing.createdAt).toLocaleDateString("pt-BR")}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Warning for synthetic external user */}
        {editing && isSynthetic(editing) && (
          <div
            className="mx-6 mt-4 px-3 py-2.5 rounded-xl flex items-start gap-2.5"
            style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}
          >
            <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
            <p className="text-xs text-orange-700 leading-relaxed">
              Este usuário foi criado automaticamente a partir do cronograma. Preencha o e-mail corporativo e departamento corretos para regularizar o cadastro.
            </p>
          </div>
        )}

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Nome completo *
            </label>
            <input
              className={inputBase}
              style={{ border: "1.5px solid #E2E8F0" }}
              value={form.name}
              onChange={(e) => upd("name", e.target.value)}
              placeholder="Ex: João da Silva"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              E-mail corporativo *
            </label>
            <input
              className={inputBase}
              style={{ border: "1.5px solid #E2E8F0" }}
              type="email"
              value={form.email}
              onChange={(e) => upd("email", e.target.value)}
              placeholder="nome@vendemmia.com.br"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Departamento
              </label>
              <input
                className={inputBase}
                style={{ border: "1.5px solid #E2E8F0" }}
                value={form.department}
                onChange={(e) => upd("department", e.target.value)}
                placeholder="Ex: Tecnologia"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Telefone
              </label>
              <input
                className={inputBase}
                style={{ border: "1.5px solid #E2E8F0" }}
                type="tel"
                value={form.phone}
                onChange={(e) => upd("phone", e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Perfil de acesso
            </label>
            <select
              className={inputBase}
              style={{ border: "1.5px solid #E2E8F0" }}
              value={form.role}
              onChange={(e) => upd("role", e.target.value as UserRole)}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-xs font-semibold text-red-500">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex justify-end gap-2"
          style={{ borderTop: "1px solid #E2E8F0" }}
        >
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="h-9 px-5 rounded-xl text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50 transition-opacity"
            style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}
          >
            {isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Check className="w-3.5 h-3.5" />
            }
            {editing ? "Salvar alterações" : "Criar usuário"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Client ────────────────────────────────────────────────────────────

export function UsersClient({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers)
  const [search, setSearch] = useState("")
  const [filterRole, setFilterRole] = useState<UserRole | "ALL">("ALL")
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ACTIVE")
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [, start] = useTransition()

  const syntheticCount = useMemo(() => users.filter(isSynthetic).length, [users])

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (filterStatus === "ACTIVE" && !u.active) return false
      if (filterStatus === "INACTIVE" && u.active) return false
      if (filterRole !== "ALL" && u.role !== filterRole) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.department ?? "").toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [users, search, filterRole, filterStatus])

  function handleSaved(saved: UserRow) {
    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    })
    setShowModal(false)
    setEditingUser(null)
  }

  function openEdit(u: UserRow) {
    setEditingUser(u)
    setShowModal(true)
  }

  function openCreate() {
    setEditingUser(null)
    setShowModal(true)
  }

  function handleToggle(userId: string) {
    setTogglingId(userId)
    start(async () => {
      try {
        const result = await toggleUserActive(userId)
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, active: result.active } : u))
        )
      } catch { /* ignore */ }
      setTogglingId(null)
    })
  }

  const activeCount = users.filter((u) => u.active).length

  return (
    <div className="flex-1 overflow-auto p-6 space-y-5">

      {/* Synthetic users warning */}
      {syntheticCount > 0 && (
        <div
          className="rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}
        >
          <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-orange-800">
              {syntheticCount} cadastro{syntheticCount !== 1 ? "s" : ""} incompleto{syntheticCount !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-orange-700 mt-0.5 leading-relaxed">
              Estes usuários foram criados automaticamente pelo cronograma. Clique em{" "}
              <strong>editar (✏️)</strong> para corrigir o e-mail corporativo e o departamento de cada um.
              Funcionários da Vendemmia não devem ter e-mail terminado em <code>@ext.planner</code>.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total cadastrados", value: users.length, color: "#7B2FBE" },
          { label: "Usuários ativos", value: activeCount, color: "#059669" },
          { label: "Cadastros incompletos", value: syntheticCount, color: syntheticCount > 0 ? "#D97706" : "#94A3B8" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl p-4"
            style={{ border: "1px solid #E2E8F0", background: "white" }}
          >
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full h-10 pl-9 pr-4 rounded-xl text-sm outline-none"
            style={{ border: "1.5px solid #E2E8F0", background: "white" }}
            placeholder="Buscar por nome, e-mail ou departamento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-10 px-3 rounded-xl text-sm outline-none cursor-pointer"
          style={{ border: "1.5px solid #E2E8F0", background: "white" }}
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as UserRole | "ALL")}
        >
          <option value="ALL">Todos os perfis</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <select
          className="h-10 px-3 rounded-xl text-sm outline-none cursor-pointer"
          style={{ border: "1.5px solid #E2E8F0", background: "white" }}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
        >
          <option value="ACTIVE">Ativos</option>
          <option value="INACTIVE">Inativos</option>
          <option value="ALL">Todos</option>
        </select>
        <button
          onClick={openCreate}
          className="h-10 px-4 rounded-xl text-sm font-bold text-white flex items-center gap-2 shrink-0 transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}
        >
          <Plus className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      {/* Count */}
      {filtered.length > 0 && (
        <p className="text-xs text-slate-400">
          {filtered.length} usuário{filtered.length !== 1 ? "s" : ""} exibido{filtered.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* User grid */}
      {filtered.length === 0 ? (
        <div
          className="py-16 rounded-2xl text-center"
          style={{ border: "1px dashed #CBD5E1", background: "#F8FAFC" }}
        >
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-400">Nenhum usuário encontrado</p>
          {search && (
            <p className="text-xs text-slate-400 mt-1">Tente ajustar os filtros ou a busca</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((u) => {
            const cfg = roleCfg(u.role)
            const synth = isSynthetic(u)
            const toggling = togglingId === u.id

            return (
              <div
                key={u.id}
                className="rounded-xl p-4 flex items-start gap-3 transition-shadow hover:shadow-md"
                style={{
                  border: `1px solid ${synth ? "#FED7AA" : "#E2E8F0"}`,
                  background: synth ? "#FFFBF5" : "white",
                }}
              >
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0 transition-opacity"
                  style={{ background: avatarColor(u.name), opacity: u.active ? 1 : 0.45 }}
                >
                  {u.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className={`text-sm font-bold truncate ${u.active ? "text-[#0F172A]" : "text-slate-400"}`}>
                      {u.name}
                    </p>
                    {synth && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: "#FEF3C7", color: "#92400E" }}
                      >
                        Incompleto
                      </span>
                    )}
                    {!u.active && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: "#F1F5F9", color: "#94A3B8" }}
                      >
                        Inativo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {synth ? "⚠ E-mail não definido" : u.email}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: cfg.bg, color: cfg.color }}
                    >
                      {cfg.label}
                    </span>
                    {u.department && (
                      <span className="text-[10px] text-slate-500 truncate">{u.department}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(u)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-[#7B2FBE] transition-colors"
                    title="Editar usuário"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggle(u.id)}
                    disabled={toggling}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${
                      u.active
                        ? "text-slate-400 hover:bg-red-50 hover:text-red-500"
                        : "text-slate-400 hover:bg-green-50 hover:text-green-600"
                    }`}
                    title={u.active ? "Desativar usuário" : "Ativar usuário"}
                  >
                    {toggling
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : u.active
                        ? <UserX className="w-3.5 h-3.5" />
                        : <UserCheck className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <UserModal
          editing={editingUser}
          onClose={() => { setShowModal(false); setEditingUser(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
