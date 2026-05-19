"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Play, CheckCircle2, FlaskConical, Rocket, TrendingUp, RotateCcw } from "lucide-react"
import { updateProjectStatus } from "@/lib/actions/projects"

const TRANSITIONS: Record<string, { label: string; next: string; icon: typeof Play; color: string }> = {
  PLANNING:     { label: "Iniciar Projeto",    next: "IN_PROGRESS", icon: Play,         color: "from-blue-500 to-blue-600" },
  IN_PROGRESS:  { label: "Ir para Piloto",     next: "PILOT",       icon: FlaskConical, color: "from-cyan-500 to-blue-500" },
  PILOT:        { label: "Iniciar Ramp-Up",    next: "RAMP_UP",     icon: TrendingUp,   color: "from-indigo-500 to-violet-500" },
  RAMP_UP:      { label: "GO LIVE",            next: "GO_LIVE",     icon: Rocket,       color: "from-emerald-500 to-green-600" },
  GO_LIVE:      { label: "Pós GO LIVE",        next: "POST_GOLIVE", icon: CheckCircle2, color: "from-teal-500 to-emerald-500" },
  POST_GOLIVE:     { label: "Encerrar Projeto",   next: "COMPLETED",    icon: CheckCircle2, color: "from-green-500 to-green-700" },
  FUTURE_ANALYSIS: { label: "Retomar para Análise", next: "PLANNING",  icon: RotateCcw,    color: "from-violet-500 to-purple-600" },
}

interface StatusActionsProps {
  projectId: string
  currentStatus: string
  userRole: string
}

export function StatusActions({ projectId, currentStatus, userRole }: StatusActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const canAdvance = ["ADMIN", "PROJECT_MANAGER"].includes(userRole)
  const transition = TRANSITIONS[currentStatus]

  if (!canAdvance || !transition) return null

  const Icon = transition.icon

  return (
    <button
      onClick={() => startTransition(async () => {
        await updateProjectStatus(projectId, transition.next as any)
        router.refresh()
      })}
      disabled={isPending}
      className={`inline-flex items-center gap-2 px-4 h-9 text-sm font-semibold rounded-xl text-white
        disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98] transition-all bg-gradient-to-r ${transition.color}`}
    >
      {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {transition.label}
    </button>
  )
}
