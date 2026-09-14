"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Gantt, { type GanttTask } from "frappe-gantt"
import "./frappe-gantt-vendored.css"
import { CalendarClock, Info } from "lucide-react"
import { ToolbarBtn, ToolbarGroup } from "@/components/kronex/toolbar"
import { buildRows, predecessorsText } from "@/lib/export-schedule"
import type { ItemV2, DependencyV2 } from "@/lib/actions/schedule-v2"

type WorkCalendar = { diasUteis: number[]; holidays: { date: string; name?: string }[] }

// Mesma paleta já usada na impressão do Cronograma (app/(print)/public/
// schedule/[token]/page.tsx) — um único lugar de verdade pras cores por
// status seria melhor, mas os dois arquivos não compartilham módulo hoje
// (um é client component, outro Server Component de impressão); mantidos
// em sincronia manualmente, mesmo padrão já aceito nesta sessão.
const STATUS_LABELS: Record<string, string> = {
  A_INICIAR: "A Iniciar", EM_ANDAMENTO: "Em Andamento", VALIDACAO: "Em Validação",
  CONCLUIDO: "Concluído", PAUSADO: "Pausado", ATRASADO: "Atrasado",
}
const STATUS_CLASS: Record<string, string> = {
  A_INICIAR: "gantt-st-a-iniciar", EM_ANDAMENTO: "gantt-st-em-andamento", VALIDACAO: "gantt-st-validacao",
  CONCLUIDO: "gantt-st-concluido", PAUSADO: "gantt-st-pausado", ATRASADO: "gantt-st-atrasado",
}

const VIEW_MODES = [
  { key: "Day", label: "Dia" },
  { key: "Week", label: "Semana" },
  { key: "Month", label: "Mês" },
  { key: "Year", label: "Ano" },
] as const

function isoWeekday(d: Date): number {
  const day = d.getDay()
  return day === 0 ? 7 : day
}

