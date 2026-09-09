// Exportação do Cronograma (motor v2) para Excel — roda no navegador
// (usa document/URL.createObjectURL), chamada direto do botão "Exportar
// Excel" em schedule-v2-client.tsx, com os dados já carregados na tela
// (sem round-trip ao servidor).
import ExcelJS from "exceljs"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { fmtDateLong, parseDateStr } from "@/lib/date-utils"
import { computeExpectedPct } from "@/lib/utils/schedule-status"
import type { ItemV2, DependencyV2 } from "@/lib/actions/schedule-v2"

const STATUS_LABELS: Record<string, string> = {
  A_INICIAR: "A Iniciar",
  EM_ANDAMENTO: "Em Andamento",
  VALIDACAO: "Em Validação",
  CONCLUIDO: "Concluído",
  PAUSADO: "Pausado",
  ATRASADO: "Atrasado",
}
const STATUS_COLORS: Record<string, string> = {
  A_INICIAR: "FF64748B",
  EM_ANDAMENTO: "FF2563EB",
  VALIDACAO: "FF7C3AED",
  CONCLUIDO: "FF059669",
  PAUSADO: "FFD97706",
  ATRASADO: "FFDC2626",
}

function fmtDate(ds: string | null): string {
  return fmtDateLong(ds)
}

// Monta a lista em ordem hierárquica (pai antes dos filhos, respeitando
// `order` entre irmãos) — a mesma árvore mostrada na tela, sem depender de
// um índice "1.2.3" sintético (o item já tem um código estável, "A1"...).
type ExportRow = { item: ItemV2; depth: number }

function buildRows(items: ItemV2[]): ExportRow[] {
  const rows: ExportRow[] = []
  const childrenByParent = new Map<string, ItemV2[]>()
  for (const it of items) {
    if (!it.parentId) continue
    childrenByParent.set(it.parentId, [...(childrenByParent.get(it.parentId) ?? []), it])
  }
  const sortByOrder = (arr: ItemV2[]) => [...arr].sort((a, b) => a.order - b.order)

  function walk(it: ItemV2, depth: number) {
    rows.push({ item: it, depth })
    for (const child of sortByOrder(childrenByParent.get(it.id) ?? [])) walk(child, depth + 1)
  }

  for (const root of sortByOrder(items.filter((it) => !it.parentId))) walk(root, 0)
  return rows
}

// "A2ss+1" etc. — mesma sintaxe de predecessor usada na tela.
function predecessorsText(itemId: string, deps: DependencyV2[], codeById: Map<string, string>): string {
  const mine = deps.filter((d) => d.successorId === itemId)
  if (mine.length === 0) return "—"
  return mine
    .map((d) => {
      const code = codeById.get(d.predecessorId) ?? "?"
      const suffix = d.type === "FS" && d.lagDiasUteis === 0
        ? ""
        : d.type.toLowerCase() + (d.lagDiasUteis !== 0 ? (d.lagDiasUteis > 0 ? `+${d.lagDiasUteis}` : `${d.lagDiasUteis}`) : "")
      return code + suffix
    })
    .join("; ")
}

