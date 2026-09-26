"use client"

// Modal "Histórico de alterações" — extraído de schedule-v2-client.tsx pra
// ser usado também no Kanban (project-tasks-kanban.tsx). Os dois já
// escrevem no MESMO log (ScheduleV2ChangeLog, via applyItemUpdatesV2 —
// qualquer edição feita pelo Kanban já era registrada ali, só não tinha
// como ver por essa tela; nada muda no que é gravado, só quem consegue ler).

import { History } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { ChangeLogEntryV2 } from "@/lib/actions/schedule-v2"

export function HistoryModal({ loading, entries, onClose }: {
  loading: boolean
  entries: ChangeLogEntryV2[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-white shadow-xl border border-slate-200 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1 shrink-0">
          <History className="w-4 h-4 text-[#7B2FBE]" />
          <h3 className="text-sm font-black text-slate-800">Histórico de alterações</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4 shrink-0">
          Quem mudou o quê e quando neste cronograma — mais recentes primeiro.
        </p>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <p className="text-xs text-slate-400 text-center py-6">Carregando…</p>
          ) : entries.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Nenhuma alteração registrada ainda.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => (
                <li key={e.id} className="text-xs border-b border-slate-100 pb-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-bold text-slate-700">{e.userName}</span>
                    <span
                      className="text-[10px] text-slate-400 shrink-0"
                      title={new Date(e.createdAt).toLocaleString("pt-BR")}
                    >
                      {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-slate-600 mt-0.5">{e.description}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-4 shrink-0">
          <button onClick={onClose} className="px-3.5 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