export function GanttClient({ projectTitle, items, dependencies, workCalendar, membersById }: {
  projectTitle: string
  items: ItemV2[]
  dependencies: DependencyV2[]
  workCalendar: WorkCalendar
  membersById: Record<string, string>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const ganttRef = useRef<Gantt | null>(null)
  const [viewMode, setViewMode] = useState<(typeof VIEW_MODES)[number]["key"]>("Week")

  const rows = useMemo(() => buildRows(items), [items])
  const codeById = useMemo(() => new Map(items.map((it) => [it.id, it.code])), [items])

  // Só entram no desenho itens com data — item "não agendado" (regra §10
  // do motor) não quebra o Gantt, só não aparece; contamos pra avisar.
  // Precisa ser useMemo (não um `.filter` solto a cada render): vira
  // dependência do useEffect que (re)constrói o gráfico logo abaixo — uma
  // referência nova a cada render reconstruiria o Gantt inteiro à toa a
  // cada clique de zoom, e chegou a deixar cabeçalhos duplicados na tela.
  const scheduledRows = useMemo(
    () => rows.filter((r) => r.item.inicioEstimado && r.item.terminoEstimado),
    [rows],
  )
  const unscheduledCount = rows.length - scheduledRows.length
  const scheduledIds = useMemo(() => new Set(scheduledRows.map((r) => r.item.id)), [scheduledRows])

  const tasks: GanttTask[] = useMemo(() => scheduledRows.map(({ item, depth }) => {
    const preds = dependencies
      .filter((d) => d.successorId === item.id && scheduledIds.has(d.predecessorId))
      .map((d) => d.predecessorId)

    const indent = depth > 0 ? "—".repeat(depth) + " " : ""

    return {
      id: item.id,
      name: `${indent}${item.code} · ${item.title}`,
      start: item.inicioEstimado!,
      end: item.terminoEstimado!,
      progress: item.percentualCompleto,
      dependencies: preds.join(","),
      // Só a classe de status aqui — frappe-gantt faz classList.add(custom_class)
      // com o valor INTEIRO como um token só (não aceita "a b" espaçado, dá
      // InvalidCharacterError). Grupo/marco entram depois via classList.add
      // direto no elemento, num useEffect separado (ver abaixo).
      custom_class: STATUS_CLASS[item.status] ?? "gantt-st-a-iniciar",
    }
  }), [scheduledRows, dependencies, scheduledIds])

  const detailsById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])

  const isWeekendFn = useMemo(() => {
    const workDays = new Set(workCalendar.diasUteis)
    return (d: Date) => !workDays.has(isoWeekday(d))
  }, [workCalendar.diasUteis])

  useEffect(() => {
    if (!containerRef.current || tasks.length === 0) return
    // Limpa qualquer marcação deixada por uma montagem anterior — o
    // construtor do frappe-gantt escreve elementos direto no wrapper (não
    // só dentro do SVG) e não substitui sozinho; sem isto, o Strict Mode
    // do React (que monta/desmonta o efeito 2x em dev) deixava cabeçalhos
    // duplicados/sobrepostos na tela.
    containerRef.current.innerHTML = ""

    const instance = new Gantt(containerRef.current, tasks, {
      view_mode: viewMode,
      view_mode_select: false,
      today_button: false,
      readonly: true,
      readonly_dates: true,
      readonly_progress: true,
      bar_height: 26,
      padding: 16,
      language: "pt-BR",
      is_weekend: isWeekendFn,
      holidays: {
        "var(--g-weekend-highlight-color)": "weekend",
        "#FCA5A5": workCalendar.holidays.map((h) => ({ date: h.date, name: h.name ?? "Feriado" })),
      },
      popup: (ctx) => {
        const item = detailsById.get(ctx.task.id)
        if (!item) return
        ctx.set_title(`${item.code} · ${item.title}`)
        ctx.set_subtitle(STATUS_LABELS[item.status] ?? item.status)
        const responsavel = item.responsavelId ? membersById[item.responsavelId] : item.responsavelNome
        const preds = predecessorsText(item.id, dependencies, codeById)
        ctx.set_details(
          `${item.duracaoDiasUteis === 0 ? "Marco" : `${item.duracaoDiasUteis ?? "—"} dia(s) úteis`} · ${item.percentualCompleto}% concluído<br/>` +
          `${responsavel ? `Responsável: ${responsavel}<br/>` : ""}` +
          `${preds !== "—" ? `Predecessores: ${preds}` : "Sem predecessores"}`,
        )
      },
    })
    ganttRef.current = instance
    applyExtraClasses()

    return () => { ganttRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks])

  // Grupo (barra-resumo) e marco (losango) via classList.add direto no
  // elemento, um token por vez — não dá pra empilhar na string de
  // custom_class (frappe-gantt faz classList.add(custom_class) com o valor
  // INTEIRO como um token só, não aceita "a b" espaçado). Precisa rodar de
  // novo depois de QUALQUER change_view_mode — a troca de zoom chama
  // render() por dentro, que reconstrói as barras do zero e perde essas
  // classes extras (só a `custom_class` sobrevive, por vir da própria lib).
  function applyExtraClasses() {
    for (const { item } of scheduledRows) {
      if (!item.isGroup && item.duracaoDiasUteis !== 0) continue
      const el = containerRef.current?.querySelector(`.bar-wrapper[data-id="${item.id}"]`)
      el?.classList.add(item.isGroup ? "gantt-group" : "gantt-milestone")
    }
  }

  const isFirstViewModeRender = useRef(true)
  useEffect(() => {
    // Pula a primeira execução — o efeito de cima (dependente de `tasks`)
    // já constrói com o `viewMode` inicial certo; sem este guard, o React
    // roda os dois efeitos no mount e o change_view_mode redundante aqui
    // reconstruía as barras de novo, apagando as classes que acabaram de
    // ser aplicadas (era por isso que grupo/marco nunca apareciam certo).
    if (isFirstViewModeRender.current) { isFirstViewModeRender.current = false; return }
    ganttRef.current?.change_view_mode(viewMode)
    applyExtraClasses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-2.5 border-b border-slate-200 bg-white flex items-center flex-wrap gap-2">
        <ToolbarGroup>
          {VIEW_MODES.map((v) => (
            <ToolbarBtn key={v.key} wide ghost={viewMode !== v.key} onClick={() => setViewMode(v.key)} title={`Zoom por ${v.label.toLowerCase()}`}>
              {v.label}
            </ToolbarBtn>
          ))}
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarBtn ghost wide onClick={() => ganttRef.current?.scroll_current()} title="Rolar até a data de hoje">
            <CalendarClock className="w-3.5 h-3.5" /> Hoje
          </ToolbarBtn>
        </ToolbarGroup>

        {unscheduledCount > 0 && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 px-2">
            <Info className="w-3 h-3" /> {unscheduledCount} atividade{unscheduledCount > 1 ? "s" : ""} sem data — não {unscheduledCount > 1 ? "aparecem" : "aparece"} aqui
          </span>
        )}

        <div className="ml-auto flex items-center gap-3 text-[10px] font-bold text-slate-400 flex-wrap">
          <LegendItem color="#2563EB" label="Em andamento" />
          <LegendItem color="#059669" label="Concluído" />
          <LegendItem color="#DC2626" label="Atrasado" />
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-slate-700 rotate-45 shrink-0" /> Marco</span>
          <span className="flex items-center gap-1"><span className="w-3.5 h-1.5 rounded-sm bg-slate-500 shrink-0" /> Grupo (resumo)</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-white">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <p className="text-sm font-semibold text-slate-400 mb-1">Nenhuma atividade com data ainda</p>
            <p className="text-xs text-slate-400">Defina início/término no Cronograma pra elas aparecerem aqui.</p>
          </div>
        ) : (
          <div ref={containerRef} className="gantt-kronex" />
        )}
      </div>

      <style jsx global>{`
        .gantt-kronex {
          --g-bar-color: #EDE9FE;
          --g-bar-border: #C4B5FD;
          --g-progress-color: #7B2FBE;
          --g-arrow-color: #94A3B8;
          --g-today-highlight: #7B2FBE;
          --g-handle-color: #7B2FBE;
        }
        .gantt-kronex .gantt-container { width: 100%; border-radius: 0; }
        .gantt-kronex .bar-wrapper.gantt-st-em-andamento .bar { fill: #DBEAFE; stroke: #2563EB; }
        .gantt-kronex .bar-wrapper.gantt-st-em-andamento .bar-progress { fill: #2563EB; }
        .gantt-kronex .bar-wrapper.gantt-st-concluido .bar { fill: #D1FAE5; stroke: #059669; }
        .gantt-kronex .bar-wrapper.gantt-st-concluido .bar-progress { fill: #059669; }
        .gantt-kronex .bar-wrapper.gantt-st-atrasado .bar { fill: #FEE2E2; stroke: #DC2626; }
        .gantt-kronex .bar-wrapper.gantt-st-atrasado .bar-progress { fill: #DC2626; }
        .gantt-kronex .bar-wrapper.gantt-st-pausado .bar { fill: #FEF3C7; stroke: #D97706; }
        .gantt-kronex .bar-wrapper.gantt-st-pausado .bar-progress { fill: #D97706; }
        .gantt-kronex .bar-wrapper.gantt-st-validacao .bar { fill: #EDE9FE; stroke: #7C3AED; }
        .gantt-kronex .bar-wrapper.gantt-st-validacao .bar-progress { fill: #7C3AED; }
        .gantt-kronex .bar-wrapper.gantt-group .bar { fill: #475569; stroke: #334155; rx: 2; }
        .gantt-kronex .bar-wrapper.gantt-group .bar-progress { fill: #1E293B; }
        .gantt-kronex .bar-wrapper.gantt-milestone .bar,
        .gantt-kronex .bar-wrapper.gantt-milestone .bar-progress {
          clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
        }
        .gantt-kronex .bar-wrapper.gantt-milestone .bar { fill: #334155; stroke: #334155; }
      `}</style>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
      {label}
    </span>
  )
}
