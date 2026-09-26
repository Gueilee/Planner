"use client"

// Indicadores da Diretoria — visão executiva do portfólio inteiro (todas as
// filiais). É o PRIMEIRO slide da apresentação quando o modo "Diretoria" é
// escolhido (ver report-client.tsx: hasDirectorSlide/slideType) — não é
// mais uma tela separada, entra na mesma sequência cover/agenda/projetos,
// pra apresentar direto sem precisar voltar. Dado é buscado com
// antecedência pelo ReportClient (ainda no Seletor de Projetos) e chega
// pronto aqui via props — sempre calculado na hora
// (lib/actions/director-indicators.ts), sem cache/snapshot.
//
// Layout pensado pra caber numa tela só, sem rolagem — pedido depois do
// primeiro teste: com "Por Filial"/"Por Área" empilhados e cards grandes,
// estourava a altura da tela em apresentação (fullscreen), obrigando a
// rolar — e como o slide inteiro reage a clique pra avançar (ver
// onClick=next() no container em report-client.tsx), tentar rolar/clicar
// pra ler acabava pulando pro próximo slide sem querer. Por Filial/Por
// Área agora ficam lado a lado (2 colunas) em vez de empilhados, e todo
// clique DENTRO deste slide para de propagar pro handler de avançar —
// avançar continua funcionando normalmente pelas setas do teclado ou pela
// barra de navegação.

import {
  Loader2, Briefcase, TrendingUp, CheckCircle2,
  AlertTriangle, ShieldAlert, DollarSign, PiggyBank, Building2, LayoutGrid,
} from "lucide-react"
import type { DirectorIndicatorsData, DirectorBreakdownRow } from "@/lib/actions/director-indicators"

function currency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0, notation: v >= 1_000_000 ? "compact" : "standard" })
}

const AREA_LABELS: Record<string, string> = {
  TECNOLOGIA: "Tecnologia", QUALIDADE: "Qualidade", ARMAZEM: "Armazéns", ESTRATEGICO: "Projetos Estratégicos",
}

function StatCard({ icon: Icon, label, value, accent, sub }: {
  icon: React.ElementType; label: string; value: string; accent: string; sub?: string
}) {
  return (
    <div style={{
      flex: "1 1 150px", minWidth: 150, padding: "12px 14px", borderRadius: 14,
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <div style={{ width: 22, height: 22, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: `${accent}22`, flexShrink: 0 }}>
          <Icon style={{ width: 12, height: 12, color: accent }} />
        </div>
        <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(180,210,255,0.5)", lineHeight: 1.2 }}>{label}</p>
      </div>
      <p style={{ fontSize: "1.25rem", fontWeight: 900, color: "#fff", lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: "rgba(180,210,255,0.45)", marginTop: 3 }}>{sub}</p>}
    </div>
  )
}

function BreakdownRow({ row, labelFmt }: { row: DirectorBreakdownRow; labelFmt?: (k: string) => string }) {
  const total = row.totalProjects || 1
  const segs: { pct: number; color: string }[] = [
    { pct: (row.onTime  / total) * 100, color: "#10B981" },
    { pct: (row.atRisk  / total) * 100, color: "#F59E0B" },
    { pct: (row.delayed / total) * 100, color: "#EF4444" },
    { pct: (row.nd      / total) * 100, color: "rgba(255,255,255,0.18)" },
  ]
  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{labelFmt ? labelFmt(row.key) : row.label}</p>
        <p style={{ fontSize: 10.5, color: "rgba(180,210,255,0.55)", whiteSpace: "nowrap", flexShrink: 0 }}>
          {row.totalProjects} · {row.avgProgress}%
        </p>
      </div>
      <div style={{ display: "flex", height: 6, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.06)" }}>
        {segs.map((s, i) => s.pct > 0 && <div key={i} style={{ width: `${s.pct}%`, background: s.color }} />)}
      </div>
    </div>
  )
}

function BreakdownColumn({ icon: Icon, title, rows, labelFmt }: {
  icon: React.ElementType; title: string; rows: DirectorBreakdownRow[]; labelFmt?: (k: string) => string
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: "12px 16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <Icon style={{ width: 13, height: 13, color: "rgba(180,210,255,0.6)" }} />
        <p style={{ fontSize: 11, fontWeight: 800, color: "rgba(180,210,255,0.7)" }}>{title}</p>
      </div>
      <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        {rows.map((row) => <BreakdownRow key={row.key} row={row} labelFmt={labelFmt} />)}
      </div>
    </div>
  )
}

export function DirectorIndicatorsView({ data, error }: { data: DirectorIndicatorsData | null; error: string | null }) {
  return (
    <div
      className="h-full flex flex-col justify-center"
      style={{ background: "linear-gradient(145deg,#0B1D3A,#0F2550)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%", padding: "0 32px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(147,197,253,0.55)" }}>
            Visão Executiva · Todas as Filiais
          </p>
          {data && (
            <p style={{ fontSize: 10.5, color: "rgba(180,210,255,0.4)" }}>
              Atualizado agora — {new Date(data.generatedAt).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 900, color: "#fff", marginBottom: 18 }}>Indicadores da Diretoria</h1>

        {error && (
          <div style={{ padding: 16, borderRadius: 12, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "#FCA5A5", fontSize: 13 }}>
            {error}
          </div>
        )}

        {!data && !error && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(180,210,255,0.55)", fontSize: 13, padding: "40px 0" }}>
            <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> Calculando indicadores do portfólio…
          </div>
        )}

        {data && (
          <>
            {/* Stat cards */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
              <StatCard icon={Briefcase}    label="Portfólio"        value={String(data.totalProjects)}              accent="#60A5FA" sub="ativos" />
              <StatCard icon={TrendingUp}   label="Progresso Médio"  value={`${data.avgProgress}%`}                   accent="#A78BFA" />
              <StatCard icon={CheckCircle2} label="No Prazo"         value={`${data.onTimePct}%`}                     accent="#10B981" />
              <StatCard icon={AlertTriangle} label="Em Risco"        value={`${data.atRiskPct}%`}                     accent="#F59E0B" />
              <StatCard icon={ShieldAlert}  label="Atrasado"         value={`${data.delayedPct}%`}                    accent="#EF4444" />
              <StatCard icon={ShieldAlert}  label="Riscos Ativos"    value={String(data.totalCriticalRisks + data.totalHighRisks)} accent="#F87171" sub={`${data.totalCriticalRisks} críticos`} />
              <StatCard icon={DollarSign}   label="IDC Médio"        value={data.avgIdc !== null ? data.avgIdc.toFixed(2) : "—"} accent="#38BDF8" sub="custo" />
              <StatCard icon={PiggyBank}    label="Economia"         value={currency(data.totalEconomy)}             accent="#34D399" />
            </div>

            {/* Por filial + Por área lado a lado */}
            <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
              <BreakdownColumn icon={Building2}  title="Por Filial" rows={data.byOrg} />
              <BreakdownColumn icon={LayoutGrid} title="Por Área"   rows={data.byArea} labelFmt={(k) => AREA_LABELS[k] ?? k} />
            </div>

            <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 10, color: "rgba(180,210,255,0.45)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: "#10B981" }} /> No prazo</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: "#F59E0B" }} /> Em risco</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: "#EF4444" }} /> Atrasado</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: "rgba(255,255,255,0.18)" }} /> Sem data</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
