"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RotateCcw, Loader2, X, Check } from "lucide-react"
import { updateProjectStatus } from "@/lib/actions/projects"

export function ReopenProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function handleReopen() {
    startTransition(async () => {
      await updateProjectStatus(projectId, "IN_PROGRESS" as never)
      router.refresh()
    })
  }

  if (confirming) {
    return (
      <div
        className="inline-flex items-center gap-2 pl-3 pr-1.5 h-8 rounded-xl text-xs font-semibold animate-in fade-in slide-in-from-left-2 duration-150"
        style={{
          background: "linear-gradient(135deg, #FFF7ED, #FFEDD5)",
          border: "1px solid #FED7AA",
          color: "#C2410C",
          boxShadow: "0 2px 8px rgba(194,65,12,0.12)",
        }}
      >
        <span className="mr-0.5">Reabrir projeto?</span>
        <button
          onClick={handleReopen}
          disabled={isPending}
          title="Confirmar reabertura"
          className="w-6 h-6 rounded-lg flex items-center justify-center text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #EA580C, #F97316)", boxShadow: "0 2px 6px rgba(234,88,12,0.30)" }}
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={isPending}
          title="Cancelar"
          className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-orange-100 active:scale-95"
          style={{ color: "#C2410C" }}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] font-semibold transition-all hover:shadow-sm active:scale-[0.96] group"
      style={{
        border: "1px solid #E2E8F0",
        color: "#94A3B8",
        background: "white",
      }}
      title="Reabrir projeto — voltar para Em Andamento"
    >
      <RotateCcw className="w-3 h-3 transition-transform group-hover:rotate-[-45deg] duration-300" style={{ color: "#94A3B8" }} />
      Reabrir
    </button>
  )
}
