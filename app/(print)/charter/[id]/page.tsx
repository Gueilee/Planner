import { notFound } from "next/navigation"
import { getProjectForCharter } from "@/lib/actions/charter"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export const metadata = { title: "Termo de Abertura do Projeto" }

// ─── CSS ──────────────────────────────────────────────────────────────────────

const PRINT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #e8eaf0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }

  @page { size: A4; margin: 0; }
  @media print {
    body { background: white; }
    .no-print { display: none !important; }
    .page { box-shadow: none !important; margin: 0 !important; }
    .page + .page { page-break-before: always; }
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    background: white;
    position: relative;
    overflow: hidden;
    margin: 24px auto;
    box-shadow: 0 8px 48px rgba(0,0,0,0.18);
    page-break-after: always;
  }

  .cover-header {
    background: linear-gradient(135deg, #1E1B4B 0%, #3730A3 40%, #2463FF 80%, #7C3AED 100%);
    padding: 52px 48px 44px;
    position: relative;
    overflow: hidden;
  }
  .cover-header::before {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at 80% 20%, rgba(255,255,255,0.12) 0%, transparent 60%);
  }
  .cover-arcs {
    position: absolute; bottom: -60px; right: -60px; width: 300px; height: 300px;
    opacity: 0.15;
  }
  .logo-pill {
    display: inline-flex; align-items: center; justify-content: center;
    background: white; border-radius: 100px;
    padding: 6px 18px; margin-bottom: 32px;
  }
  .logo-text {
    font-size: 14px; font-weight: 900; letter-spacing: 0.12em;
    background: linear-gradient(135deg, #7B2FBE, #2463FF);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .cover-tag {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.30);
    border-radius: 20px; padding: 4px 14px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    color: rgba(255,255,255,0.90); text-transform: uppercase;
    margin-bottom: 16px;
  }
  .cover-title {
    font-size: 28px; font-weight: 900; color: white;
    line-height: 1.2; letter-spacing: -0.02em;
    margin-bottom: 10px; max-width: 440px;
  }
  .cover-subtitle {
    font-size: 13px; color: rgba(255,255,255,0.60); margin-bottom: 32px;
  }
  .cover-grid {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
  }
  .cover-card {
    background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.20);
    border-radius: 12px; padding: 14px 16px;
  }
  .cover-card-label {
    font-size: 8px; font-weight: 700; letter-spacing: 0.14em;
    text-transform: uppercase; color: rgba(255,255,255,0.55); margin-bottom: 4px;
  }
  .cover-card-value {
    font-size: 13px; font-weight: 800; color: white; line-height: 1.3;
  }

  .section-header {
    background: linear-gradient(90deg, #1E1B4B, #3730A3);
    padding: 10px 48px; display: flex; align-items: center; justify-content: space-between;
  }
  .section-title {
    font-size: 10px; font-weight: 800; letter-spacing: 0.14em;
    text-transform: uppercase; color: white;
  }
  .planner-pill {
    display: inline-flex; align-items: center;
    background: white; border-radius: 100px; padding: 3px 10px;
  }
  .planner-pill-text {
    font-size: 8px; font-weight: 900; letter-spacing: 0.12em;
    background: linear-gradient(135deg,#7B2FBE,#2463FF);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }

  .page-body { padding: 28px 48px; }

  .info-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 0; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden;
    margin-bottom: 24px;
  }
  .info-row {
    display: flex; align-items: flex-start;
    border-bottom: 1px solid #F1F5F9; padding: 10px 16px;
  }
  .info-row:nth-child(even) { border-left: 1px solid #F1F5F9; }
  .info-row:nth-last-child(-n+2) { border-bottom: none; }
  .info-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94A3B8; width: 110px; shrink: 0; padding-top: 1px; }
  .info-value { font-size: 11px; font-weight: 600; color: #0F172A; flex: 1; line-height: 1.4; }

  .text-block {
    background: #F8FAFC; border: 1px solid #F1F5F9; border-radius: 10px;
    padding: 14px 16px; margin-bottom: 16px;
  }
  .text-block-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94A3B8; margin-bottom: 6px; }
  .text-block-content { font-size: 11px; color: #334155; line-height: 1.65; }

  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 20px; }
  thead { background: linear-gradient(135deg, #1E1B4B, #3730A3); }
  thead th { color: white; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; font-size: 8px; padding: 9px 12px; text-align: left; }
  tbody tr:nth-child(even) { background: #F8FAFC; }
  tbody tr:nth-child(odd) { background: white; }
  tbody td { padding: 9px 12px; color: #334155; border-bottom: 1px solid #F1F5F9; font-size: 10px; vertical-align: top; }

  .risk-badge {
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 6px; padding: 2px 8px; font-size: 9px; font-weight: 700; text-transform: uppercase;
  }
  .risk-low    { background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; }
  .risk-medium { background: #FFFBEB; color: #D97706; border: 1px solid #FDE68A; }
  .risk-high   { background: #FFF7ED; color: #EA580C; border: 1px solid #FED7AA; }
  .risk-critical { background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; }

  .role-badge {
    display: inline-flex; align-items: center; justify-content: center;
    background: #EEF2FF; color: #4338CA; border: 1px solid #C7D2FE;
    border-radius: 6px; padding: 2px 8px; font-size: 9px; font-weight: 700;
  }

  .approval-box {
    border: 2px solid #E2E8F0; border-radius: 14px; padding: 18px 20px; text-align: center;
  }
  .approval-line {
    border-top: 1px solid #CBD5E1; margin: 32px 12px 6px;
  }
  .approval-name { font-size: 11px; font-weight: 700; color: #0F172A; }
  .approval-role { font-size: 9px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.08em; }

  .go-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: #ECFDF5; border: 1.5px solid #6EE7B7; border-radius: 20px;
    padding: 6px 18px; font-size: 11px; font-weight: 800; color: #059669;
  }
  .go-dot { width: 8px; height: 8px; border-radius: 50%; background: #10B981; }

  .page-footer {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 10px 48px; display: flex; align-items: center; justify-content: space-between;
    border-top: 1px solid #F1F5F9;
  }
  .footer-text { font-size: 8px; color: #CBD5E1; font-weight: 500; letter-spacing: 0.06em; }

  .print-btn {
    position: fixed; bottom: 28px; right: 28px; z-index: 999;
    display: flex; align-items: center; gap: 8px;
    background: linear-gradient(135deg,#1E1B4B,#3730A3); color: white;
    border: none; border-radius: 14px; padding: 12px 22px;
    font-size: 13px; font-weight: 700; cursor: pointer;
    box-shadow: 0 8px 32px rgba(30,27,75,0.40);
  }

  .h-rule { height: 1px; background: #F1F5F9; margin: 20px 0; }
  .section-subtitle { font-size: 11px; font-weight: 700; color: #1E1B4B; margin-bottom: 12px; letter-spacing: -0.01em; }
  .meta-chip {
    display: inline-flex; align-items: center; gap: 4px;
    background: #EEF2FF; color: #4338CA; border-radius: 8px;
    padding: 3px 10px; font-size: 9px; font-weight: 700; margin-right: 6px; margin-bottom: 6px;
  }
  .empty-state { font-size: 11px; color: #94A3B8; font-style: italic; padding: 12px 0; }
`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: Date | null | undefined): string {
  if (!d) return "—"
  return format(d, "dd/MM/yyyy", { locale: ptBR })
}
function fmtLong(d: Date | null | undefined): string {
  if (!d) return "—"
  return format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
}
function currency(v: number | null | undefined): string {
  if (!v) return "—"
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const ROLE_MAP: Record<string, string> = {
  ADMIN: "Admin", DIRECTOR: "Diretor", PROJECT_MANAGER: "Gerente de Projeto",
  PROJECT_MEMBER: "Membro", SPONSOR: "Sponsor", CLIENT: "Cliente",
}
const ORIGIN_MAP: Record<string, string> = {
  SPONSOR: "Liderança / Sponsor", CLIENT: "Cliente Externo", INTERNAL: "Demanda Interna",
}

// ─── Page Footer ──────────────────────────────────────────────────────────────

function Footer({ title, page }: { title: string; page: number }) {
  return (
    <div className="page-footer">
      <span className="footer-text">PLANNER by Vendemmia · Termo de Abertura do Projeto · Confidencial</span>
      <span className="footer-text">{title}</span>
      <span className="footer-text">Página {page}</span>
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="section-header">
      <span className="section-title">{title}</span>
      <div className="planner-pill"><span className="planner-pill-text">PLANNER</span></div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CharterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await getProjectForCharter(id)
  if (!project) notFound()

  const goNoGo = project.meetings[0] ?? null
  const decisionNotesText: string | null = goNoGo?.decisions ?? null

  const pm = project.members.find((m) =>
    ["PROJECT_MANAGER", "Gerente", "PM", "Gerente de Projeto"].some((r) =>
      m.role.toUpperCase().includes(r.toUpperCase()) || m.user.role === "PROJECT_MANAGER"
    )
  )

  const today = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Termo de Abertura — {project.title}</title>
        <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      </head>
      <body>

        {/* ── Print button ── */}
        <button className="print-btn no-print" onClick={() => {}} style={{ cursor: "pointer" }}
          suppressHydrationWarning
          {...{ onClick: "window.print()" } as Record<string, string>}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Imprimir / PDF
        </button>

        {/* ══════════════════════════════════════════════════════════════════
            PÁGINA 1 — CAPA
        ══════════════════════════════════════════════════════════════════ */}
        <div className="page">
          {/* Cover header */}
          <div className="cover-header">
            {/* decorative arcs */}
            <svg className="cover-arcs" viewBox="0 0 300 300" fill="none">
              <circle cx="300" cy="300" r="180" stroke="white" strokeWidth="1.5" fill="none" opacity="0.5"/>
              <circle cx="300" cy="300" r="120" stroke="white" strokeWidth="1" fill="none" opacity="0.4"/>
              <circle cx="300" cy="300" r="60" stroke="white" strokeWidth="0.8" fill="none" opacity="0.3"/>
            </svg>

            {/* Logo */}
            <div className="logo-pill">
              <span className="logo-text">PLANNER</span>
            </div>

            <div className="cover-tag">
              <span className="go-dot" style={{ background: "#6EE7B7" }} />
              TERMO DE ABERTURA DO PROJETO
            </div>

            <h1 className="cover-title">{project.title}</h1>
            <p className="cover-subtitle">
              Aprovado em Go/No-Go{goNoGo ? ` · ${fmt(goNoGo.date)}` : ""}
            </p>

            {/* Key info grid */}
            <div className="cover-grid">
              {[
                { label: "Sponsor", value: project.sponsor?.name ?? "—" },
                { label: "Origem", value: ORIGIN_MAP[project.origin ?? ""] ?? (project.origin ?? "—") },
                { label: "Gerente do Projeto", value: pm?.user.name ?? "A definir" },
                { label: "Início Previsto", value: fmt(project.expectedStart) },
                { label: "Término Previsto", value: fmt(project.expectedEnd) },
                { label: "Budget", value: currency(project.budget) },
                ...(project.origin === "CLIENT" && project.proposalNumber ? [{ label: "Nº Proposta Comercial", value: project.proposalNumber }] : []),
                ...(project.origin === "CLIENT" && project.contractNumber ? [{ label: "Nº Contrato / P.V.", value: project.contractNumber }] : []),
              ].map(({ label, value }) => (
                <div className="cover-card" key={label}>
                  <div className="cover-card-label">{label}</div>
                  <div className="cover-card-value">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* CONFIDENCIAL bottom band */}
          <div style={{ background: "linear-gradient(90deg,#1E1B4B,#3730A3)", padding: "7px 48px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.16em", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Documento Interno Confidencial</span>
            <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.40)" }}>Emitido em {today}</span>
          </div>

          {/* Body */}
          <div className="page-body">
            <p className="section-subtitle">Declaração do Projeto</p>
            <p style={{ fontSize: "11px", color: "#334155", lineHeight: 1.75, marginBottom: "20px" }}>
              Este documento formaliza a abertura e aprovação do projeto <strong>{project.title}</strong>.
              Ele descreve o escopo, objetivos, equipe, cronograma e riscos identificados na fase de análise, servindo como referência oficial para todas as partes envolvidas ao longo da execução.
            </p>

            <div className="info-grid">
              {[
                { label: "Origem", value: ORIGIN_MAP[project.origin ?? ""] ?? (project.origin ?? "—") },
                { label: "Sponsor", value: project.sponsor ? project.sponsor.name + (project.sponsor.department ? ` (${project.sponsor.department})` : "") : "—" },
                { label: "Status", value: "Aprovado — Em Andamento" },
                { label: "Início Previsto", value: fmtLong(project.expectedStart) },
                { label: "Término Previsto", value: fmtLong(project.expectedEnd) },
                { label: "Reunião Go/No-Go", value: goNoGo ? fmt(goNoGo.date) : "—" },
                { label: "Data de Emissão", value: today },
                { label: "Budget Aprovado", value: currency(project.budget) },
                { label: "Custo Estimado", value: currency(project.estimatedCosts) },
                { label: "Economia Esperada", value: currency(project.economy) },
                { label: "Gerente do Projeto", value: pm?.user.name ?? "A definir" },
                ...(project.origin === "CLIENT" && project.proposalNumber ? [{ label: "Nº Proposta Comercial", value: project.proposalNumber }] : []),
                ...(project.origin === "CLIENT" && project.contractNumber ? [{ label: "Nº Contrato / Pedido de Venda", value: project.contractNumber }] : []),
              ].map(({ label, value }) => (
                <div className="info-row" key={label}>
                  <span className="info-label">{label}</span>
                  <span className="info-value">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <Footer title={project.title} page={1} />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            PÁGINA 2 — ESCOPO E OBJETIVOS
        ══════════════════════════════════════════════════════════════════ */}
        <div className="page">
          <SectionHeader title="Escopo, Objetivos e Premissas" />
          <div className="page-body" style={{ paddingBottom: "60px" }}>

            {project.scope && (
              <div className="text-block">
                <div className="text-block-label">Escopo do Projeto</div>
                <div className="text-block-content">{project.scope}</div>
              </div>
            )}

            {project.asIs && (
              <div className="text-block">
                <div className="text-block-label">Situação Atual (AS IS)</div>
                <div className="text-block-content">{project.asIs}</div>
              </div>
            )}

            {project.toBe && (
              <div className="text-block">
                <div className="text-block-label">Situação Futura Desejada (TO BE)</div>
                <div className="text-block-content">{project.toBe}</div>
              </div>
            )}

            {project.assumptions && (
              <div className="text-block">
                <div className="text-block-label">Premissas</div>
                <div className="text-block-content">{project.assumptions}</div>
              </div>
            )}

            {project.restrictions && (
              <div className="text-block">
                <div className="text-block-label">Restrições</div>
                <div className="text-block-content">{project.restrictions}</div>
              </div>
            )}

            {!project.scope && !project.asIs && !project.toBe && !project.assumptions && !project.restrictions && (
              <p className="empty-state">Informações de escopo não detalhadas.</p>
            )}

            {decisionNotesText && (
              <>
                <div className="h-rule" />
                <div className="text-block" style={{ borderLeft: "3px solid #3730A3", background: "#EEF2FF" }}>
                  <div className="text-block-label" style={{ color: "#4338CA" }}>Notas da Decisão Go/No-Go</div>
                  <div className="text-block-content" style={{ color: "#1E1B4B" }}>{decisionNotesText}</div>
                </div>
              </>
            )}
          </div>
          <Footer title={project.title} page={2} />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            PÁGINA 3 — EQUIPE DO PROJETO
        ══════════════════════════════════════════════════════════════════ */}
        <div className="page">
          <SectionHeader title="Equipe do Projeto" />
          <div className="page-body" style={{ paddingBottom: "60px" }}>
            <p className="section-subtitle">Composição da Equipe</p>
            {project.members.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Departamento</th>
                    <th>Papel no Projeto</th>
                    <th>Perfil do Sistema</th>
                    <th>E-mail</th>
                  </tr>
                </thead>
                <tbody>
                  {project.members.map((m) => (
                    <tr key={m.user.id}>
                      <td style={{ fontWeight: 600, color: "#0F172A" }}>{m.user.name}</td>
                      <td>{m.user.department ?? "—"}</td>
                      <td><span className="role-badge">{m.role}</span></td>
                      <td style={{ color: "#64748B" }}>{ROLE_MAP[m.user.role] ?? m.user.role}</td>
                      <td style={{ color: "#64748B", fontSize: "9px" }}>{m.user.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-state">Nenhum membro adicionado ao projeto.</p>
            )}

            <div className="h-rule" />

            <p className="section-subtitle">Sponsor e Stakeholders</p>
            <table>
              <thead>
                <tr>
                  <th>Papel</th>
                  <th>Nome / Área</th>
                  <th>Departamento</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="role-badge" style={{ background: "#FFF7ED", color: "#C2410C", borderColor: "#FED7AA" }}>Sponsor</span></td>
                  <td style={{ fontWeight: 600 }}>{project.sponsor?.name ?? "—"}</td>
                  <td>{project.sponsor?.department ?? "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Footer title={project.title} page={3} />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            PÁGINA 4 — RISCOS IDENTIFICADOS E APROVAÇÃO
        ══════════════════════════════════════════════════════════════════ */}
        <div className="page">
          <SectionHeader title="Riscos Identificados e Aprovação Formal" />
          <div className="page-body" style={{ paddingBottom: "80px" }}>

            <p className="section-subtitle">Riscos Identificados na Fase de Análise</p>
            {project.risks.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "44%" }}>Descrição do Risco</th>
                    <th>Nível</th>
                    <th>Mitigação Proposta</th>
                  </tr>
                </thead>
                <tbody>
                  {project.risks.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{r.description}</td>
                      <td>
                        <span className={`risk-badge risk-${r.status.toLowerCase()}`}>
                          {r.status === "LOW" ? "Baixo" : r.status === "MEDIUM" ? "Médio" : r.status === "HIGH" ? "Alto" : "Crítico"}
                        </span>
                      </td>
                      <td style={{ color: "#64748B" }}>{r.mitigation || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-state">Nenhum risco registrado para este projeto.</p>
            )}

            <div className="h-rule" />

            {/* Go/No-Go result */}
            {goNoGo && (
              <div style={{ marginBottom: "28px" }}>
                <p className="section-subtitle">Resultado da Reunião Go/No-Go</p>
                <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: "14px", padding: "16px 20px" }}>
                  <div className="go-badge">
                    <div className="go-dot" />
                    APROVADO — GO
                  </div>
                  <div>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#0F172A" }}>
                      Realizada em {fmtLong(goNoGo.date)}
                    </p>
                    <p style={{ fontSize: "10px", color: "#64748B", marginTop: "2px" }}>
                      Facilitada por {goNoGo.createdBy.name}
                    </p>
                    {goNoGo.decisions && (
                      <p style={{ fontSize: "10px", color: "#047857", marginTop: "4px", lineHeight: 1.5 }}>{goNoGo.decisions}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Signature boxes */}
            <p className="section-subtitle">Aprovação Formal</p>
            <p style={{ fontSize: "10px", color: "#94A3B8", marginBottom: "20px", lineHeight: 1.6 }}>
              As partes abaixo, ao assinarem este documento, confirmam ciência e concordância com o escopo, objetivos, equipe, cronograma e riscos do projeto, autorizando formalmente o início da execução.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
              {[
                { role: "Gerente do Projeto", name: pm?.user.name ?? "___________________" },
                { role: "Sponsor", name: project.sponsor?.name ?? "___________________" },
                { role: "Diretoria", name: "___________________" },
              ].map(({ role, name }) => (
                <div className="approval-box" key={role}>
                  <div style={{ height: "36px" }} />
                  <div className="approval-line" />
                  <p className="approval-name">{name}</p>
                  <p className="approval-role">{role}</p>
                  <p style={{ fontSize: "9px", color: "#CBD5E1", marginTop: "6px" }}>Data: ____/____/________</p>
                </div>
              ))}
            </div>
          </div>
          <Footer title={project.title} page={4} />
        </div>

      </body>
    </html>
  )
}
