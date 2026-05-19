import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import { getProjectForClosure } from "@/lib/actions/golive"
import { format, differenceInDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import Image from "next/image"
import { PrintButton } from "../print-button"

export const metadata = { title: "Relatório de Encerramento" }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: Date | string | null | undefined, pattern = "dd/MM/yyyy"): string {
  if (!d) return "—"
  return format(typeof d === "string" ? new Date(d) : d, pattern, { locale: ptBR })
}

function currency(v: number | null | undefined): string {
  if (!v) return "—"
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const STATUS_LABEL: Record<string, string> = {
  PLANNING:    "Planejamento",
  IN_PROGRESS: "Em Andamento",
  PILOT:       "Piloto",
  RAMP_UP:     "Ramp-Up",
  GO_LIVE:     "GO LIVE",
  POST_GOLIVE: "Pós GO LIVE",
  COMPLETED:   "Concluído",
  CANCELLED:   "Cancelado",
  ON_HOLD:     "Em Pausa",
}

const MEETING_TYPE_LABEL: Record<string, string> = {
  CHECKPOINT:      "Checkpoint",
  STATUS_REPORT:   "Status Report",
  GO_NO_GO:        "Go/No-Go",
  KICKOFF:         "Kick-Off",
  PILOT:           "Piloto",
  GO_LIVE:         "GO LIVE",
  POST_GOLIVE:     "Pós GO LIVE",
  LESSONS_LEARNED: "Lições Aprendidas",
  PROJECT_CLOSURE: "Encerramento",
  OTHER:           "Outro",
}

const TASK_STATUS_LABEL: Record<string, string> = {
  PLANNING:    "Planejamento",
  IN_PROGRESS: "Em Andamento",
  COMPLETED:   "Concluído",
  DELAYED:     "Atrasado",
  ON_HOLD:     "Pausado",
  VALIDATION:  "Validação",
}

const RISK_LEVEL_LABEL: Record<string, string> = {
  LOW: "Baixo", MEDIUM: "Médio", HIGH: "Alto", CRITICAL: "Crítico",
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN:           "Administrador",
  DIRECTOR:        "Diretor",
  PROJECT_MANAGER: "Gerente de Projetos",
  PROJECT_MEMBER:  "Membro",
  SPONSOR:         "Sponsor",
  CLIENT:          "Cliente",
}

// ─── Print CSS ────────────────────────────────────────────────────────────────

const PRINT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 9pt;
    color: #1A1A2E;
    background: #E8EAF0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  @media print {
    @page { size: A4; margin: 0; }
    body { background: white; }
    .no-print { display: none !important; }
    .page { page-break-before: always; box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
    .page:first-child { page-break-before: avoid; }
    a { text-decoration: none; color: inherit; }
  }

  @media screen {
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 16px auto;
      background: white;
      box-shadow: 0 4px 32px rgba(0,0,0,0.15);
      border-radius: 4px;
      overflow: hidden;
    }
    .print-wrapper {
      padding: 20px 0 40px;
      min-height: 100vh;
    }
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    position: relative;
  }

  /* Cover page specific */
  .page-cover .cover-top-band {
    background: linear-gradient(135deg, #3B0764, #6D28D9, #7B2FBE);
    height: 14mm;
    display: flex;
    align-items: center;
    padding: 0 18mm;
    justify-content: space-between;
  }

  .page-cover .cover-bottom-band {
    background: linear-gradient(135deg, #1E1B4B, #3B0764);
    padding: 5mm 18mm;
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
  }

  /* Content pages */
  .page-content {
    padding: 0;
  }
  .content-header {
    background: linear-gradient(135deg, #3B0764, #6D28D9);
    padding: 5mm 18mm 4mm;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .content-body {
    padding: 7mm 18mm 8mm;
  }

  /* Section titles */
  .section-title {
    font-size: 8pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #5B21B6;
    margin-bottom: 4mm;
    padding-bottom: 2mm;
    border-bottom: 2px solid #EDE9FE;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .section-title::before {
    content: '';
    display: inline-block;
    width: 3px;
    height: 12px;
    background: linear-gradient(to bottom, #7B2FBE, #3B0764);
    border-radius: 2px;
  }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  th {
    background: linear-gradient(135deg, #F5F3FF, #EDE9FE);
    color: #4C1D95;
    font-weight: 700;
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 3mm 3mm;
    text-align: left;
    border-bottom: 1px solid #DDD6FE;
  }
  td {
    padding: 2.5mm 3mm;
    border-bottom: 1px solid #F3F4F6;
    color: #374151;
    vertical-align: top;
  }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #FAFAF9; }

  /* Metric card */
  .metric-card {
    background: linear-gradient(135deg, #F5F3FF, #EDE9FE);
    border: 1px solid #DDD6FE;
    border-radius: 6px;
    padding: 4mm 4mm;
    text-align: center;
  }
  .metric-card .value {
    font-size: 20pt;
    font-weight: 900;
    color: #5B21B6;
    line-height: 1;
    margin-bottom: 1.5mm;
  }
  .metric-card .label {
    font-size: 7pt;
    font-weight: 600;
    color: #6D28D9;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /* Status badge */
  .badge {
    display: inline-block;
    padding: 1mm 3mm;
    border-radius: 20px;
    font-size: 7pt;
    font-weight: 700;
  }
  .badge-completed { background: #D1FAE5; color: #065F46; }
  .badge-in-progress { background: #DBEAFE; color: #1E40AF; }
  .badge-delayed { background: #FEE2E2; color: #991B1B; }
  .badge-planning { background: #F1F5F9; color: #475569; }
  .badge-golive { background: #D1FAE5; color: #065F46; }
  .badge-risk-critical { background: #FEE2E2; color: #991B1B; }
  .badge-risk-high { background: #FEF3C7; color: #92400E; }
  .badge-risk-medium { background: #FEF3C7; color: #92400E; }
  .badge-risk-low { background: #F1F5F9; color: #475569; }

  /* Progress bar */
  .progress-bar-wrap {
    background: #E9D5FF;
    border-radius: 20px;
    height: 5px;
    overflow: hidden;
    margin-top: 1.5mm;
  }
  .progress-bar-fill {
    height: 100%;
    border-radius: 20px;
    background: linear-gradient(90deg, #7B2FBE, #4C1D95);
  }

  /* Info grid */
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; }
  .info-item { display: flex; flex-direction: column; gap: 0.5mm; }
  .info-label { font-size: 6.5pt; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.06em; }
  .info-value { font-size: 8.5pt; font-weight: 600; color: #1F2937; }

  /* Signature box */
  .sig-box {
    border: 1px solid #E5E7EB;
    border-radius: 6px;
    padding: 4mm 4mm;
    text-align: center;
  }
  .sig-line {
    border-top: 1px solid #9CA3AF;
    margin: 10mm 4mm 2mm;
  }
  .sig-label {
    font-size: 7pt;
    color: #6B7280;
    font-weight: 600;
  }

  /* Footer */
  .page-footer {
    position: absolute;
    bottom: 5mm;
    left: 18mm;
    right: 18mm;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 6pt;
    color: #9CA3AF;
    border-top: 1px solid #F3F4F6;
    padding-top: 2mm;
  }

  /* Print button */
  .print-btn {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: linear-gradient(135deg, #7B2FBE, #4C1D95);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 8px 32px rgba(123,47,190,0.45);
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 1000;
    font-family: inherit;
  }
  .print-btn:hover { opacity: 0.90; transform: translateY(-1px); }
`

// ─── Page wrapper helpers ──────────────────────────────────────────────────────

function PageFooter({ num, total, title }: { num: number; total: number; title: string }) {
  return (
    <div className="page-footer">
      <span>PLANNER by Vendemmia · Documento de Encerramento de Projeto · Confidencial</span>
      <span>{title}</span>
      <span>Página {num} de {total}</span>
    </div>
  )
}

function ContentHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="content-header">
      <div>
        <div style={{ fontSize: "7pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1mm" }}>
          Documento de Encerramento de Projeto
        </div>
        <div style={{ fontSize: "11pt", fontWeight: 900, color: "white" }}>{title}</div>
        {subtitle && <div style={{ fontSize: "8pt", color: "rgba(255,255,255,0.60)", marginTop: "0.5mm" }}>{subtitle}</div>}
      </div>
      <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: "8px", padding: "6px 10px" }}>
        <Image src="/logo_v4.png" alt="PLANNER" width={80} height={20} style={{ objectFit: "contain" }} />
      </div>
    </div>
  )
}

function taskBadge(status: string) {
  const map: Record<string, string> = {
    COMPLETED: "badge-completed", IN_PROGRESS: "badge-in-progress",
    DELAYED: "badge-delayed", PLANNING: "badge-planning",
  }
  return map[status] ?? "badge-planning"
}

function riskBadge(level: string) {
  const map: Record<string, string> = {
    CRITICAL: "badge-risk-critical", HIGH: "badge-risk-high",
    MEDIUM: "badge-risk-medium", LOW: "badge-risk-low",
  }
  return map[level] ?? "badge-risk-low"
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default async function ClosurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const project = await getProjectForClosure(id)
  if (!project) notFound()

  const tasks       = project.tasks
  const totalTasks  = tasks.length
  const doneTasks   = tasks.filter((t) => t.status === "COMPLETED").length
  const avgProgress = totalTasks > 0
    ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / totalTasks)
    : 0

  const startDate  = project.actualStart ?? project.expectedStart
  const endDate    = project.actualEnd   ?? project.expectedEnd
  const glDate     = project.goLiveActual ?? project.goLiveDate
  const duration   = startDate && endDate
    ? differenceInDays(endDate, startDate)
    : null

  const highRisks  = project.risks.filter((r) => ["HIGH", "CRITICAL"].includes(r.status)).length
  const glMeeting  = project.meetings.find((m) => m.type === "GO_LIVE")
  const checkpoints = project.meetings.filter((m) => m.type === "CHECKPOINT")
  const totalPages  = 8
  const docTitle    = project.title

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="print-wrapper">

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PAGE 1 — CAPA                                                */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div className="page page-cover" style={{ display: "flex", flexDirection: "column" }}>

          {/* Top brand band */}
          <div className="cover-top-band">
            <Image src="/logo_v4.png" alt="PLANNER" width={100} height={24} style={{ objectFit: "contain" }} />
            <span style={{ fontSize: "7pt", color: "rgba(255,255,255,0.60)", fontWeight: 600, letterSpacing: "0.06em" }}>
              DOCUMENTO CONFIDENCIAL
            </span>
          </div>

          {/* Main cover area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 22mm", position: "relative", overflow: "hidden" }}>

            {/* Decorative background shapes */}
            <div style={{ position: "absolute", top: -30, right: -30, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(109,40,217,0.08) 0%, transparent 70%)" }} />
            <div style={{ position: "absolute", bottom: 20, left: -20, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,7,100,0.06) 0%, transparent 70%)" }} />

            {/* Decorative arc */}
            <svg style={{ position: "absolute", top: 10, right: 10, opacity: 0.12 }} width="180" height="180" viewBox="0 0 180 180">
              <circle cx="90" cy="90" r="75" fill="none" stroke="#7B2FBE" strokeWidth="1.5" strokeDasharray="8 4" />
              <circle cx="90" cy="90" r="55" fill="none" stroke="#5B21B6" strokeWidth="1" />
            </svg>

            {/* Document type tag */}
            <div style={{ background: "linear-gradient(135deg, #EDE9FE, #F5F3FF)", border: "1px solid #DDD6FE", borderRadius: "20px", padding: "3mm 7mm", marginBottom: "8mm" }}>
              <span style={{ fontSize: "7.5pt", fontWeight: 800, color: "#5B21B6", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Documento de Encerramento de Projeto
              </span>
            </div>

            {/* Project title */}
            <div style={{ textAlign: "center", marginBottom: "10mm" }}>
              <h1 style={{ fontSize: "22pt", fontWeight: 900, color: "#3B0764", lineHeight: 1.15, marginBottom: "4mm", letterSpacing: "-0.02em" }}>
                {project.title}
              </h1>
              {project.description && (
                <p style={{ fontSize: "9pt", color: "#6B7280", maxWidth: "120mm", margin: "0 auto", lineHeight: 1.5 }}>
                  {project.description}
                </p>
              )}
            </div>

            {/* Divider */}
            <div style={{ width: "40mm", height: "2px", background: "linear-gradient(90deg, #7B2FBE, #4C1D95)", borderRadius: "2px", marginBottom: "10mm" }} />

            {/* Key info grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4mm", width: "100%", marginBottom: "10mm" }}>
              {[
                { label: "Status", value: STATUS_LABEL[project.status] ?? project.status },
                { label: "GO LIVE", value: fmt(glDate) },
                { label: "Encerramento", value: fmt(project.actualEnd ?? new Date()) },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "center", padding: "4mm", background: "linear-gradient(135deg, #F5F3FF, #EDE9FE)", borderRadius: "8px", border: "1px solid #DDD6FE" }}>
                  <div style={{ fontSize: "6pt", fontWeight: 700, color: "#8B5CF6", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1.5mm" }}>{label}</div>
                  <div style={{ fontSize: "10pt", fontWeight: 800, color: "#3B0764" }}>{value}</div>
                </div>
              ))}
            </div>

            {project.sponsor && (
              <div style={{ fontSize: "8pt", color: "#9CA3AF", textAlign: "center" }}>
                <span style={{ fontWeight: 600, color: "#6B7280" }}>Solicitante:</span> {project.sponsor.name}
              </div>
            )}
          </div>

          {/* Bottom band */}
          <div className="cover-bottom-band">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "7pt", color: "rgba(255,255,255,0.50)", marginBottom: "1mm" }}>Emitido por</div>
                <div style={{ fontSize: "8.5pt", fontWeight: 700, color: "white" }}>PLANNER — Gestão de Projetos · Vendemmia</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "7pt", color: "rgba(255,255,255,0.50)", marginBottom: "1mm" }}>Data de emissão</div>
                <div style={{ fontSize: "8.5pt", fontWeight: 700, color: "white" }}>
                  {fmt(new Date(), "dd 'de' MMMM 'de' yyyy")}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PAGE 2 — RESUMO EXECUTIVO                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div className="page page-content">
          <ContentHeader title="Resumo Executivo" subtitle={docTitle} />
          <div className="content-body" style={{ paddingBottom: "16mm" }}>

            {/* Metrics row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "3mm", marginBottom: "7mm" }}>
              {[
                { label: "Progresso Geral", value: `${avgProgress}%` },
                { label: "Tarefas Concluídas", value: `${doneTasks}/${totalTasks}` },
                { label: "Membros da Equipe", value: String(project.members.length) },
                { label: "Riscos Mapeados", value: String(project.risks.length) },
              ].map(({ label, value }) => (
                <div key={label} className="metric-card">
                  <div className="value">{value}</div>
                  <div className="label">{label}</div>
                </div>
              ))}
            </div>

            {/* Project Info */}
            <div style={{ marginBottom: "6mm" }}>
              <div className="section-title">Informações do Projeto</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2mm" }}>
                {[
                  { label: "Título",            value: project.title },
                  { label: "Status Final",       value: STATUS_LABEL[project.status] ?? project.status },
                  { label: "Solicitante",        value: project.sponsor?.name ?? "—" },
                  { label: "Início Planejado",   value: fmt(project.expectedStart) },
                  { label: "Início Real",        value: fmt(project.actualStart) },
                  { label: "Fim Planejado",      value: fmt(project.expectedEnd) },
                  { label: "GO LIVE",            value: fmt(glDate) },
                  { label: "Encerramento",       value: fmt(project.actualEnd) },
                  { label: "Duração Total",      value: duration !== null ? `${duration} dias` : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="info-item" style={{ padding: "2mm", background: "#FAFAF9", borderRadius: "4px", border: "1px solid #F3F4F6" }}>
                    <div className="info-label">{label}</div>
                    <div className="info-value">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial */}
            <div style={{ marginBottom: "6mm" }}>
              <div className="section-title">Dados Financeiros</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2mm" }}>
                {[
                  { label: "Budget Previsto",   value: currency(project.budget) },
                  { label: "Economia Esperada", value: currency(project.economy) },
                  { label: "Custos Estimados",  value: currency(project.estimatedCosts) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: "3mm", background: "linear-gradient(135deg, #F5F3FF, #EDE9FE)", borderRadius: "6px", border: "1px solid #DDD6FE" }}>
                    <div style={{ fontSize: "6.5pt", fontWeight: 700, color: "#8B5CF6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1mm" }}>{label}</div>
                    <div style={{ fontSize: "10pt", fontWeight: 800, color: "#3B0764" }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Overall progress bar */}
            <div>
              <div className="section-title">Progresso Geral</div>
              <div style={{ display: "flex", alignItems: "center", gap: "4mm" }}>
                <div style={{ flex: 1 }}>
                  <div className="progress-bar-wrap" style={{ height: "8px" }}>
                    <div className="progress-bar-fill" style={{ width: `${avgProgress}%` }} />
                  </div>
                </div>
                <div style={{ fontSize: "14pt", fontWeight: 900, color: "#5B21B6", minWidth: "14mm", textAlign: "right" }}>
                  {avgProgress}%
                </div>
              </div>
              <div style={{ display: "flex", gap: "4mm", marginTop: "3mm", flexWrap: "wrap" }}>
                {[
                  { label: "Concluídas", count: doneTasks, color: "#065F46", bg: "#D1FAE5" },
                  { label: "Em Andamento", count: tasks.filter((t) => t.status === "IN_PROGRESS").length, color: "#1E40AF", bg: "#DBEAFE" },
                  { label: "Planejamento", count: tasks.filter((t) => t.status === "PLANNING").length, color: "#475569", bg: "#F1F5F9" },
                  { label: "Atrasadas", count: tasks.filter((t) => t.status === "DELAYED").length, color: "#991B1B", bg: "#FEE2E2" },
                ].filter((s) => s.count > 0).map(({ label, count, color, bg }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: "2mm", padding: "1.5mm 3mm", borderRadius: "12px", background: bg }}>
                    <span style={{ fontSize: "8pt", fontWeight: 800, color }}>{count}</span>
                    <span style={{ fontSize: "7pt", fontWeight: 600, color }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
          <PageFooter num={2} total={totalPages} title={docTitle} />
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PAGE 3 — EQUIPE E ESCOPO                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div className="page page-content">
          <ContentHeader title="Equipe e Escopo" subtitle={docTitle} />
          <div className="content-body" style={{ paddingBottom: "16mm" }}>

            {/* Team */}
            <div style={{ marginBottom: "7mm" }}>
              <div className="section-title">Equipe do Projeto</div>
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Departamento</th>
                    <th>Função no Projeto</th>
                  </tr>
                </thead>
                <tbody>
                  {project.members.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}>{m.user.name}</td>
                      <td style={{ color: "#6B7280" }}>{m.user.email}</td>
                      <td>{m.user.department ?? "—"}</td>
                      <td>
                        <span className={`badge ${m.user.role === "PROJECT_MANAGER" ? "badge-golive" : "badge-planning"}`}>
                          {ROLE_LABEL[m.user.role] ?? m.role}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* WBS Areas */}
            {project.wbsAreas.length > 0 && (
              <div>
                <div className="section-title">Estrutura Analítica do Projeto (EAP)</div>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "30%" }}>Área</th>
                      <th style={{ width: "12%" }}>Tarefas</th>
                      <th style={{ width: "12%" }}>Concluídas</th>
                      <th style={{ width: "16%" }}>Progresso</th>
                      <th style={{ width: "30%" }}>Barra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.wbsAreas.map((area) => {
                      const aTotal = area.tasks.length
                      const aDone  = area.tasks.filter((t) => t.status === "COMPLETED").length
                      const aPct   = aTotal > 0 ? Math.round((aDone / aTotal) * 100) : 0
                      return (
                        <tr key={area.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "2mm" }}>
                              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: area.color ?? "#7B2FBE", flexShrink: 0 }} />
                              <span style={{ fontWeight: 600 }}>{area.name}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: "center" }}>{aTotal}</td>
                          <td style={{ textAlign: "center" }}>{aDone}</td>
                          <td style={{ textAlign: "center", fontWeight: 700, color: "#5B21B6" }}>{aPct}%</td>
                          <td>
                            <div className="progress-bar-wrap">
                              <div className="progress-bar-fill" style={{ width: `${aPct}%`, background: area.color ?? "linear-gradient(90deg, #7B2FBE, #4C1D95)" }} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

          </div>
          <PageFooter num={3} total={totalPages} title={docTitle} />
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PAGE 4 — CRONOGRAMA E TAREFAS                                */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div className="page page-content">
          <ContentHeader title="Cronograma e Tarefas" subtitle={docTitle} />
          <div className="content-body" style={{ paddingBottom: "16mm" }}>
            {project.wbsAreas.map((area) => {
              if (area.tasks.length === 0) return null
              return (
                <div key={area.id} style={{ marginBottom: "5mm" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "2mm", marginBottom: "2mm" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: area.color ?? "#7B2FBE" }} />
                    <span style={{ fontSize: "8pt", fontWeight: 800, color: "#374151" }}>{area.name}</span>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: "35%" }}>Tarefa</th>
                        <th style={{ width: "18%" }}>Responsável</th>
                        <th style={{ width: "12%" }}>Início</th>
                        <th style={{ width: "12%" }}>Fim</th>
                        <th style={{ width: "11%" }}>Status</th>
                        <th style={{ width: "12%" }}>Progresso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {area.tasks.map((task) => (
                        <tr key={task.id}>
                          <td style={{ fontWeight: task.parentId ? 400 : 600, paddingLeft: task.parentId ? "6mm" : "3mm" }}>
                            {task.parentId && <span style={{ color: "#D1D5DB", marginRight: "2mm" }}>└</span>}
                            {task.title}
                          </td>
                          <td style={{ color: "#6B7280" }}>{task.responsible?.name ?? "—"}</td>
                          <td style={{ color: "#6B7280" }}>{fmt(task.startDate)}</td>
                          <td style={{ color: "#6B7280" }}>{fmt(task.endDate)}</td>
                          <td>
                            <span className={`badge ${taskBadge(task.status)}`}>
                              {TASK_STATUS_LABEL[task.status] ?? task.status}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
                              <div className="progress-bar-wrap" style={{ flex: 1 }}>
                                <div className="progress-bar-fill" style={{ width: `${task.progress}%` }} />
                              </div>
                              <span style={{ fontSize: "7pt", fontWeight: 700, color: "#5B21B6", minWidth: "6mm" }}>{task.progress}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
          <PageFooter num={4} total={totalPages} title={docTitle} />
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PAGE 5 — REUNIÕES E CHECKPOINTS                              */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div className="page page-content">
          <ContentHeader title="Reuniões e Checkpoints" subtitle={docTitle} />
          <div className="content-body" style={{ paddingBottom: "16mm" }}>

            {/* Summary stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "3mm", marginBottom: "6mm" }}>
              {[
                { label: "Total de Reuniões", value: String(project.meetings.length) },
                { label: "Checkpoints",        value: String(checkpoints.length) },
                { label: "GO LIVE",            value: glMeeting ? "✓ Registrado" : "—" },
                { label: "Kick-Off",           value: project.meetings.some((m) => m.type === "KICKOFF") ? "✓ Realizado" : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="metric-card">
                  <div className="value" style={{ fontSize: "13pt" }}>{value}</div>
                  <div className="label">{label}</div>
                </div>
              ))}
            </div>

            <div className="section-title">Histórico de Reuniões</div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "20%" }}>Data</th>
                  <th style={{ width: "20%" }}>Tipo</th>
                  <th style={{ width: "35%" }}>Título</th>
                  <th style={{ width: "15%" }}>Local</th>
                  <th style={{ width: "10%" }}>Participantes</th>
                </tr>
              </thead>
              <tbody>
                {project.meetings.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{fmt(m.date)}</td>
                    <td>
                      <span className={`badge ${m.type === "GO_LIVE" ? "badge-golive" : m.type === "CHECKPOINT" ? "badge-in-progress" : "badge-planning"}`}>
                        {MEETING_TYPE_LABEL[m.type] ?? m.type}
                      </span>
                    </td>
                    <td>{m.title}</td>
                    <td style={{ color: "#6B7280" }}>{m.location ?? "—"}</td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{m._count.participants}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* GO LIVE meeting detail */}
            {glMeeting && (
              <div style={{ marginTop: "5mm" }}>
                <div className="section-title">Detalhes do GO LIVE</div>
                <div style={{ background: "linear-gradient(135deg, #D1FAE5, #ECFDF5)", border: "1px solid #A7F3D0", borderRadius: "8px", padding: "4mm" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3mm" }}>
                    <div><div className="info-label">Data</div><div className="info-value">{fmt(glMeeting.date)}</div></div>
                    <div><div className="info-label">Tipo de Implantação</div><div className="info-value">{glMeeting.location ?? "—"}</div></div>
                    {glMeeting.content && <div style={{ gridColumn: "1/-1" }}><div className="info-label">Observações</div><div className="info-value" style={{ whiteSpace: "pre-wrap", fontSize: "8pt", lineHeight: 1.5 }}>{glMeeting.content}</div></div>}
                    {glMeeting.decisions && <div style={{ gridColumn: "1/-1" }}><div className="info-label">Período de Monitoramento</div><div className="info-value">{glMeeting.decisions}</div></div>}
                  </div>
                </div>
              </div>
            )}

          </div>
          <PageFooter num={5} total={totalPages} title={docTitle} />
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PAGE 6 — GESTÃO DE RISCOS                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div className="page page-content">
          <ContentHeader title="Gestão de Riscos" subtitle={docTitle} />
          <div className="content-body" style={{ paddingBottom: "16mm" }}>

            {/* Risk summary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "3mm", marginBottom: "6mm" }}>
              {[
                { label: "Total de Riscos", value: String(project.risks.length), color: "#5B21B6" },
                { label: "Críticos",  value: String(project.risks.filter((r) => r.status === "CRITICAL").length), color: "#991B1B" },
                { label: "Altos",     value: String(project.risks.filter((r) => r.status === "HIGH").length),     color: "#92400E" },
                { label: "Médios",    value: String(project.risks.filter((r) => r.status === "MEDIUM").length),   color: "#065F46" },
              ].map(({ label, value, color }) => (
                <div key={label} className="metric-card">
                  <div className="value" style={{ color }}>{value}</div>
                  <div className="label">{label}</div>
                </div>
              ))}
            </div>

            <div className="section-title">Registro de Riscos</div>
            {project.risks.length === 0 ? (
              <p style={{ fontSize: "8pt", color: "#9CA3AF", fontStyle: "italic" }}>Nenhum risco registrado.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "35%" }}>Descrição</th>
                    <th style={{ width: "12%" }}>Probabilidade</th>
                    <th style={{ width: "12%" }}>Impacto</th>
                    <th style={{ width: "12%" }}>Nível</th>
                    <th style={{ width: "18%" }}>Responsável</th>
                    <th style={{ width: "11%" }}>Mitigação</th>
                  </tr>
                </thead>
                <tbody>
                  {project.risks.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.description}</td>
                      <td style={{ textAlign: "center" }}>{RISK_LEVEL_LABEL[r.probability] ?? r.probability}</td>
                      <td style={{ textAlign: "center" }}>{RISK_LEVEL_LABEL[r.impact] ?? r.impact}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`badge ${riskBadge(r.status)}`}>
                          {RISK_LEVEL_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td style={{ color: "#6B7280" }}>{r.owner ?? "—"}</td>
                      <td style={{ fontSize: "7pt", color: "#6B7280" }}>{r.mitigation ? "✓ Definida" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

          </div>
          <PageFooter num={6} total={totalPages} title={docTitle} />
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PAGE 7 — LIÇÕES APRENDIDAS                                   */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div className="page page-content">
          <ContentHeader title="Lições Aprendidas" subtitle={docTitle} />
          <div className="content-body" style={{ paddingBottom: "16mm" }}>
            {project.lessonsLearned.length === 0 ? (
              <div style={{ padding: "8mm", textAlign: "center", background: "#FAFAF9", borderRadius: "8px", border: "1px solid #F3F4F6" }}>
                <p style={{ fontSize: "8pt", color: "#9CA3AF" }}>Nenhuma lição aprendida registrada.</p>
                <p style={{ fontSize: "7pt", color: "#D1D5DB", marginTop: "2mm" }}>Recomenda-se o registro de lições aprendidas para enriquecer o conhecimento da organização.</p>
              </div>
            ) : (
              <>
                {/* Good practices */}
                {project.lessonsLearned.filter((l) => l.influence === "POSITIVE").length > 0 && (
                  <div style={{ marginBottom: "6mm" }}>
                    <div className="section-title">Boas Práticas Identificadas</div>
                    <table>
                      <thead>
                        <tr>
                          <th>Ocorrência</th>
                          <th style={{ width: "18%" }}>Área</th>
                          <th style={{ width: "22%" }}>Lição Aprendida</th>
                          <th style={{ width: "15%" }}>Registrado por</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.lessonsLearned.filter((l) => l.influence === "POSITIVE").map((l) => (
                          <tr key={l.id}>
                            <td>{l.occurrence}</td>
                            <td style={{ color: "#6B7280" }}>{l.area ?? "—"}</td>
                            <td style={{ color: "#6B7280", fontSize: "7.5pt" }}>{l.lesson}</td>
                            <td style={{ color: "#6B7280" }}>{l.createdBy.name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Problems */}
                {project.lessonsLearned.filter((l) => l.influence === "NEGATIVE").length > 0 && (
                  <div>
                    <div className="section-title">Problemas e Oportunidades de Melhoria</div>
                    <table>
                      <thead>
                        <tr>
                          <th>Ocorrência</th>
                          <th style={{ width: "18%" }}>Área</th>
                          <th style={{ width: "15%" }}>Impacto</th>
                          <th style={{ width: "22%" }}>Lição Aprendida</th>
                          <th style={{ width: "15%" }}>Registrado por</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.lessonsLearned.filter((l) => l.influence === "NEGATIVE").map((l) => (
                          <tr key={l.id}>
                            <td>{l.occurrence}</td>
                            <td style={{ color: "#6B7280" }}>{l.area ?? "—"}</td>
                            <td style={{ color: "#6B7280", fontSize: "7.5pt" }}>{l.impact}</td>
                            <td style={{ color: "#6B7280", fontSize: "7.5pt" }}>{l.lesson}</td>
                            <td style={{ color: "#6B7280" }}>{l.createdBy.name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
          <PageFooter num={7} total={totalPages} title={docTitle} />
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PAGE 8 — ENCERRAMENTO FORMAL E ASSINATURAS                   */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div className="page page-content">
          <ContentHeader title="Encerramento Formal" subtitle={docTitle} />
          <div className="content-body" style={{ paddingBottom: "16mm" }}>

            {/* Closing statement */}
            <div style={{ background: "linear-gradient(135deg, #F5F3FF, #EDE9FE)", border: "1px solid #DDD6FE", borderRadius: "8px", padding: "6mm", marginBottom: "7mm" }}>
              <div style={{ fontSize: "8pt", fontWeight: 700, color: "#5B21B6", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3mm" }}>
                Declaração de Encerramento
              </div>
              <p style={{ fontSize: "9pt", color: "#374151", lineHeight: 1.7 }}>
                O presente documento certifica o encerramento formal do projeto <strong>{project.title}</strong>,
                desenvolvido pela área de Gestão de Projetos da Vendemmia. O projeto foi conduzido conforme
                o escopo aprovado na iniciativa de origem, com entrega concluída em <strong>{fmt(glDate)}</strong>,
                seguido do período de monitoramento pós GO LIVE encerrado em <strong>{fmt(project.postGoLiveEndDate)}</strong>.
              </p>
              <p style={{ fontSize: "9pt", color: "#374151", lineHeight: 1.7, marginTop: "3mm" }}>
                Com a assinatura deste documento, o projeto é formalmente encerrado e transferido para a
                gestão do Sponsor, que passa a ser responsável pela operação, manutenção e evolução da
                solução implantada. A área de Gestão de Projetos conclui suas responsabilidades formais
                sobre este projeto nesta data.
              </p>
            </div>

            {/* Key dates summary */}
            <div style={{ marginBottom: "7mm" }}>
              <div className="section-title">Resumo de Datas-Chave</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2mm" }}>
                {[
                  { label: "Kick-Off",                     value: fmt(project.meetings.find((m) => m.type === "KICKOFF")?.date) },
                  { label: "Início Real do Projeto",        value: fmt(project.actualStart) },
                  { label: "GO LIVE",                       value: fmt(glDate) },
                  { label: "Fim do Monitoramento",          value: fmt(project.postGoLiveEndDate) },
                  { label: "Encerramento Formal",           value: fmt(project.actualEnd ?? new Date()) },
                  { label: "Total de Checkpoints",          value: `${checkpoints.length} reuniões` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: "2.5mm 3mm", background: "#FAFAF9", borderRadius: "4px", border: "1px solid #F3F4F6" }}>
                    <div className="info-label">{label}</div>
                    <div className="info-value">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Signatures */}
            <div>
              <div className="section-title">Assinaturas de Entrega</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "5mm", marginTop: "3mm" }}>
                {[
                  { role: "Gerente de Projetos", name: project.members.find((m) => m.user.role === "PROJECT_MANAGER")?.user.name ?? "________________________________" },
                  { role: "Sponsor do Projeto",  name: "________________________________" },
                  { role: "Diretoria",            name: "________________________________" },
                ].map(({ role, name }) => (
                  <div key={role} className="sig-box">
                    <div style={{ height: "14mm" }} />
                    <div className="sig-line" />
                    <div className="sig-label">{name}</div>
                    <div style={{ fontSize: "6.5pt", color: "#9CA3AF", marginTop: "1mm" }}>{role}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "7pt", color: "#D1D5DB", textAlign: "center", marginTop: "5mm" }}>
                Local e Data: ____________________________________________ / ____/____/________
              </p>
            </div>

          </div>
          <PageFooter num={8} total={totalPages} title={docTitle} />
        </div>

      </div>{/* end print-wrapper */}

      {/* Print button (hidden in print) */}
      <PrintButton />
    </>
  )
}
