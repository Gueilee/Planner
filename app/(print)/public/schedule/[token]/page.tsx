import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { buildRows, predecessorsText } from "@/lib/export-schedule"
import { fmtDateLong } from "@/lib/date-utils"
import type { ItemV2, DependencyV2 } from "@/lib/actions/schedule-v2"
import { PrintButton } from "../../../closure/print-button"

export const dynamic = "force-dynamic"
export const metadata = { title: "Cronograma" }

// Rota PÚBLICA de propósito — sem auth() nenhum. Só o token (permanente,
// gerado sob demanda no botão "Gerar Link Público" do Cronograma) decide
// o acesso; ver PUBLIC_ROUTES em auth.config.ts. Não mostra custo/
// orçamento (budgetedCost/actualCost) nem esforço em horas — só o que um
// stakeholder externo precisa pra acompanhar prazo e progresso.

const STATUS_LABELS: Record<string, string> = {
  A_INICIAR: "A Iniciar", EM_ANDAMENTO: "Em Andamento", VALIDACAO: "Em Validação",
  CONCLUIDO: "Concluído", PAUSADO: "Pausado", ATRASADO: "Atrasado",
}
const STATUS_COLORS: Record<string, string> = {
  A_INICIAR: "#64748B", EM_ANDAMENTO: "#2563EB", VALIDACAO: "#7C3AED",
  CONCLUIDO: "#059669", PAUSADO: "#D97706", ATRASADO: "#DC2626",
}

function dstr(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; background: #F8FAFC; color: #0F172A; }
  @page { size: A4 landscape; margin: 14mm 10mm; }
  @media print { .no-print { display: none !important; } body { background: white; } }
  .wrap { max-width: 1400px; margin: 0 auto; padding: 24px; }
  .hdr { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px; }
  .hdr h1 { font-size: 20px; font-weight: 900; margin: 0; }
  .hdr .meta { font-size: 11px; color: #94A3B8; }
  .sub { font-size: 12px; color: #64748B; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; background: white; }
  thead th { background: #1E293B; color: white; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 9px; padding: 8px 10px; text-align: left; }
  tbody td { padding: 6px 10px; border-bottom: 1px solid #F1F5F9; vertical-align: top; }
  tbody tr:nth-child(even) { background: #FAFBFC; }
  .grp td { font-weight: 800; background: #F5F3FF !important; }
  .status-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 700; }
  .center { text-align: center; }
  .print-btn {
    position: fixed; bottom: 28px; right: 28px; z-index: 999;
    display: flex; align-items: center; gap: 8px;
    background: linear-gradient(135deg, #1E1B4B, #3730A3); color: white;
    border: none; border-radius: 14px; padding: 12px 22px;
    font-size: 13px; font-weight: 700; cursor: pointer;
    box-shadow: 0 8px 32px rgba(30,27,75,0.40);
  }
`

export default async function PublicSchedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const project = await db.project.findUnique({ where: { publicScheduleToken: token }, select: { id: true, title: true } })
  if (!project) notFound()

  const rows = await db.scheduleV2Item.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" } })
  const deps = await db.scheduleV2Dependency.findMany({ where: { successor: { projectId: project.id } } })

  const childrenCount = new Map<string, number>()
  for (const r of rows) if (r.parentId) childrenCount.set(r.parentId, (childrenCount.get(r.parentId) ?? 0) + 1)
  const groupIds = new Set([...childrenCount.keys()])

  const items: ItemV2[] = rows.map((r) => ({
    id: r.id, code: r.code, projectId: r.projectId, parentId: r.parentId, order: r.order,
    title: r.title, status: r.status, responsavelId: r.responsavelId, responsavelNome: r.responsavelNome,
    participantes: r.participantes, duracaoDiasUteis: r.duracaoDiasUteis,
    inicioEstimado: dstr(r.inicioEstimado), terminoEstimado: dstr(r.terminoEstimado),
    inicioReal: dstr(r.inicioReal), terminoReal: dstr(r.terminoReal),
    esforcoEstimadoH: r.esforcoEstimadoH, esforcoRealH: r.esforcoRealH,
    percentualCompleto: r.percentualCompleto, schedulingMode: r.schedulingMode as "auto" | "manual",
    constraintType: r.constraintType, constraintDate: dstr(r.constraintDate),
    isGroup: groupIds.has(r.id),
    isMacroMilestone: r.isMacroMilestone,
    // Esta página de impressão não mostra caminho crítico (só a grade e o
    // Gantt mostram) — valores neutros só pra satisfazer o tipo ItemV2.
    critical: false,
    totalFloatDays: null,
  }))
  const dependencies: DependencyV2[] = deps.map((d) => ({
    id: d.id, successorId: d.successorId, predecessorId: d.predecessorId,
    type: d.type as DependencyV2["type"], lagDiasUteis: d.lagDiasUteis,
  }))

  const membersById = new Map(
    (await db.user.findMany({ where: { id: { in: items.map((i) => i.responsavelId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }))
      .map((u) => [u.id, u.name])
  )
  const codeById = new Map(items.map((it) => [it.id, it.code]))
  const treeRows = buildRows(items)

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Cronograma — {project.title}</title>
        <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      </head>
      <body>
        <div className="wrap">
          <div className="hdr">
            <h1>Cronograma — {project.title}</h1>
            <span className="meta">Gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
          </div>
          <p className="sub">{items.filter((it) => !it.isGroup).length} atividades · Planner by Vendemmia</p>

          <table>
            <thead>
              <tr>
                <th style={{ width: "6%" }}>Código</th>
                <th style={{ width: "26%" }}>Atividade</th>
                <th style={{ width: "6%" }} className="center">Duração</th>
                <th style={{ width: "8%" }} className="center">Início</th>
                <th style={{ width: "8%" }} className="center">Término</th>
                <th style={{ width: "8%" }} className="center">Início Real</th>
                <th style={{ width: "8%" }} className="center">Término Real</th>
                <th style={{ width: "6%" }} className="center">% Completo</th>
                <th style={{ width: "12%" }}>Responsável</th>
                <th style={{ width: "10%" }} className="center">Status</th>
                <th style={{ width: "12%" }}>Predecessores</th>
              </tr>
            </thead>
            <tbody>
              {treeRows.map(({ item: it, depth }) => (
                <tr key={it.id} className={it.isGroup ? "grp" : undefined}>
                  <td style={{ color: "#94A3B8" }}>{it.code}</td>
                  <td style={{ paddingLeft: 10 + depth * 16 }}>{it.title}</td>
                  <td className="center">{it.duracaoDiasUteis === 0 ? "Marco" : it.duracaoDiasUteis ?? "—"}</td>
                  <td className="center">{fmtDateLong(it.inicioEstimado)}</td>
                  <td className="center">{fmtDateLong(it.terminoEstimado)}</td>
                  <td className="center" style={{ color: "#059669" }}>{fmtDateLong(it.inicioReal)}</td>
                  <td className="center" style={{ color: "#059669" }}>{fmtDateLong(it.terminoReal)}</td>
                  <td className="center">{it.percentualCompleto}%</td>
                  <td>{it.responsavelId ? (membersById.get(it.responsavelId) ?? "—") : (it.responsavelNome ?? "—")}</td>
                  <td className="center">
                    <span className="status-pill" style={{ background: `${STATUS_COLORS[it.status] ?? "#64748B"}18`, color: STATUS_COLORS[it.status] ?? "#64748B" }}>
                      {STATUS_LABELS[it.status] ?? it.status}
                    </span>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 9.5 }}>{predecessorsText(it.id, dependencies, codeById)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PrintButton />
      </body>
    </html>
  )
}
