"use client"

import { useState } from "react"
import { ChevronDown, Check, X } from "lucide-react"
import type { OrgRow } from "@/lib/actions/organizations"

// Extraído de app/(dashboard)/settings/users-tab.tsx (só existia ali) pra
// ser reaproveitado também pela Gestão Global de Usuários
// (app/(dashboard)/organizations) — mesmo componente, dois lugares que
// concedem acesso a outras filiais (UserOrganizationAccess).
export function FilialPicker({ orgs, selected, onChange }: {
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
