import ExcelJS from "exceljs"
import { format, differenceInDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { fmtDateLong, parseDateStr } from "@/lib/date-utils"

type Task = {
  id: string
  wbsAreaId: string | null
  parentId: string | null
  title: string
  responsible: { id: string; name: string } | null
  startDate: string | null
  endDate: string | null
  actualStart: string | null
  actualEnd: string | null
  estimatedEffort: number | null
  actualEffort: number | null
  status: string
  progress: number
  order: number
  dependencies: string[]
}

type Area = { id: string; name: string; color: string | null }

const STATUS_LABELS: Record<string, string> = {
  PLANNING:    "A Iniciar",
  IN_PROGRESS: "Em Andamento",
  COMPLETED:   "Concluído",
  DELAYED:     "Atrasado",
  VALIDATION:  "Validação",
  ON_HOLD:     "Pausada",
}

// hex #RRGGBB → ExcelJS ARGB (FF prefix)
function toArgb(hex: string | null | undefined, alpha = "FF"): string {
  if (!hex) return "FF94A3B8"
  const h = hex.replace("#", "")
  return `${alpha}${h.toUpperCase().padStart(6, "0")}`
}

// Darken a hex color for text on light bg
function lightenHex(hex: string, amount = 0.85): string {
  const h = hex.replace("#", "")
  const r = Math.min(255, Math.round(parseInt(h.slice(0, 2), 16) + (255 - parseInt(h.slice(0, 2), 16)) * amount))
  const g = Math.min(255, Math.round(parseInt(h.slice(2, 4), 16) + (255 - parseInt(h.slice(2, 4), 16)) * amount))
  const b = Math.min(255, Math.round(parseInt(h.slice(4, 6), 16) + (255 - parseInt(h.slice(4, 6), 16)) * amount))
  return `FF${r.toString(16).padStart(2, "0").toUpperCase()}${g.toString(16).padStart(2, "0").toUpperCase()}${b.toString(16).padStart(2, "0").toUpperCase()}`
}

function fmtDate(ds: string | null) {
  return fmtDateLong(ds)
}

function calcEstimatedProgress(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null
  const start = parseDateStr(startDate)
  const end   = parseDateStr(endDate)
  const today = new Date()
  const total = differenceInDays(end, start)
  if (total <= 0) return null
  return Math.max(0, Math.min(100, Math.round((differenceInDays(today, start) / total) * 100)))
}

// Build ordered list: [area, ...tasks, area, ...tasks, ...]
type ExportRow =
  | { kind: "area"; area: Area; index: number; taskCount: number; doneCount: number }
  | { kind: "task"; task: Task; eap: string; depth: number; areaIndex: number }

function buildRows(areas: Area[], tasks: Task[]): ExportRow[] {
  const rows: ExportRow[] = []
  const childrenMap = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!t.parentId) continue
    if (!childrenMap.has(t.parentId)) childrenMap.set(t.parentId, [])
    childrenMap.get(t.parentId)!.push(t)
  }
  const sortBy = (arr: Task[]) => [...arr].sort((a, b) => a.order - b.order)

  function walkTask(t: Task, depth: number, eap: string, areaIndex: number) {
    rows.push({ kind: "task", task: t, eap, depth, areaIndex })
    const kids = sortBy(childrenMap.get(t.id) ?? [])
    kids.forEach((k, i) => walkTask(k, depth + 1, `${eap}.${i + 1}`, areaIndex))
  }

  const topByArea = new Map<string | null, Task[]>()
  for (const t of tasks) {
    if (t.parentId) continue
    const k = t.wbsAreaId ?? null
    if (!topByArea.has(k)) topByArea.set(k, [])
    topByArea.get(k)!.push(t)
  }

  areas.forEach((area, aIdx) => {
    const areaTasks  = tasks.filter((t) => t.wbsAreaId === area.id)
    const doneCount  = areaTasks.filter((t) => t.status === "COMPLETED").length
    rows.push({ kind: "area", area, index: aIdx + 1, taskCount: areaTasks.length, doneCount })
    sortBy(topByArea.get(area.id) ?? []).forEach((t, i) =>
      walkTask(t, 0, `${aIdx + 1}.${i + 1}`, aIdx + 1)
    )
  })

  // Ungrouped tasks
  const ungrouped = sortBy(topByArea.get(null) ?? [])
  if (ungrouped.length > 0) {
    const ugIdx = areas.length + 1
    rows.push({ kind: "area", area: { id: "__ug__", name: "Sem Área", color: "#94A3B8" }, index: ugIdx, taskCount: ungrouped.length, doneCount: ungrouped.filter((t) => t.status === "COMPLETED").length })
    ungrouped.forEach((t, i) => walkTask(t, 0, `${ugIdx}.${i + 1}`, ugIdx))
  }

  return rows
}

