"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2, AlertTriangle, X } from "lucide-react"
import { deleteProject } from "@/lib/actions/projects"

export function DeleteProjectButton({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const [open, setOpen]       = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleDelete() {
    startTransition(async () => {
      await deleteProject(projectId)
      router.push("/projects")
    })
  }

  return (
    <>
      {/* Trigger — small, unobtrusive */}
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 h-7 text-[11px] font-semibold rounded-lg border transition-all hover:bg-red-50 active:scale-[0.98]"
        style={{ color: "#EF4444", borderColor: "#FECACA", background: "transparent" }}
      >
        <Trash2 className="w-3 h-3" />
        Excluir projeto
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            style={{ border: "1px solid #E2E8F0", boxShadow: "0 24px 64px rgba(15,23,42,0.20)" }}
          >
            {/* Red top accent */}
            <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #DC2626, #EF4444, #F87171)" }} />

            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}
                  >
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-base font-black text-[#0F172A]">Excluir projeto?</p>
                    <p className="text-xs text-slate-400 mt-0.5">Esta ação não pode ser desfeita</p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Project name highlight */}
              <div
                className="rounded-xl px-4 py-3 mb-5"
                style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1">Projeto a ser excluído</p>
                <p className="text-sm font-bold text-red-700 line-clamp-2">{projectTitle}</p>
              </div>

              {/* Warning message */}
              <p className="text-sm text-slate-500 leading-relaxed mb-6">
                Todos os dados deste projeto serão{" "}
                <span className="font-bold text-slate-700">permanentemente removidos</span>:{" "}
                tarefas, riscos, reuniões, documentos e histórico.
              </p>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                  className="flex-1 h-10 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="flex-1 h-10 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{
                    background: isPending
                      ? "#EF4444"
                      : "linear-gradient(135deg, #DC2626, #EF4444)",
                    boxShadow: "0 4px 16px rgba(239,68,68,0.35)",
                  }}
                >
                  {isPending ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Excluindo…
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Excluir permanentemente
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
