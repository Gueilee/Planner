import { cn } from "@/lib/utils"

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string; border: string }> = {
  DRAFT:             { label: "Rascunho",       dot: "bg-gray-400",    bg: "bg-gray-50",     text: "text-gray-600",    border: "border-gray-200" },
  SUBMITTED:         { label: "Submetida",      dot: "bg-blue-400",    bg: "bg-blue-50",     text: "text-blue-600",    border: "border-blue-200" },
  UNDER_ANALYSIS:    { label: "Em Análise",     dot: "bg-amber-400",   bg: "bg-amber-50",    text: "text-amber-600",   border: "border-amber-200" },
  AWAITING_DECISION: { label: "Aguard. Decisão",dot: "bg-purple-400",  bg: "bg-purple-50",   text: "text-purple-600",  border: "border-purple-200" },
  APPROVED:          { label: "Aprovada",       dot: "bg-green-400",   bg: "bg-green-50",    text: "text-green-600",   border: "border-green-200" },
  REJECTED:          { label: "Rejeitada",      dot: "bg-red-400",     bg: "bg-red-50",      text: "text-red-600",     border: "border-red-200" },
  CANCELLED:         { label: "Cancelada",      dot: "bg-gray-300",    bg: "bg-gray-50",     text: "text-gray-500",    border: "border-gray-200" },
  PENDING_GO_NO_GO:  { label: "Pend. Go/No-Go", dot: "bg-amber-400",   bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200" },
  PLANNING:          { label: "Planejamento",   dot: "bg-blue-400",    bg: "bg-blue-50",     text: "text-blue-600",    border: "border-blue-200" },
  IN_PROGRESS:       { label: "Em Andamento",   dot: "bg-green-400",   bg: "bg-green-50",    text: "text-green-600",   border: "border-green-200" },
  PILOT:             { label: "Em Validação",   dot: "bg-cyan-400",    bg: "bg-cyan-50",     text: "text-cyan-600",    border: "border-cyan-200" },
  RAMP_UP:           { label: "Ramp-Up",        dot: "bg-indigo-400",  bg: "bg-indigo-50",   text: "text-indigo-600",  border: "border-indigo-200" },
  GO_LIVE:           { label: "GO LIVE",        dot: "bg-emerald-500", bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200" },
  POST_GOLIVE:       { label: "Pós GO LIVE",    dot: "bg-teal-400",    bg: "bg-teal-50",     text: "text-teal-600",    border: "border-teal-200" },
  COMPLETED:         { label: "Concluído",      dot: "bg-green-500",   bg: "bg-green-100",   text: "text-green-700",   border: "border-green-300" },
  ON_HOLD:           { label: "Em Espera",       dot: "bg-orange-400",  bg: "bg-orange-50",   text: "text-orange-600",  border: "border-orange-200" },
  FUTURE_ANALYSIS:   { label: "Análise Futura", dot: "bg-violet-500",  bg: "bg-violet-50",   text: "text-violet-700",  border: "border-violet-200" },
  PAUSED:            { label: "Pausado",        dot: "bg-slate-400",   bg: "bg-slate-100",   text: "text-slate-600",   border: "border-slate-300" },
}

interface StatusBadgeProps {
  status: string
  className?: string
  size?: "sm" | "md" | "lg"
  showDot?: boolean
}

export function StatusBadge({ status, className, size = "md", showDot = true }: StatusBadgeProps) {
  const c = STATUS_CONFIG[status] ?? {
    label: status, dot: "bg-gray-400", bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200"
  }
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 font-medium border rounded-full",
      size === "sm"  && "px-2 py-0.5 text-[10px]",
      size === "md"  && "px-2.5 py-1 text-xs",
      size === "lg"  && "px-3 py-1.5 text-sm",
      c.bg, c.text, c.border, className
    )}>
      {showDot && <span className={cn("rounded-full shrink-0", c.dot, size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2")} />}
      {c.label}
    </span>
  )
}
