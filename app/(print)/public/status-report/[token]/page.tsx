import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { fmtDateLong } from "@/lib/date-utils"
import { STATUS_REPORT_PROJECT_INCLUDE, buildProjectSlideData } from "@/lib/utils/status-report-slide"
import { ProjectSlide } from "@/app/(dashboard)/status-report/report-client"
import { PrintButton } from "../../../closure/print-button"

export const dynamic = "force-dynamic"
export const metadata = { title: "Status Report" }

// Rota PÚBLICA de propósito — sem auth() nenhum, mesmo espírito de
// app/(print)/public/schedule/[token] (Fase H). Só o token (gerado sob
// demanda no botão "Link Público" da apresentação de Status Report) decide
// o acesso; ver PUBLIC_ROUTES em auth.config.ts.
//
// Reaproveita o próprio ProjectSlide da apresentação interna (mesmo
// visual, mesmos dados) em vez de reconstruir o layout — só adiciona a
// seção "Macro Cronograma", que não cabe no slide de tela cheia.

const STATUS_LABELS: Record<string, string> = {
  A_INICIAR: "A Iniciar", EM_ANDAMENTO: "Em Andamento", VALIDACAO: "Em Validação",
  CONCLUIDO: "Concluído", PAUSADO: "Pausado", ATRASADO: "Atrasado",
}
const STATUS_COLORS: Record<string, string> = {
  A_INICIAR: "#64748B", EM_ANDAMENTO: "#2563EB", VALIDACAO: "#7C3AED",
  CONCLUIDO: "#059669", PAUSADO: "#D97706", ATRASADO: "#DC2626",
}

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; background: #F8FAFC; color: #0F172A; }
  @page { size: A4 landscape; margin: 12mm 10mm; }
  @media print { .no-print { display: none !important; } body { background: white; } }
  .wrap { max-width: 1300px; margin: 0 auto; padding: 24px; }
  .hdr { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 16px; }
  .hdr h1 { font-size: 20px; font-weight: 900; margin: 0; }
  .hdr .meta { font-size: 11px; color: #94A3B8; }
  .slide-frame { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #0B1D3A; border-radius: 18px; overflow: hidden; box-shadow: 0 12px 40px rgba(15,23,42,0.20); }
  .macro { margin-top: 22px; }
  .macro h2 { font-size: 14px; font-weight: 900; margin: 0 0 10px; color: #1E293B; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; background: white; border-radius: 12px; overflow: hidden; }
  thead th { background: #1E293B; color: white; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 9px; padding: 8px 12px; text-align: left; }
  tbody td { padding: 7px 12px; border-bottom: 1px solid #F1F5F9; }
  tbody tr:nth-child(even) { background: #FAFBFC; }
  .status-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 700; }
  .empty { font-size: 12px; color: #94A3B8; font-style: italic; padding: 14px 0; }
  .print-btn {
    position: fixed; bottom: 28px; right: 28px; z-index: 999;
    display: flex; align-items: center; gap: 8px;
    background: linear-gradient(135deg, #1E1B4B, #3730A3); color: white;
    border: none; border-radius: 14px; padding: 12px 22px;
    font-size: 13px; font-weight: 700; cursor: pointer;
    box-shadow: 0 8px 32px rgba(30,27,75,0.40);
  }
`

export default async function PublicStatusReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const project = await db.project.findUnique({
    where: { publicStatusToken: token },
    include: STATUS_REPORT_PROJECT_INCLUDE,
  })
  if (!project) notFound()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const slideData = buildProjectSlideData(project, today)

  // Mesma decisão da Fase H (Cronograma): link permanente e sem login não
  // mostra custo/orçamento (IDC, custo utilizado) — mesmo que o ProjectSlide
  // não os exiba visualmente hoje, os valores ainda viajam no payload de
  // hidratação da página (visíveis em "ver código-fonte"), então a
  // sanitização precisa acontecer nos dados, não só na UI.
  const publicSlideData = { ...slideData, idc: null, budgetUsed: null, budget: null }

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Status Report — {project.title}</title>
        <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      </head>
      <body>
        <div className="wrap">
          <div className="hdr">
            <h1>Status Report — {project.title}</h1>
            <span className="meta">Gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
          </div>

          <div className="slide-frame">
            <ProjectSlide data={publicSlideData} index={1} total={1} />
          </div>

          <div className="macro">
            <h2>Macro Cronograma</h2>
            {slideData.macroMilestones.length === 0 ? (
              <p className="empty">Nenhum item marcado para o Macro Cronograma — marque atividades com a estrela na grade do Cronograma.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "60%" }}>Item</th>
                    <th style={{ width: "20%" }}>Término Previsto</th>
                    <th style={{ width: "20%" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {slideData.macroMilestones.map((m, i) => (
                    <tr key={i}>
                      <td>{m.title}</td>
                      <td>{fmtDateLong(m.terminoEstimado)}</td>
                      <td>
                        <span className="status-pill" style={{ background: `${STATUS_COLORS[m.status] ?? "#64748B"}18`, color: STATUS_COLORS[m.status] ?? "#64748B" }}>
                          {STATUS_LABELS[m.status] ?? m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <PrintButton />
      </body>
    </html>
  )
}
