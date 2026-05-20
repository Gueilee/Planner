"use client"

import { useState, useMemo } from "react"
import { registerGoLive, type DeploymentType } from "@/lib/actions/golive"
import { addDays, format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ArrowLeft, Loader2, CheckCircle2, Rocket, Calendar,
  Users, ChevronRight, Clock, Zap, AlertCircle, Plus, X,
} from "lucide-react"
import Link from "next/link"

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoLiveClientProps {
  project: {
    id: string
    title: string
    status: string
    goLiveDate: string | null
    postGoLiveEndDate: string | null
  }
  members: { id: string; name: string; department: string | null }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POST_OPTIONS: { days: 30 | 60 | 90; label: string; desc: string }[] = [
  { days: 30, label: "30 dias",  desc: "Implantação simples" },
  { days: 60, label: "60 dias",  desc: "Implantação média" },
  { days: 90, label: "90 dias",  desc: "Implantação complexa" },
]

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

// ─── Background ────────────────────────────────────────────────────────────────

function DarkBackground() {
  return (
    <>
      {/* Grid overlay — fixed so it covers the full viewport while scrolling */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div className="absolute inset-0" style={{
          backgroundImage: "linear-gradient(rgba(36,99,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(36,99,255,0.04) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }} />
        <div className="absolute" style={{ top: -100, left: -80, width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 70%)", filter: "blur(50px)" }} />
        <div className="absolute" style={{ bottom: -120, right: -80, width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(36,99,255,0.12) 0%, transparent 70%)", filter: "blur(60px)" }} />
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(16,185,129,0.5), rgba(36,99,255,0.5), transparent)" }} />
      </div>
    </>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function GoLiveClient({ project, members }: GoLiveClientProps) {
  const today = new Date().toISOString().split("T")[0]

  const [goLiveDate, setGoLiveDate]           = useState(project.goLiveDate?.split("T")[0] ?? today)
  const [deploymentType, setDeploymentType]   = useState<DeploymentType>("DIRECT")
  const [pilotEndDate, setPilotEndDate]       = useState("")
  const [rampUpEndDate, setRampUpEndDate]     = useState("")
  const [postGoLiveDays, setPostGoLiveDays]   = useState<30 | 60 | 90>(30)
  const [attendeeIds, setAttendeeIds]         = useState<string[]>([])
  const [externalAttendees, setExternalAttendees] = useState<{ id: string; name: string; role: string }[]>([])
  const [addingExternal, setAddingExternal]   = useState(false)
  const [extName, setExtName]                 = useState("")
  const [extRole, setExtRole]                 = useState("")
  const [notes, setNotes]                     = useState("")
  const [saving, setSaving]                   = useState(false)
  const [saved, setSaved]                     = useState(false)
  const [error, setError]                     = useState("")

  const monitoringEnd = useMemo(() => {
    if (!goLiveDate) return null
    return addDays(new Date(goLiveDate + "T12:00:00"), postGoLiveDays)
  }, [goLiveDate, postGoLiveDays])

  function toggleAttendee(id: string) {
    setAttendeeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  function confirmExternal() {
    if (!extName.trim()) return
    setExternalAttendees((prev) => [...prev, { id: Math.random().toString(36).slice(2), name: extName.trim(), role: extRole.trim() }])
    setExtName(""); setExtRole(""); setAddingExternal(false)
  }

  async function handleSubmit() {
    if (!goLiveDate) { setError("Informe a data de GO LIVE."); return }
    if (deploymentType === "PHASED" && !rampUpEndDate) { setError("Informe a data de fim do Ramp-Up."); return }
    setSaving(true)
    setError("")
    try {
      await registerGoLive({
        projectId: project.id,
        goLiveDate,
        deploymentType,
        pilotEndDate: deploymentType === "PHASED" ? pilotEndDate || undefined : undefined,
        rampUpEndDate: deploymentType === "PHASED" ? rampUpEndDate || undefined : undefined,
        postGoLiveDays,
        notes: notes + (externalAttendees.length ? "\n\nParticipantes externos: " + externalAttendees.map((e) => `${e.name}${e.role ? ` (${e.role})` : ""}`).join(", ") : ""),
        attendeeIds,
      })
      setSaved(true)
    } catch (e) {
      console.error(e)
      setError("Erro ao registrar o GO LIVE. Tente novamente.")
    } finally {
      setSaving(false)
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (saved) {
    return (
      <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center gap-8 p-8">
        <DarkBackground />
        <div className="relative z-10 flex flex-col items-center gap-8 text-center max-w-lg">
          {/* Animated rocket */}
          <div className="relative">
            <div
              className="w-28 h-28 rounded-3xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #10B981, #059669)",
                boxShadow: "0 0 60px rgba(16,185,129,0.50), 0 20px 60px rgba(16,185,129,0.30)",
              }}
            >
              <Rocket className="w-14 h-14 text-white" />
            </div>
            {/* Orbit ring */}
            <div
              className="absolute inset-0 rounded-3xl animate-ping"
              style={{ background: "transparent", border: "2px solid rgba(16,185,129,0.30)", animationDuration: "2s" }}
            />
          </div>

          {/* Title */}
          <div>
            <h1
              className="text-5xl font-black leading-none tracking-tight mb-3"
              style={{
                background: "linear-gradient(135deg, #34D399, #10B981, #059669)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              GO LIVE!
            </h1>
            <p className="text-lg font-semibold" style={{ color: "rgba(255,255,255,0.60)" }}>
              {project.title}
            </p>
          </div>

          {/* Info cards */}
          <div className="flex gap-4 w-full">
            <div
              className="flex-1 rounded-2xl p-4 text-center"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                GO LIVE
              </p>
              <p className="text-sm font-black" style={{ color: "#34D399" }}>
                {format(new Date(goLiveDate + "T12:00:00"), "dd/MM/yyyy")}
              </p>
            </div>
            {monitoringEnd && (
              <div
                className="flex-1 rounded-2xl p-4 text-center"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Fim do Monitoramento
                </p>
                <p className="text-sm font-black" style={{ color: "#60A5FA" }}>
                  {format(monitoringEnd, "dd/MM/yyyy")}
                </p>
              </div>
            )}
            <div
              className="flex-1 rounded-2xl p-4 text-center"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                Monitoramento
              </p>
              <p className="text-sm font-black" style={{ color: "#C084FC" }}>
                {postGoLiveDays} dias
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 flex-wrap justify-center">
            <Link
              href={`/projects/${project.id}`}
              className="inline-flex items-center gap-2 px-6 h-11 rounded-xl text-sm font-bold transition-all hover:opacity-80"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.80)" }}
            >
              <ArrowLeft className="w-4 h-4" />
              Ver Projeto
            </Link>
            <Link
              href={`/closure/${project.id}`}
              target="_blank"
              className="inline-flex items-center gap-2 px-6 h-11 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 24px rgba(123,47,190,0.40)" }}
            >
              Relatório de Encerramento
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Main form ─────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 relative overflow-hidden overflow-y-auto" style={{ background: "#030712" }}>
      <DarkBackground />

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${project.id}`}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors group"
            style={{ color: "rgba(255,255,255,0.40)" }}
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span style={{ color: "rgba(255,255,255,0.40)" }} className="hover:text-white transition-colors">
              {project.title}
            </span>
          </Link>
        </div>

        {/* Hero */}
        <div className="text-center py-6">
          <div
            className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl mb-5"
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }}
          >
            <Zap className="w-5 h-5" style={{ color: "#34D399" }} />
            <span className="text-sm font-bold" style={{ color: "#34D399" }}>GO LIVE</span>
          </div>
          <h1
            className="text-4xl font-black leading-tight mb-2"
            style={{ color: "white" }}
          >
            Registrar GO LIVE
          </h1>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
            {project.title}
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#FCA5A5" }}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Section 1: GO LIVE Date ── */}
        <FormCard icon={<Calendar className="w-4 h-4" />} title="Data de GO LIVE">
          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>
              Data de GO LIVE
            </label>
            <input
              type="date"
              value={goLiveDate}
              onChange={(e) => setGoLiveDate(e.target.value)}
              className="w-full h-11 px-4 rounded-xl text-sm font-semibold focus:outline-none"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "white",
                colorScheme: "dark",
              }}
            />
          </div>
        </FormCard>

        {/* ── Section 2: Deployment type ── */}
        <FormCard icon={<Rocket className="w-4 h-4" />} title="Tipo de Implantação">
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: "DIRECT" as const, label: "GO LIVE Direto", desc: "Implantação imediata e completa para todos os usuários" },
              { value: "PHASED" as const, label: "Faseado (Piloto + Ramp-Up)", desc: "Inicia com grupo piloto e expande gradualmente" },
            ].map((opt) => {
              const active = deploymentType === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setDeploymentType(opt.value)}
                  className="text-left p-4 rounded-xl transition-all"
                  style={{
                    background: active ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)",
                    border: active ? "1px solid rgba(16,185,129,0.40)" : "1px solid rgba(255,255,255,0.08)",
                    boxShadow: active ? "0 0 20px rgba(16,185,129,0.10)" : "none",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                      style={{ borderColor: active ? "#10B981" : "rgba(255,255,255,0.25)" }}
                    >
                      {active && <div className="w-2 h-2 rounded-full" style={{ background: "#10B981" }} />}
                    </div>
                    <span className="text-sm font-bold" style={{ color: active ? "#34D399" : "rgba(255,255,255,0.70)" }}>
                      {opt.label}
                    </span>
                  </div>
                  <p className="text-xs leading-snug ml-6" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {opt.desc}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Phased dates */}
          {deploymentType === "PHASED" && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>
                  Fim do Piloto (opcional)
                </label>
                <input
                  type="date"
                  value={pilotEndDate}
                  onChange={(e) => setPilotEndDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl text-sm focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "white", colorScheme: "dark" }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>
                  Fim do Ramp-Up <span style={{ color: "#FCA5A5" }}>*</span>
                </label>
                <input
                  type="date"
                  value={rampUpEndDate}
                  onChange={(e) => setRampUpEndDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl text-sm focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "white", colorScheme: "dark" }}
                />
              </div>
            </div>
          )}
        </FormCard>

        {/* ── Section 3: Monitoring period ── */}
        <FormCard icon={<Clock className="w-4 h-4" />} title="Período de Monitoramento Pós GO LIVE">
          <div className="grid grid-cols-3 gap-3">
            {POST_OPTIONS.map((opt) => {
              const active = postGoLiveDays === opt.days
              return (
                <button
                  key={opt.days}
                  onClick={() => setPostGoLiveDays(opt.days)}
                  className="py-4 px-3 rounded-xl text-center transition-all"
                  style={{
                    background: active ? "rgba(36,99,255,0.15)" : "rgba(255,255,255,0.04)",
                    border: active ? "1px solid rgba(36,99,255,0.45)" : "1px solid rgba(255,255,255,0.08)",
                    boxShadow: active ? "0 0 20px rgba(36,99,255,0.12)" : "none",
                  }}
                >
                  <p className="text-xl font-black mb-0.5" style={{ color: active ? "#60A5FA" : "rgba(255,255,255,0.60)" }}>
                    {opt.days}
                  </p>
                  <p className="text-[10px] font-bold" style={{ color: active ? "#60A5FA" : "rgba(255,255,255,0.30)" }}>
                    dias
                  </p>
                  <p className="text-[9px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
                    {opt.desc}
                  </p>
                </button>
              )
            })}
          </div>

          {monitoringEnd && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-xl mt-1"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: "rgba(255,255,255,0.35)" }} />
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.40)" }}>
                Encerramento do monitoramento:
              </span>
              <span className="text-xs font-bold ml-auto" style={{ color: "#60A5FA" }}>
                {format(monitoringEnd, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            </div>
          )}
        </FormCard>

        {/* ── Section 4: Participants ── */}
        <FormCard icon={<Users className="w-4 h-4" />} title={`Participantes (${attendeeIds.length + externalAttendees.length}${members.length > 0 ? `/${members.length}` : ""})`}>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const selected = attendeeIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  onClick={() => toggleAttendee(m.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: selected ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.05)",
                    border: selected ? "1px solid rgba(16,185,129,0.40)" : "1px solid rgba(255,255,255,0.10)",
                    color: selected ? "#34D399" : "rgba(255,255,255,0.55)",
                  }}
                >
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: selected ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.08)", color: selected ? "#34D399" : "rgba(255,255,255,0.50)" }}>
                    {initials(m.name)}
                  </span>
                  {m.name.split(" ")[0]}
                  {selected && <CheckCircle2 className="w-3 h-3" />}
                </button>
              )
            })}

            {/* External attendees */}
            {externalAttendees.map((ext) => (
              <span key={ext.id} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: "rgba(8,145,178,0.20)", border: "1px solid rgba(8,145,178,0.40)", color: "#67E8F9" }}>
                <span className="w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black shrink-0" style={{ background: "rgba(8,145,178,0.30)" }}>
                  {ext.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                </span>
                {ext.name.split(" ")[0]}
                <span className="text-[8px] opacity-70 ml-0.5">Ext.</span>
                <button onClick={() => setExternalAttendees((p) => p.filter((e) => e.id !== ext.id))} className="ml-0.5 hover:opacity-70 transition-opacity"><X className="w-2.5 h-2.5" /></button>
              </span>
            ))}

            {/* Add external inline form / button */}
            {addingExternal ? (
              <div className="flex items-center gap-1.5 p-1.5 rounded-xl" style={{ border: "1.5px dashed rgba(8,145,178,0.40)", background: "rgba(8,145,178,0.08)" }}>
                <input autoFocus value={extName} onChange={(e) => setExtName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmExternal()} placeholder="Nome" className="w-24 px-2 py-0.5 text-xs rounded-lg outline-none placeholder-slate-400" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)" }} />
                <input value={extRole} onChange={(e) => setExtRole(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmExternal()} placeholder="Área/Empresa" className="w-28 px-2 py-0.5 text-xs rounded-lg outline-none placeholder-slate-400" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)" }} />
                <button onClick={confirmExternal} disabled={!extName.trim()} className="px-2 py-0.5 text-[11px] font-black rounded-lg disabled:opacity-40" style={{ background: "rgba(8,145,178,0.35)", color: "#67E8F9" }}>OK</button>
                <button onClick={() => { setAddingExternal(false); setExtName(""); setExtRole("") }} className="px-1.5 py-0.5 text-[11px] rounded-lg" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.40)" }}><X className="w-3 h-3" /></button>
              </div>
            ) : (
              <button onClick={() => setAddingExternal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all" style={{ background: "rgba(255,255,255,0.03)", border: "1.5px dashed rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.35)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(8,145,178,0.50)"; (e.currentTarget as HTMLElement).style.color = "#67E8F9" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.35)" }}
              >
                <Plus className="w-3 h-3" /> Externo
              </button>
            )}
          </div>
        </FormCard>

        {/* ── Section 5: Notes ── */}
        <FormCard icon={<Zap className="w-4 h-4" />} title="Observações">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Detalhes do GO LIVE, ambiente, escopo entregue, pendências pós-implantação..."
            rows={4}
            className="w-full text-sm rounded-xl px-4 py-3 resize-none focus:outline-none"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.85)",
              caretColor: "#10B981",
            }}
          />
        </FormCard>

        {/* ── Submit ── */}
        <div className="pb-8">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full h-14 rounded-2xl flex items-center justify-center gap-3 text-base font-black text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #10B981, #059669)",
              boxShadow: "0 8px 40px rgba(16,185,129,0.35)",
            }}
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Rocket className="w-5 h-5" />
            )}
            {saving ? "Registrando GO LIVE..." : "Registrar GO LIVE"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Reusable form card ────────────────────────────────────────────────────────

function FormCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: "rgba(255,255,255,0.35)" }}>{icon}</span>
        <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.40)" }}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  )
}
