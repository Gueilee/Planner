import { cn } from "@/lib/utils"
import type { ScheduleStatus } from "@/lib/utils/schedule-status"

// Mesma paleta/rótulos do badge "No Prazo/Em Risco/Atrasado" já usado no
// Cronograma (schedule-v2-client.tsx) — um chip ADICIONAL ao lado do badge
// de fase (StatusBadge), nunca no lugar dele: fase (o enum manual) e risco
// de prazo (calculado por data/progresso) são informações diferentes.
const CONFIG: Record<ScheduleStatus, { label: string; bg: string; text: string; border: string }> = {
  ON_TIME: { label: "No Prazo",  bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" },
  AT_RISK: { label: "Em Risco",  bg: "bg-amber-50",   text: "text-amber-600",   border: "border-amber-200" },
  DELAYED: { label: "Atrasado",  bg: "bg-red-50",     text: "text-red-600",    border: "border-red-200" },
  ND:      { label: "Sem Datas", bg: "bg-slate-50",   text: "text-slate-400",  border: "border-slate-200" },
}

interface ScheduleRiskChipProps {
  status: ScheduleStatus
  className?: string
  size?: "sm" | "md"
}

export function ScheduleRiskChip({ status, className, size = "sm" }: ScheduleRiskChipProps) {
  const c = CONFIG[status]
  return (
    <span
      title="Situação de prazo — real vs. esperado até hoje, pelo calendário do Cronograma"
      className={cn(
        "inline-flex items-center font-bold uppercase tracking-wide border rounded-full",
        size === "sm" && "px-2 py-0.5 text-[9px]",
        size === "md" && "px-2.5 py-1 text-[10px]",
        c.bg, c.text, c.border, className
      )}
    >
      {c.label}
    </span>
  )
}