export async function exportScheduleToExcel(
  projectTitle: string,
  items: ItemV2[],
  dependencies: DependencyV2[],
  membersById: Map<string, string>,
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator  = "Kronex · Vendemmia"
  wb.created  = new Date()
  wb.modified = new Date()

  const ws = wb.addWorksheet("Cronograma", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    views: [{ state: "frozen", ySplit: 4 }],
  })

  // ── Larguras de coluna ─────────────────────────────────────────────────
  ws.columns = [
    { key: "code",      width: 8  },  // A - Código
    { key: "name",       width: 42 },  // B - Atividade
    { key: "tipo",       width: 12 },  // C - Tipo
    { key: "status",     width: 16 },  // D - Status
    { key: "resp",       width: 22 },  // E - Responsável
    { key: "dur",        width: 10 },  // F - Duração
    { key: "startPlan",  width: 14 },  // G - Início Planejado
    { key: "endPlan",    width: 14 },  // H - Término Planejado
    { key: "startReal",  width: 14 },  // I - Início Real
    { key: "endReal",    width: 14 },  // J - Término Real
    { key: "estH",       width: 12 },  // K - Esforço Est.
    { key: "realH",      width: 12 },  // L - Esforço Real
    { key: "pctEst",     width: 12 },  // M - % Esperado
    { key: "pctReal",    width: 12 },  // N - % Completo
    { key: "pred",       width: 26 },  // O - Predecessores
  ]
  const TOTAL_COLS = 15

  // ── Linha 1: título do projeto ─────────────────────────────────────────
  const titleRow = ws.addRow([`Cronograma — ${projectTitle}`])
  ws.mergeCells(1, 1, 1, TOTAL_COLS)
  titleRow.height = 32
  const titleCell = titleRow.getCell(1)
  titleCell.font = { name: "Calibri", size: 15, bold: true, color: { argb: "FFFFFFFF" } }
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 2 }

  // ── Linha 2: metadados ──────────────────────────────────────────────────
  const leafCount = items.filter((it) => !it.isGroup).length
  const doneCount = items.filter((it) => !it.isGroup && it.status === "CONCLUIDO").length
  const metaRow = ws.addRow([
    `Exportado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}   ·   ${leafCount} tarefas   ·   ${doneCount} concluídas`,
  ])
  ws.mergeCells(2, 1, 2, TOTAL_COLS)
  metaRow.height = 18
  const metaCell = metaRow.getCell(1)
  metaCell.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF94A3B8" } }
  metaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }
  metaCell.alignment = { vertical: "middle", horizontal: "left", indent: 2 }

  // ── Linha 3: espaçador ──────────────────────────────────────────────────
  const spacer = ws.addRow([])
  ws.mergeCells(3, 1, 3, TOTAL_COLS)
  spacer.height = 4
  spacer.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }

  // ── Linha 4: cabeçalho das colunas ──────────────────────────────────────
  const HDR_COLS: { label: string; color?: string }[] = [
    { label: "Código" },
    { label: "Atividade" },
    { label: "Tipo" },
    { label: "Status" },
    { label: "Responsável" },
    { label: "Duração" },
    { label: "Início Plan." },
    { label: "Término Plan." },
    { label: "Início Real", color: "FF059669" },
    { label: "Término Real", color: "FF059669" },
    { label: "Esf. Est. (h)", color: "FF7B2FBE" },
    { label: "Esf. Real (h)", color: "FF7B2FBE" },
    { label: "% Esperado", color: "FFB45309" },
    { label: "% Completo" },
    { label: "Predecessores", color: "FF4338CA" },
  ]
  const hdrRow = ws.addRow(HDR_COLS.map((c) => c.label))
  hdrRow.height = 26
  hdrRow.eachCell((cell, colN) => {
    const cfg = HDR_COLS[colN - 1]
    cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: cfg?.color ?? "CCFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }
    cell.alignment = { vertical: "middle", horizontal: "center" }
    cell.border = { bottom: { style: "thin", color: { argb: "33FFFFFF" } } }
  })

  // ── Linhas de dados ───────────────────────────────────────────────────
  const codeById = new Map(items.map((it) => [it.id, it.code]))
  const rows = buildRows(items)
  let dataRowIndex = 5

  const today = new Date()
  for (const { item: it, depth } of rows) {
    const isGroup   = it.isGroup
    const isDone    = it.status === "CONCLUIDO"
    const isDelayed = it.status === "ATRASADO" || (!isDone && it.terminoEstimado && parseDateStr(it.terminoEstimado) < today)

    const bgArgb    = isGroup ? "FFF7F5FF" : dataRowIndex % 2 === 0 ? "FFFFFFFF" : "FFFAFBFD"
    const fontColor = isDone ? "FF94A3B8" : isDelayed ? "FFEF4444" : "FF0F172A"

    const responsavel = it.responsavelId
      ? (membersById.get(it.responsavelId) ?? "—")
      : (it.responsavelNome ?? "—")

    const expectedPct = computeExpectedPct(
      it.inicioEstimado ? parseDateStr(it.inicioEstimado) : null,
      it.terminoEstimado ? parseDateStr(it.terminoEstimado) : null,
      today,
    )
    const over = it.esforcoRealH > 0 && it.esforcoEstimadoH > 0 && it.esforcoRealH > it.esforcoEstimadoH

    const indent = depth > 0 ? "  ".repeat(depth) : ""
    const excelRow = ws.addRow([
      it.code,
      indent + it.title,
      isGroup ? "Atividade" : "Tarefa",
      STATUS_LABELS[it.status] ?? it.status,
      responsavel,
      it.duracaoDiasUteis != null ? it.duracaoDiasUteis : null,
      fmtDate(it.inicioEstimado),
      fmtDate(it.terminoEstimado),
      fmtDate(it.inicioReal),
      fmtDate(it.terminoReal),
      it.esforcoEstimadoH || null,
      it.esforcoRealH || null,
      expectedPct != null ? expectedPct / 100 : null,
      it.percentualCompleto / 100,
      predecessorsText(it.id, dependencies, codeById),
    ])
    excelRow.height = 20

    excelRow.eachCell({ includeEmpty: true }, (cell, colN) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } }
      const baseFont = { name: "Calibri", size: 9, color: { argb: fontColor } }

      if (colN === 1) {
        cell.font = { ...baseFont, color: { argb: "FFCBD5E1" } }
        cell.alignment = { vertical: "middle", horizontal: "center" }
      } else if (colN === 2) {
        cell.font = { ...baseFont, bold: isGroup && !isDone, italic: isDone }
        cell.alignment = { vertical: "middle", horizontal: "left" }
      } else if (colN === 3) {
        cell.font = { ...baseFont, bold: true, size: 8, color: { argb: isGroup ? "FF1D4ED8" : "FF7C3AED" } }
        cell.alignment = { vertical: "middle", horizontal: "center" }
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isGroup ? "FFDBEAFE" : "FFEDE9FE" } }
      } else if (colN === 4) {
        const sc = STATUS_COLORS[it.status] ?? "FF64748B"
        cell.font = { ...baseFont, bold: true, size: 8, color: { argb: sc } }
        cell.alignment = { vertical: "middle", horizontal: "center" }
      } else if (colN === 5) {
        cell.font = { ...baseFont, size: 9 }
        cell.alignment = { vertical: "middle", horizontal: "left" }
      } else if (colN === 6) {
        cell.font = { ...baseFont, color: { argb: "FF475569" } }
        cell.alignment = { vertical: "middle", horizontal: "center" }
        if (it.duracaoDiasUteis === 0) cell.value = "Marco"
      } else if (colN === 7 || colN === 8) {
        cell.font = { ...baseFont, color: { argb: isDelayed && colN === 8 ? "FFEF4444" : "FF475569" } }
        cell.alignment = { vertical: "middle", horizontal: "center" }
      } else if (colN === 9 || colN === 10) {
        cell.font = { ...baseFont, color: { argb: "FF059669" } }
        cell.alignment = { vertical: "middle", horizontal: "center" }
      } else if (colN === 11) {
        cell.font = { ...baseFont, color: { argb: "FF7B2FBE" } }
        cell.numFmt = '#,##0.0"h"'
        cell.alignment = { vertical: "middle", horizontal: "center" }
      } else if (colN === 12) {
        cell.font = { ...baseFont, bold: over, color: { argb: over ? "FFEF4444" : "FF7B2FBE" } }
        cell.numFmt = '#,##0.0"h"'
        cell.alignment = { vertical: "middle", horizontal: "center" }
      } else if (colN === 13) {
        cell.numFmt = "0%"
        cell.font = { ...baseFont, bold: true, color: { argb: "FFB45309" } }
        cell.alignment = { vertical: "middle", horizontal: "center" }
      } else if (colN === 14) {
        cell.numFmt = "0%"
        cell.font = { ...baseFont, bold: true, color: { argb: isDone ? "FF10B981" : "FF2463FF" } }
        cell.alignment = { vertical: "middle", horizontal: "center" }
      } else if (colN === 15) {
        cell.font = { ...baseFont, color: { argb: "FF4338CA" }, size: 8 }
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

  // ── Impressão ────────────────────────────────────────────────────────
  ws.headerFooter.oddHeader = `&L&"Calibri,Bold"&9${projectTitle}&R&"Calibri"&8Kronex · Vendemmia`
  ws.headerFooter.oddFooter = `&L&"Calibri"&8Cronograma exportado em ${format(new Date(), "dd/MM/yyyy", { locale: ptBR })}&R&"Calibri"&8Página &P de &N`

  // ── Download ─────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `Cronograma - ${projectTitle} - ${format(new Date(), "yyyy-MM-dd")}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
