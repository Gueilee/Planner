"use client"

// Indicadores da Diretoria — visão executiva do portfólio inteiro (todas as
// filiais). É o PRIMEIRO slide da apresentação quando o modo "Diretoria" é
// escolhido (ver report-client.tsx: hasDirectorSlide/slideType) — não é
// mais uma tela separada, entra na mesma sequência cover/agenda/projetos,
// pra apresentar direto sem precisar voltar. Dado é buscado com
// antecedência pelo ReportClient (ainda no Seletor de Projetos) e chega
// pronto aqui via props — sempre calculado na hora
// (lib/actions/director-indicators.ts), sem cache/snapshot.

import {
  Loader2, Briefcase, TrendingUp, CheckCircle2,
  AlertTriangle, ShieldAlert, DollarSign, PiggyBank, Building2, LayoutGrid,
} from "lucide-react"
import type { DirectorIndicatorsData, DirectorBreakdownRow } from "@/lib/actions/director-indicators"

function currency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}

const AREA_LABELS: Record<string, string> = {
  TECNOLOGIA: "Tecnologia", QUALIDADE: "Qualidade", ARMAZEM: "Armazéns", ESTRATEGICO: "Projetos Estratégicos",
}

function StatCard({ icon: Icon, label, value, accent, sub }: {
  icon: React.ElementType; label: string; value: string; accent: string; sub?: string
}) {
  return (
    <div style={{
      flex: "1 1 200px", minWidth: 200, padding: "20px 22px", borderRadius: 18,
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: `${accent}22` }}>
          <Icon style={{ width: 16, height: 16, color: accent }} />
        </div>
        <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(180,210,255,0.5)" }}>{label}</p>
      </div>
      <p style={{ fontSize: "1.7rem", fontWeight: 900, color: "#fff", lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11.5, color: "rgba(180,210,255,0.45)", marginTop: 6 }}>{sub}</p>}
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
    <div style={{ padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: "#fff" }}>{labelFmt ? labelFmt(row.key) : row.label}</p>
        <p style={{ fontSize: 11.5, color: "rgba(180,210,255,0.55)" }}>
          {row.totalProjects} projeto{row.totalProjects !== 1 ? "s" : ""} · {row.avgProgress}% médio
        </p>
      </div>
      <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.06)" }}>
        {segs.map((s, i) => s.pct > 0 && <div key={i} style={{ width: `${s.pct}%`, background: s.color }} />)}
      </div>
    </div>
  )
}

export function DirectorIndicatorsView({ data, error }: { data: DirectorIndicatorsData | null; error: string | null }) {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "linear-gradient(145deg,#0B1D3A,#0F2550)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 28px 60px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(147,197,253,0.55)" }}>
            Visão Executiva · Todas as Filiais
          </p>
          {data && (
            <p style={{ fontSize: 11, color: "rgba(180,210,255,0.4)" }}>
              Atualizado agora — {new Date(data.generatedAt).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 900, color: "#fff", marginBottom: 32 }}>Indicadores da Diretoria</h1>

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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 36 }}>
              <StatCard icon={Briefcase}    label="Portfólio"        value={String(data.totalProjects)}              accent="#60A5FA" sub="projetos ativos" />
              <StatCard icon={TrendingUp}   label="Progresso Médio"  value={`${data.avgProgress}%`}                   accent="#A78BFA" />
              <StatCard icon={CheckCircle2} label="No Prazo"         value={`${data.onTimePct}%`}                     accent="#10B981" />
              <StatCard icon={AlertTriangle} label="Em Risco"        value={`${data.atRiskPct}%`}                     accent="#F59E0B" />
              <StatCard icon={ShieldAlert}  label="Atrasado"         value={`${data.delayedPct}%`}                    accent="#EF4444" />
              <StatCard icon={ShieldAlert}  label="Riscos Ativos"    value={String(data.totalCriticalRisks + data.totalHighRisks)} accent="#F87171" sub={`${data.totalCriticalRisks} críticos, ${data.totalHighRisks} altos`} />
              <StatCard icon={DollarSign}   label="IDC Médio"        value={data.avgIdc !== null ? data.avgIdc.toFixed(2) : "—"} accent="#38BDF8" sub="eficiência de custo" />
              <StatCard icon={PiggyBank}    label="Economia Gerada"  value={currency(data.totalEconomy)}             accent="#34D399" />
            </div>

            {/* Por filial */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Building2 style={{ width: 15, height: 15, color: "rgba(180,210,255,0.6)" }} />
                <p style={{ fontSize: 12.5, fontWeight: 800, color: "rgba(180,210,255,0.7)" }}>Por Filial</p>
              </div>
              <div style={{ padding: "0 2px" }}>
                {data.byOrg.map((row) => <BreakdownRow key={row.key} row={row} />)}
              </div>
            </div>

            {/* Por área */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <LayoutGrid style={{ width: 15, height: 15, color: "rgba(180,210,255,0.6)" }} />
                <p style={{ fontSize: 12.5, fontWeight: 800, color: "rgba(180,210,255,0.7)" }}>Por Área</p>
              </div>
              <div style={{ padding: "0 2px" }}>
                {data.byArea.map((row) => <BreakdownRow key={row.key} row={row} labelFmt={(k) => AREA_LABELS[k] ?? k} />)}
              </div>
            </div>

            <div style={{ display: "flex", gap: 16, marginTop: 20, fontSize: 11, color: "rgba(180,210,255,0.45)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "#10B981" }} /> No prazo</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "#F59E0B" }} /> Em risco</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "#EF4444" }} /> Atrasado</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.18)" }} /> Sem data / não iniciado</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
