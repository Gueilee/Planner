"use client"

// Feriados por filial — cadastro único que passa a valer pra todos os
// projetos daquela filial (loadCalendar em lib/actions/schedule-v2.ts soma
// isso aos feriados nacionais já auto-semeados por projeto). Pedido da
// analista de projetos: um projeto numa filial de outro estado pode ter
// feriados estaduais/municipais que hoje não entravam no cálculo de dias
// úteis nenhum.

import { useState, useEffect, useTransition } from "react"
import { CalendarDays, Plus, Trash2, Loader2, Building2 } from "lucide-react"
import {
  listOrganizationHolidays, createOrganizationHoliday, deleteOrganizationHoliday,
  type OrganizationHolidayRow,
} from "@/lib/actions/organization-holidays"
import type { OrgRow } from "@/lib/actions/organizations"

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y}`
}

export function HolidaysTab({ orgs, isGlobalAdmin, currentOrgId }: { orgs: OrgRow[]; isGlobalAdmin: boolean; currentOrgId: string }) {
  const [orgId, setOrgId] = useState(currentOrgId)
  const [holidays, setHolidays] = useState<OrganizationHolidayRow[] | null>(null)
  const [dia, setDia] = useState("")
  const [descricao, setDescricao] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function load(targetOrgId: string) {
    setHolidays(null)
    listOrganizationHolidays(isGlobalAdmin ? targetOrgId : undefined)
      .then(setHolidays)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erro ao carregar feriados"))
  }

  useEffect(() => { load(orgId) }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleAdd() {
    if (!dia || !descricao.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await createOrganizationHoliday({ dia, descricao }, isGlobalAdmin ? orgId : undefined)
      if ("error" in res) { setError(res.error); return }
      setHolidays((prev) => [...(prev ?? []), res.holiday].sort((a, b) => a.dia.localeCompare(b.dia)))
      setDia(""); setDescricao("")
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteOrganizationHoliday(id)
      setHolidays((prev) => (prev ?? []).filter((h) => h.id !== id))
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(123,47,190,0.10)" }}>
            <CalendarDays className="w-4 h-4" style={{ color: "#7B2FBE" }} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Feriados da filial</p>
            <p className="text-xs text-slate-400">
              Somados aos feriados nacionais em todos os projetos desta filial — não é preciso cadastrar de novo em cada cronograma.
            </p>
          </div>
        </div>
        {isGlobalAdmin && (
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={`${inputCls} w-56`}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Data</label>
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={`${inputCls} w-44`} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-gray-600 block mb-1">Descrição</label>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: Aniversário do município"
            className={inputCls}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={isPending || !dia || !descricao.trim()}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Adicionar
        </button>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {holidays === null ? (
          <p className="text-sm text-gray-400 px-5 py-4">Carregando feriados...</p>
        ) : holidays.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-4">Nenhum feriado extra cadastrado nesta filial ainda.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {holidays.map((h) => (
              <div key={h.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-bold text-slate-600 shrink-0 w-20">{fmtDate(h.dia)}</span>
                  <span className="text-sm text-slate-700 truncate">{h.descricao}</span>
                </div>
                <button
                  onClick={() => handleDelete(h.id)}
                  className="text-slate-300 hover:text-red-500 transition-colors shrink-0 p-1"
                  title="Remover"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