export async function exportScheduleToExcel(
  projectTitle: string,
  areas: Area[],
  tasks: Task[],
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator  = "Kronex · Vendemmia"
  wb.created  = new Date()
  wb.modified = new Date()

  const ws = wb.addWorksheet("Cronograma", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
    },
    views: [{ state: "frozen", ySplit: 4 }],
  })

  // ── Column widths ─────────────────────────────────────────────────────────
  ws.columns = [
    { key: "eap",       width: 8  },  // A - EAP
    { key: "name",      width: 42 },  // B - Nome
    { key: "tipo",      width: 12 },  // C - Tipo
    { key: "status",    width: 18 },  // D - Status
    { key: "resp",      width: 22 },  // E - Responsável
    { key: "startPlan", width: 14 },  // F - Início Planejado
    { key: "endPlan",   width: 14 },  // G - Fim Planejado
    { key: "startReal", width: 14 },  // H - Início Real
    { key: "endReal",   width: 14 },  // I - Fim Real
    { key: "estH",      width: 12 },  // J - Est. h
    { key: "realH",     width: 12 },  // K - Real h
    { key: "pctEst",    width: 12 },  // L - % Estimado
    { key: "pctReal",   width: 12 },  // M - % Completo
    { key: "pred",      width: 30 },  // N - Predecessoras
  ]

  const TOTAL_COLS = 14

  // ── Row 1: Project title ──────────────────────────────────────────────────
  const titleRow = ws.addRow(["Cronograma — " + projectTitle])
  ws.mergeCells(1, 1, 1, TOTAL_COLS)
  titleRow.height = 32
  const titleCell = titleRow.getCell(1)
  titleCell.font  = { name: "Calibri", size: 15, bold: true, color: { argb: "FFFFFFFF" } }
  titleCell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 2 }

  // ── Row 2: Metadata ───────────────────────────────────────────────────────
  const metaRow = ws.addRow([
    `Exportado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}   ·   ${tasks.length} atividades   ·   ${tasks.filter((t) => t.status === "COMPLETED").length} concluídas`
  ])
  ws.mergeCells(2, 1, 2, TOTAL_COLS)
  metaRow.height = 18
  const metaCell = metaRow.getCell(1)
  metaCell.font  = { name: "Calibri", size: 9, italic: true, color: { argb: "FF94A3B8" } }
  metaCell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }
  metaCell.alignment = { vertical: "middle", horizontal: "left", indent: 2 }

  // ── Row 3: Empty spacer ───────────────────────────────────────────────────
  const spacer = ws.addRow([])
  ws.mergeCells(3, 1, 3, TOTAL_COLS)
  spacer.height = 4
  spacer.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }

  // ── Row 4: Column headers ─────────────────────────────────────────────────
  const HDR_COLS: { label: string; color?: string }[] = [
    { label: "EAP"                },
    { label: "Nome da Atividade"  },
    { label: "Tipo"               },
    { label: "Status"             },
    { label: "Responsável"        },
    { label: "Início Plan."       },
    { label: "Fim Plan."          },
    { label: "Início Real",  color: "FF059669" },
    { label: "Fim Real",     color: "FF059669" },
    { label: "Est. (h)",     color: "FF7B2FBE" },
    { label: "Real (h)",     color: "FF7B2FBE" },
    { label: "% Estimado",   color: "FFB45309" },
    { label: "% Completo"   },
    { label: "Predecessoras", color: "FF4338CA" },
  ]

  const hdrRow = ws.addRow(HDR_COLS.map((c) => c.label))
  hdrRow.height = 26
  hdrRow.eachCell((cell, colN) => {
    const cfg = HDR_COLS[colN - 1]
    cell.font      = { name: "Calibri", size: 9, bold: true, color: { argb: cfg?.color ?? "CCFFFFFF" } }
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false }
    cell.border    = { bottom: { style: "thin", color: { argb: "33FFFFFF" } } }
  })

  // ── Data rows ─────────────────────────────────────────────────────────────
  const rows = buildRows(areas, tasks)
  let dataRowIndex = 5 // row 1–4 already added

  for (const row of rows) {
    if (row.kind === "area") {
      const { area, index, taskCount, doneCount } = row
      const progress = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0
      const areaColor = area.color ?? "#94A3B8"
      const bgArgb    = lightenHex(areaColor, 0.88)

      const excelRow = ws.addRow([
        `${index}`,
        area.name,
        "Módulo",
        `${doneCount}/${taskCount} (${progress}%)`,
        "", "", "", "", "", "", "", "", "", "",
      ])
      excelRow.height = 24

      excelRow.eachCell({ includeEmpty: true }, (cell, colN) => {
        cell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } }
        cell.font  = {
          name: "Calibri", size: 9, bold: true,
          color: { argb: toArgb(areaColor) },
        }
        cell.border = {
          top:    { style: "thin",   color: { argb: toArgb(areaColor, "40") } },
          bottom: { style: "thin",   color: { argb: toArgb(areaColor, "40") } },
          left:   colN === 1 ? { style: "medium", color: { argb: toArgb(areaColor) } } : undefined,
        }
        cell.alignment = colN === 1 ? { vertical: "middle", horizontal: "center" }
          : colN === 2              ? { vertical: "middle", horizontal: "left",   indent: 1 }
          : { vertical: "middle", horizontal: "center" }
      })

      dataRowIndex++
    } else {
      const { task: t, eap, depth, areaIndex } = row
      const isTarefa  = depth > 0
      const isDone    = t.status === "COMPLETED"
      const isDelayed = t.status === "DELAYED" || (!isDone && t.endDate && new Date(t.endDate) < new Date())

      const bgArgb    = isTarefa ? "FFF7F5FF" : dataRowIndex % 2 === 0 ? "FFFFFFFF" : "FFFAFBFD"
      const fontColor = isDone ? "FF94A3B8" : isDelayed ? "FFEF4444" : "FF0F172A"

      // Predecessoras: resolve names
      const predNames = t.dependencies.length
        ? t.dependencies.map((depId) => {
            const dep = tasks.find((x) => x.id === depId)
            return dep ? dep.title : depId
          }).join("; ")
        : "—"

      const ep    = calcEstimatedProgress(t.startDate, t.endDate)
      const over  = t.actualEffort != null && t.estimatedEffort != null && t.actualEffort > t.estimatedEffort

      // Status label + color
      const statusLabel = STATUS_LABELS[t.status] ?? t.status
      const statusColor: Record<string, string> = {
        PLANNING:    "FF64748B",
        IN_PROGRESS: "FF2463FF",
        COMPLETED:   "FF10B981",
        DELAYED:     "FFEF4444",
        VALIDATION:  "FF8B5CF6",
        ON_HOLD:     "FFF59E0B",
      }

      const indent = depth > 0 ? "  ".repeat(depth) : ""

      const excelRow = ws.addRow([
        eap,
        indent + t.title,
        isTarefa ? "Tarefa" : "Atividade",
        statusLabel,
        t.responsible?.name ?? "—",
        fmtDate(t.startDate),
        fmtDate(t.endDate),
        fmtDate(t.actualStart),
        fmtDate(t.actualEnd),
        t.estimatedEffort != null ? t.estimatedEffort : null,
        t.actualEffort != null    ? t.actualEffort    : null,
        ep != null ? ep / 100 : null,
        t.progress / 100,
        predNames,
      ])
      excelRow.height = 20

      excelRow.eachCell({ includeEmpty: true }, (cell, colN) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } }

        const baseFont = { name: "Calibri", size: 9, color: { argb: fontColor } }

        if (colN === 1) {
          // EAP — monospace look
          cell.font = { ...baseFont, color: { argb: "FFCBD5E1" } }
          cell.alignment = { vertical: "middle", horizontal: "center" }
        } else if (colN === 2) {
          // Name
          cell.font = { ...baseFont, bold: !isTarefa && !isDone, italic: isDone }
          cell.alignment = { vertical: "middle", horizontal: "left" }
        } else if (colN === 3) {
          // Tipo badge
          cell.font = { ...baseFont, bold: true, size: 8,
            color: { argb: isTarefa ? "FF7C3AED" : "FF1D4ED8" } }
          cell.alignment = { vertical: "middle", horizontal: "center" }
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isTarefa ? "FFEDE9FE" : "FFDBEAFE" } }
        } else if (colN === 4) {
          // Status badge
          const sc = statusColor[t.status] ?? "FF64748B"
          cell.font = { ...baseFont, bold: true, size: 8, color: { argb: sc } }
          cell.alignment = { vertical: "middle", horizontal: "center" }
        } else if (colN === 5) {
          // Responsável
          cell.font = { ...baseFont, size: 9 }
          cell.alignment = { vertical: "middle", horizontal: "left" }
        } else if (colN === 6 || colN === 7) {
          // Datas planejadas
          cell.font = { ...baseFont, color: { argb: isDelayed && colN === 7 ? "FFEF4444" : "FF475569" } }
          cell.alignment = { vertical: "middle", horizontal: "center" }
        } else if (colN === 8 || colN === 9) {
          // Datas reais
          cell.font = { ...baseFont, color: { argb: "FF059669" } }
          cell.alignment = { vertical: "middle", horizontal: "center" }
        } else if (colN === 10) {
          // Est h
          cell.font = { ...baseFont, color: { argb: "FF7B2FBE" } }
          cell.numFmt = '#,##0.0"h"'
          cell.alignment = { vertical: "middle", horizontal: "center" }
        } else if (colN === 11) {
          // Real h
          cell.font = { ...baseFont, bold: over, color: { argb: over ? "FFEF4444" : "FF7B2FBE" } }
          cell.numFmt = '#,##0.0"h"'
          cell.alignment = { vertical: "middle", horizontal: "center" }
        } else if (colN === 12) {
          // % Estimado
          cell.numFmt = "0%"
          cell.font = { ...baseFont, bold: true, color: { argb: "FFB45309" } }
          cell.alignment = { vertical: "middle", horizontal: "center" }
        } else if (colN === 13) {
          // % Completo — progress bar via solid fill gradation
          cell.numFmt = "0%"
          cell.font = { ...baseFont, bold: true, color: { argb: isDone ? "FF10B981" : "FF2463FF" } }
          cell.alignment = { vertical: "middle", horizontal: "center" }
        } else if (colN === 14) {
          // Predecessoras
          cell.font = { ...baseFont, color: { argb: t.dependencies.length > 0 ? "FF4338CA" : "FFCBD5E1" }, size: 8 }
          cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true }
        }

        cell.border = {
          bottom: { style: "hair", color: { argb: "FFF1F5F9" } },
          left:   colN === 1 ? { style: "thin", color: { argb: "FFE2E8F0" } } : undefined,
          right:  colN === TOTAL_COLS ? { style: "thin", color: { argb: "FFE2E8F0" } } : undefined,
        }
      })

      dataRowIndex++
    }
  }

  // ── Print settings ────────────────────────────────────────────────────────
  ws.headerFooter.oddHeader = `&L&"Calibri,Bold"&9${projectTitle}&R&"Calibri"&8Kronex · Vendemmia`
  ws.headerFooter.oddFooter = `&L&"Calibri"&8Cronograma exportado em ${format(new Date(), "dd/MM/yyyy", { locale: ptBR })}&R&"Calibri"&8Página &P de &N`

  // ── Download ──────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement("a")
  a.href       = url
  a.download   = `Cronograma - ${projectTitle} - ${format(new Date(), "yyyy-MM-dd")}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
