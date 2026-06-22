"use client"

import { useState, useCallback } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer,
} from "recharts"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Plus, Trash2, RefreshCw, Info, TrendingUp } from "lucide-react"

// ── Types ───────────────────────────────────────────────────────────────────

interface BaselineMeta {
  id: string
  number: number
  name: string
  description: string | null
  createdAt: string
  snapCount: number
}

export interface SCurveData {
  series: Record<string, number | string>[]
  baselines: BaselineMeta[]
  totalTasks: number
}

// ── Color palette for baselines ─────────────────────────────────────────────

const BASELINE_COLORS = ["#F59E0B", "#EC4899", "#8B5CF6", "#14B8A6", "#F97316", "#06B6D4"]

// ── Tooltip ─────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const date = label ? format(parseISO(label), "dd/MM/yyyy", { locale: ptBR }) : ""
  return (
    <div style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 14px", minWidth: 180 }}>
      <p style={{ fontSize: 12, color: "rgba(180,210,255,0.60)", marginBottom: 6, fontWeight: 600 }}>{date}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-6" style={{ marginBottom: 3 }}>
          <span style={{ fontSize: 12, color: p.color, fontWeight: 600 }}>{p.name}</span>
          <span style={{ fontSize: 13, color: "#fff", fontWeight: 800 }}>{p.value}%</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function SCurveClient({ projectId, initialData }: { projectId: string; initialData: SCurveData }) {
  const [data, setData] = useState<SCurveData>(initialData)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [blName, setBlName] = useState("")
  const [blDesc, setBlDesc] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set())

  const today = new Date().toISOString().split("T")[0] + "T00:00:00.000Z"

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/s-curve`)
      const json = await res.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  async function createBaseline() {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/baselines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: blName || undefined, description: blDesc || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Erro ao criar baseline"); return }
      setShowModal(false)
      setBlName("")
      setBlDesc("")
      await refresh()
    } finally {
      setCreating(false)
    }
  }

  async function deleteBaseline(id: string) {
    if (!confirm("Excluir esta baseline?")) return
    await fetch(`/api/projects/${projectId}/baselines/${id}`, { method: "DELETE" })
    await refresh()
  }

  function toggleLine(key: string) {
    setHiddenLines((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const hasSeries = data.series.length > 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Curva S — Evolução do Projeto</h3>
          <p className="text-sm text-gray-500 mt-0.5">Comparativo entre Baseline(s), Planejado e Realizado</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 transition-colors shadow-sm">
            <Plus className="w-3.5 h-3.5" />
            Criar Baseline
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-700 leading-relaxed">
          <strong>Como funciona:</strong> O <em>Baseline Original</em> captura o cronograma no momento em que é criado (congelado). Cada replanejamento gera um novo baseline. O <em>Planejado</em> reflete o cronograma atual e o <em>Realizado</em> mostra o progresso real acumulado ao longo do tempo.
        </p>
      </div>

      {!hasSeries ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <TrendingUp className="w-10 h-10 text-gray-300" />
          <p className="text-gray-500 font-medium">Nenhuma atividade com data de término definida</p>
          <p className="text-sm text-gray-400">Adicione datas ao cronograma para visualizar a Curva S</p>
        </div>
      ) : (
        <>
          {/* Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={data.series} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => {
                    try { return format(parseISO(v as string), "MMM/yy", { locale: ptBR }) } catch { return "" }
                  }}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  width={42}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine
                  x={today}
                  stroke="#6366f1"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  label={{ value: "Hoje", position: "top", fill: "#6366f1", fontSize: 11, fontWeight: 700 }}
                />

                {/* Baselines */}
                {data.baselines.map((bl, i) => (
                  !hiddenLines.has(`b_${bl.id}`) && (
                    <Line
                      key={bl.id}
                      type="monotone"
                      dataKey={`b_${bl.id}`}
                      name={bl.name}
                      stroke={BASELINE_COLORS[i % BASELINE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="6 3"
                      connectNulls
                    />
                  )
                ))}

                {/* Planejado */}
                {!hiddenLines.has("planned") && (
                  <Line
                    type="monotone"
                    dataKey="planned"
                    name="Planejado"
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                  />
                )}

                {/* Realizado */}
                {!hiddenLines.has("realized") && (
                  <Line
                    type="monotone"
                    dataKey="realized"
                    name="Realizado"
                    stroke="#10B981"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#10B981", strokeWidth: 0 }}
                    connectNulls
                  />
                )}

                <Legend
                  wrapperStyle={{ paddingTop: 16, fontSize: 12 }}
                  formatter={(value) => <span style={{ color: "#475569", fontWeight: 600 }}>{value}</span>}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Toggle lines */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: "planned",  label: "Planejado",  color: "#3B82F6" },
              { key: "realized", label: "Realizado",  color: "#10B981" },
              ...data.baselines.map((bl, i) => ({ key: `b_${bl.id}`, label: bl.name, color: BASELINE_COLORS[i % BASELINE_COLORS.length] })),
            ].map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => toggleLine(key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                style={{
                  borderColor: hiddenLines.has(key) ? "#e2e8f0" : color,
                  color: hiddenLines.has(key) ? "#94a3b8" : color,
                  background: hiddenLines.has(key) ? "#f8fafc" : `${color}14`,
                  textDecoration: hiddenLines.has(key) ? "line-through" : "none",
                }}
              >
                <span style={{ width: 10, height: 2, background: hiddenLines.has(key) ? "#cbd5e1" : color, borderRadius: 1, display: "inline-block" }} />
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Baselines list */}
      {data.baselines.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <h4 className="text-sm font-bold text-gray-700">Histórico de Baselines ({data.baselines.length})</h4>
          </div>
          <div className="divide-y divide-gray-50">
            {data.baselines.map((bl, i) => (
              <div key={bl.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: BASELINE_COLORS[i % BASELINE_COLORS.length], display: "inline-block", flexShrink: 0 }} />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{bl.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(parseISO(bl.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · {bl.snapCount} atividades
                      {bl.description ? ` · ${bl.description}` : ""}
                    </p>
                  </div>
                </div>
                {bl.number > 0 && (
                  <button onClick={() => deleteBaseline(bl.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create baseline modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              {data.baselines.length === 0 ? "Criar Baseline Original" : `Criar Replanejamento ${data.baselines.length}`}
            </h3>
            <p className="text-sm text-gray-500 mb-5">Congela o cronograma atual como referência comparativa</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nome</label>
                <input
                  type="text"
                  value={blName}
                  onChange={(e) => setBlName(e.target.value)}
                  placeholder={data.baselines.length === 0 ? "Baseline Original" : `Replanejamento ${data.baselines.length}`}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Motivo do replanejamento <span className="font-normal text-gray-400">(opcional)</span></label>
                <textarea
                  value={blDesc}
                  onChange={(e) => setBlDesc(e.target.value)}
                  rows={3}
                  placeholder="Ex: Atraso na entrega do fornecedor, extensão de escopo..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600 mt-3 font-medium">{error}</p>}

            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowModal(false); setError(null) }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={createBaseline} disabled={creating} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-bold text-white hover:from-blue-700 hover:to-violet-700 transition-colors disabled:opacity-50">
                {creating ? "Criando..." : "Criar Baseline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
