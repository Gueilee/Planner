// frappe-gantt (MIT) não publica tipos — declaração mínima só com o que
// usamos em app/(dashboard)/projects/[id]/gantt/gantt-client.tsx. O motor
// de agendamento continua sendo o nosso (lib/domain/schedule-v2); esta lib
// só desenha o que já veio calculado do banco (Gantt é somente leitura).
declare module "frappe-gantt" {
  export type GanttTask = {
    id: string
    name: string
    start: string
    end: string
    progress?: number
    dependencies?: string
    custom_class?: string
  }

  export type GanttHolidayEntry = string | { date: string; name?: string }

  export type GanttOptions = {
    view_mode?: "Day" | "Week" | "Month" | "Quarter Day" | "Half Day" | "Year"
    view_mode_select?: boolean
    today_button?: boolean
    readonly?: boolean
    readonly_dates?: boolean
    readonly_progress?: boolean
    language?: string
    bar_height?: number
    padding?: number
    holidays?: Record<string, "weekend" | GanttHolidayEntry[]>
    is_weekend?: (d: Date) => boolean
    popup?: (ctx: {
      task: GanttTask
      chart: { options: GanttOptions }
      set_title: (t: string) => void
      set_subtitle: (t: string) => void
      set_details: (t: string) => void
    }) => void
    on_click?: (task: GanttTask) => void
    [key: string]: unknown
  }

  export default class Gantt {
    constructor(wrapper: string | HTMLElement | SVGElement, tasks: GanttTask[], options?: GanttOptions)
    change_view_mode(mode: string): void
    refresh(tasks: GanttTask[]): void
    scroll_current(): void
  }
}
