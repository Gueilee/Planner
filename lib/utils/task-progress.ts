export type AncestorUpdate = { id: string; progress: number; status: string }

export function deriveStatus(progress: number, currentStatus: string): string {
  if ((currentStatus === "DELAYED" || currentStatus === "ON_HOLD") && progress < 100) return currentStatus
  if (progress === 0) return "PLANNING"
  if (progress <= 89) return "IN_PROGRESS"
  if (progress <= 99) return "VALIDATION"
  return "COMPLETED"
}

export function deriveProgress(newStatus: string, currentProgress: number): number {
  if (newStatus === "PLANNING") return 0
  if (newStatus === "IN_PROGRESS") return currentProgress >= 1 && currentProgress <= 89 ? currentProgress : 1
  if (newStatus === "VALIDATION") return currentProgress >= 90 && currentProgress <= 99 ? currentProgress : 90
  if (newStatus === "COMPLETED") return 100
  return currentProgress // DELAYED, ON_HOLD
}
