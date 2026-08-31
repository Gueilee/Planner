// Álgebra pura da Curva S — extraída de lib/actions/s-curve.ts para ser
// importável também por Server Components que não são "use server" (ex.:
// app/(dashboard)/status-report/page.tsx), garantindo que a Curva S da
// apresentação de Status Report use exatamente a mesma matemática da tela
// dedicada de Curva S dentro do projeto (nunca uma reimplementação divergente).

export type RawTask = {
  id: string
  startDate: Date | null
  endDate: Date | null
  actualStart: Date | null
  actualEnd: Date | null
  completedAt: Date | null
  status: string
  progress: number
}

export function linearFraction(s: Date, e: Date, T: Date): number {
  if (T <= s) return 0
  if (T >= e) return 1
  const span = e.getTime() - s.getTime()
  if (span <= 0) return 1
  return (T.getTime() - s.getTime()) / span
}

// % esperado por tarefa (tempo decorrido ÷ duração) — mesma lógica de
// computeExpectedPct (lib/utils/schedule-status.ts), aplicada a cada ponto da
// série em vez de só "hoje". Média simples entre as tarefas.
export function computePlanned(tasks: RawTask[], timePoints: Date[]): number[] {
  const withDates = tasks.filter((t) => t.endDate)
  if (withDates.length === 0) return timePoints.map(() => 0)
  return timePoints.map((T) => {
    const sum = withDates.reduce((s, t) => {
      const start = t.startDate ?? t.endDate!
      return s + linearFraction(start, t.endDate!, T) * 100
    }, 0)
    return Math.round(sum / withDates.length)
  })
}

// % realizado por tarefa, reconstruído no tempo: 0 antes de começar, sobe
// linearmente de 0 até o progresso ATUAL da tarefa entre o início real e a
// conclusão (ou "hoje", se ainda em andamento) — por isso, no ponto "hoje",
// o valor de cada tarefa é exatamente o seu progress atual, e a média
// simples das tarefas-folha fecha exatamente com o % do Cronograma.
export function computeRealized(tasks: RawTask[], timePoints: Date[], today: Date): (number | null)[] {
  if (tasks.length === 0) return timePoints.map(() => 0)

  return timePoints.map((T) => {
    if (T > today) return null

    const sum = tasks.reduce((s, t) => {
      if (!t.actualStart || t.actualStart > T) return s
      if (t.progress <= 0) return s

      const rampEnd = t.completedAt ?? t.actualEnd ?? today
      if (!(rampEnd > t.actualStart) || !(T < rampEnd)) return s + t.progress

      const elapsed = (T.getTime() - t.actualStart.getTime()) / (rampEnd.getTime() - t.actualStart.getTime())
      return s + t.progress * elapsed
    }, 0)

    return Math.round(sum / tasks.length)
  })
}

export function computeBaselineCurve(
  snaps: { plannedStart: Date | null; plannedEnd: Date }[],
  timePoints: Date[]
): number[] {
  if (snaps.length === 0) return timePoints.map(() => 0)
  return timePoints.map((T) => {
    const sum = snaps.reduce((s, snap) => {
      const start = snap.plannedStart ?? snap.plannedEnd
      return s + linearFraction(start, snap.plannedEnd, T) * 100
    }, 0)
    return Math.round(sum / snaps.length)
  })
}
