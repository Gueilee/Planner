"use client"

import { useState, useRef, useTransition, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { parseDateStr } from "@/lib/date-utils"
import {
  ArrowLeft, Save, Rocket, Plus, Trash2, Upload, X, Loader2,
  Calendar, MapPin, Target, Users, Paperclip, ChevronRight,
  CheckCircle2, Circle, GripVertical, FileText, ImageIcon, FileSpreadsheet,
  Pen, Check, Presentation,
} from "lucide-react"
import { saveKickOff, registerKickOff } from "@/lib/actions/kickoff"
import type { KickOffData, EAPArea, EAPTask, Milestone, KickOffAttachment, ExternalAttendee } from "@/lib/types/kickoff"
import type { PickerUser } from "@/components/meeting-participant-picker"
import { MeetingParticipantPicker } from "@/components/meeting-participant-picker"

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10) }

const AREA_COLORS = [
  "#16A34A", "#1D4ED8", "#7C3AED", "#0891B2",
  "#D97706", "#DC2626", "#DB2777", "#0D9488",
  "#9333EA", "#EA580C", "#2563EB", "#65A30D",
]

const SECTION_NAV = [
  { id: "reunion",       icon: Calendar,    label: "Reunião" },
  { id: "eap",          icon: Target,       label: "EAP" },
  { id: "marcos",       icon: CheckCircle2, label: "Marcos" },
  { id: "documentos",   icon: Paperclip,    label: "Documentos" },
  { id: "participantes",icon: Users,        label: "Participantes" },
]

// ── Types ─────────────────────────────────────────────────────────────────────

type UserInfo = { id: string; name: string; department: string | null; role: string }

type RiskItem = { description: string; level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; mitigation: string }

type ProjectData = {
  id: string
  title: string
  description: string | null
  status: string
  origin: string | null
  scope: string | null
  asIs: string | null
  toBe: string | null
  assumptions: string | null
  restrictions: string | null
  expectedStart: string | null
  expectedEnd: string | null
  economy: number | null
  estimatedCosts: number | null
  budget: number | null
  risks: RiskItem[]
  sponsor: { name: string; department: string | null } | null
  members: { role: string; user: UserInfo }[]
}

// ── Default generators ────────────────────────────────────────────────────────

function generateEAP(project: ProjectData): EAPArea[] {
  const areas: EAPArea[] = [
    {
      id: uid(), name: "Projetos", color: AREA_COLORS[0],
      tasks: [
        { id: uid(), text: "Elaboração do Termo de Abertura" },
        { id: uid(), text: "Apresentação do Kick-Off" },
        { id: uid(), text: "Gestão do Cronograma" },
      ],
    },
  ]

  const stakeholderAreas = project.members
    .map((m) => m.user.department ?? "")
    .filter((a, i, arr) => a !== "" && arr.indexOf(a) === i)
    .slice(0, 7)

  stakeholderAreas.forEach((area, i) => {
    areas.push({
      id: uid(), name: area, color: AREA_COLORS[(i + 1) % AREA_COLORS.length],
      tasks: [
        { id: uid(), text: "Mapeamento de processos" },
        { id: uid(), text: "Análise crítica" },
      ],
    })
  })

  if (areas.length < 3) {
    const defaults = ["Operação", "TI", "Cliente"]
    defaults.slice(areas.length - 1).forEach((name, i) => {
      areas.push({ id: uid(), name, color: AREA_COLORS[areas.length % AREA_COLORS.length], tasks: [{ id: uid(), text: "Definir atividades" }] })
    })
  }

  return areas
}

function generateMilestones(project: ProjectData): Milestone[] {
  const today = new Date().toISOString().slice(0, 10)
  const milestones: Milestone[] = [
    { id: uid(), label: "Reunião de Kick-Off", date: today, description: "Início oficial do projeto", status: "PLANNED" },
    { id: uid(), label: "Elaboração do Cronograma", date: "", status: "PLANNED" },
    { id: uid(), label: "Fase Operacional", date: "", status: "PLANNED" },
  ]
  if (project.expectedEnd) {
    milestones.push({ id: uid(), label: "Go Live", date: project.expectedEnd.slice(0, 10), description: "Entrega final ao cliente", status: "PLANNED" })
  }
  milestones.push({ id: uid(), label: "Encerramento do Projeto", date: "", status: "PLANNED" })
  return milestones
}

// ── EAP Table ─────────────────────────────────────────────────────────────────

function EAPTable({ areas, onChange }: { areas: EAPArea[]; onChange: (a: EAPArea[]) => void }) {
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editingHeader, setEditingHeader] = useState<string | null>(null)

  function addArea() {
    onChange([...areas, {
      id: uid(),
      name: "Nova Área",
      color: AREA_COLORS[areas.length % AREA_COLORS.length],
      tasks: [{ id: uid(), text: "Nova atividade" }],
    }])
  }

  function removeArea(areaId: string) {
    onChange(areas.filter((a) => a.id !== areaId))
  }

  function updateAreaName(areaId: string, name: string) {
    onChange(areas.map((a) => a.id === areaId ? { ...a, name } : a))
  }

  function updateAreaColor(areaId: string, color: string) {
    onChange(areas.map((a) => a.id === areaId ? { ...a, color } : a))
  }

  function addTask(areaId: string) {
    onChange(areas.map((a) => a.id === areaId ? { ...a, tasks: [...a.tasks, { id: uid(), text: "Nova atividade" }] } : a))
  }

  function updateTask(areaId: string, taskId: string, text: string) {
    onChange(areas.map((a) => a.id === areaId ? { ...a, tasks: a.tasks.map((t) => t.id === taskId ? { ...t, text } : t) } : a))
  }

  function removeTask(areaId: string, taskId: string) {
    onChange(areas.map((a) => a.id === areaId ? { ...a, tasks: a.tasks.filter((t) => t.id !== taskId) } : a))
  }

  const maxRows = Math.max(...areas.map((a) => a.tasks.length), 0)

  return (
    <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
      <table style={{ borderCollapse: "collapse", minWidth: "100%", tableLayout: "fixed" }}>
        {/* Header row */}
        <thead>
          <tr>
            {areas.map((area, ai) => (
              <th key={area.id} style={{
                width: "180px", padding: "0",
                borderRight: ai < areas.length - 1 ? "1px solid rgba(255,255,255,0.15)" : "none",
                position: "relative",
              }}>
                <div style={{ background: area.color, padding: "10px 12px", minHeight: "56px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {editingHeader === area.id ? (
                    <input
                      autoFocus
                      value={area.name}
                      onChange={(e) => updateAreaName(area.id, e.target.value)}
                      onBlur={() => setEditingHeader(null)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingHeader(null)}
                      className="w-full bg-white/20 text-white text-xs font-bold outline-none rounded px-1"
                      style={{ border: "1px solid rgba(255,255,255,0.4)" }}
                    />
                  ) : (
                    <span
                      className="text-white font-black text-xs uppercase tracking-wide cursor-pointer hover:opacity-80 leading-tight"
                      onClick={() => setEditingHeader(area.id)}
                    >
                      {area.name}
                    </span>
                  )}
                  <div className="flex items-center gap-1 mt-auto">
                    {AREA_COLORS.slice(0, 6).map((c) => (
                      <button
                        key={c}
                        onClick={() => updateAreaColor(area.id, c)}
                        style={{ width: "12px", height: "12px", borderRadius: "50%", background: c, border: area.color === c ? "2px solid white" : "1px solid rgba(255,255,255,0.3)", cursor: "pointer", flexShrink: 0 }}
                      />
                    ))}
                    {ai > 0 && (
                      <button onClick={() => removeArea(area.id)} className="ml-auto text-white/50 hover:text-white/90 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </th>
            ))}
            {/* Add area column */}
            <th style={{ width: "56px", background: "#F8FAFC", borderLeft: "1px dashed #E2E8F0" }}>
              <button
                onClick={addArea}
                className="w-full h-full flex flex-col items-center justify-center gap-1 py-4 text-slate-300 hover:text-[#7B2FBE] hover:bg-violet-50 transition-all"
                title="Adicionar área"
              >
                <Plus className="w-4 h-4" />
                <span className="text-[9px] font-bold uppercase tracking-wide" style={{ writingMode: "vertical-rl" }}>Área</span>
              </button>
            </th>
          </tr>
        </thead>

        {/* Task rows */}
        <tbody>
          {Array.from({ length: maxRows }).map((_, ri) => (
            <tr key={ri} style={{ borderTop: "1px solid #F1F5F9" }}>
              {areas.map((area, ai) => {
                const task = area.tasks[ri]
                return (
                  <td key={area.id} style={{
                    padding: "0",
                    verticalAlign: "top",
                    borderRight: ai < areas.length - 1 ? "1px solid #F1F5F9" : "none",
                    background: ri % 2 === 0 ? "white" : "#FAFAFA",
                  }}>
                    {task ? (
                      <div className="group flex items-start gap-1 p-2 min-h-[40px]">
                        <div className="w-1 h-1 rounded-full mt-2 shrink-0" style={{ background: area.color }} />
                        {editingCell === task.id ? (
                          <textarea
                            autoFocus
                            value={task.text}
                            onChange={(e) => updateTask(area.id, task.id, e.target.value)}
                            onBlur={() => setEditingCell(null)}
                            rows={2}
                            className="flex-1 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-1 outline-none resize-none"
                          />
                        ) : (
                          <span
                            className="flex-1 text-xs text-slate-600 leading-relaxed cursor-pointer hover:text-[#0F172A]"
                            onClick={() => setEditingCell(task.id)}
                          >
                            {task.text}
                          </span>
                        )}
                        <button
                          onClick={() => removeTask(area.id, task.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 text-slate-300 hover:text-red-400"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ) : null}
                  </td>
                )
              })}
              <td style={{ background: ri % 2 === 0 ? "white" : "#FAFAFA", borderLeft: "1px dashed #E2E8F0" }} />
            </tr>
          ))}

          {/* Add task row */}
          <tr style={{ borderTop: "1px solid #F1F5F9" }}>
            {areas.map((area, ai) => (
              <td key={area.id} style={{ padding: "4px 8px", borderRight: ai < areas.length - 1 ? "1px solid #F1F5F9" : "none", background: "#FAFAFA" }}>
                <button
                  onClick={() => addTask(area.id)}
                  className="flex items-center gap-1 text-[10px] font-semibold text-slate-300 hover:text-slate-500 transition-colors w-full py-1"
                >
                  <Plus className="w-2.5 h-2.5" />
                  Adicionar
                </button>
              </td>
            ))}
            <td style={{ background: "#FAFAFA", borderLeft: "1px dashed #E2E8F0" }} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Marcos Timeline ───────────────────────────────────────────────────────────

function MarcosTimeline({ milestones, onChange }: { milestones: Milestone[]; onChange: (m: Milestone[]) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null)

  function addMilestone() {
    onChange([...milestones, { id: uid(), label: "Novo Marco", date: "", status: "PLANNED" }])
  }

  function updateMilestone(id: string, patch: Partial<Milestone>) {
    onChange(milestones.map((m) => m.id === id ? { ...m, ...patch } : m))
  }

  function removeMilestone(id: string) {
    onChange(milestones.filter((m) => m.id !== id))
  }

  function toggleStatus(id: string) {
    onChange(milestones.map((m) => m.id === id ? { ...m, status: m.status === "DONE" ? "PLANNED" : "DONE" } : m))
  }

  const editing = milestones.find((m) => m.id === editingId)

  return (
    <div className="space-y-6">
      {/* Visual timeline */}
      <div
        className="relative py-8 overflow-x-auto"
        style={{
          background: "linear-gradient(135deg, #0F172A, #1E1B4B)",
          borderRadius: "20px",
          minHeight: "220px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.20)",
        }}
      >
        {/* Ambient orbs */}
        <div style={{ position: "absolute", width: "300px", height: "300px", borderRadius: "50%", top: "-100px", right: "-50px", background: "radial-gradient(circle, rgba(123,47,190,0.15) 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", width: "200px", height: "200px", borderRadius: "50%", bottom: "-60px", left: "10%", background: "radial-gradient(circle, rgba(36,99,255,0.12) 0%, transparent 65%)", pointerEvents: "none" }} />

        {/* Legend */}
        <div className="absolute top-3 right-4 flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-white/40">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            Planejado
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-white/40">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            Concluído
          </span>
        </div>

        {/* Title */}
        <div className="absolute top-3 left-4">
          <p className="text-xs font-black text-white/30 uppercase tracking-widest">Cronograma de Marcos</p>
        </div>

        {milestones.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-white/20 text-sm">
            Nenhum marco definido
          </div>
        ) : (
          <div className="relative px-8 mt-8" style={{ minWidth: `${milestones.length * 160 + 64}px` }}>
            {/* Central line */}
            <div
              className="absolute left-8 right-8"
              style={{
                top: "50%",
                height: "2px",
                background: "linear-gradient(90deg, #7B2FBE, #2463FF, #00C4E0)",
                borderRadius: "999px",
                boxShadow: "0 0 12px rgba(123,47,190,0.4)",
              }}
            />

            {/* Milestone items */}
            <div className="flex" style={{ gap: "0" }}>
              {milestones.map((m, i) => {
                const above = i % 2 === 0
                const isDone = m.status === "DONE"
                const color = isDone ? "#10B981" : "#60A5FA"

                return (
                  <div key={m.id} className="flex flex-col items-center" style={{ flex: "0 0 160px", position: "relative" }}>
                    {/* Top label */}
                    <div style={{ height: "72px", display: "flex", alignItems: "flex-end", paddingBottom: "8px" }}>
                      {above && (
                        <div
                          className="text-center cursor-pointer group"
                          onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                        >
                          <p className="text-white text-[11px] font-bold leading-tight max-w-[120px] group-hover:text-white/80 transition-colors">{m.label}</p>
                          {m.description && <p className="text-white/35 text-[9px] mt-0.5 max-w-[120px]">{m.description}</p>}
                        </div>
                      )}
                    </div>

                    {/* Circle node */}
                    <div
                      className="relative cursor-pointer z-10"
                      onClick={() => toggleStatus(m.id)}
                      style={{
                        width: "16px", height: "16px", borderRadius: "50%",
                        background: color,
                        boxShadow: `0 0 16px ${isDone ? "rgba(16,185,129,0.5)" : "rgba(96,165,250,0.5)"}`,
                        border: "2px solid rgba(255,255,255,0.3)",
                        flexShrink: 0,
                      }}
                    />

                    {/* Date below node */}
                    <div style={{ height: "20px", display: "flex", alignItems: "flex-start", paddingTop: "4px" }}>
                      <p className="text-white/35 text-[9px] font-mono text-center">
                        {m.date ? format(new Date(m.date + "T00:00:00"), "MM/yyyy") : "—"}
                      </p>
                    </div>

                    {/* Bottom label */}
                    <div style={{ height: "60px", display: "flex", alignItems: "flex-start", paddingTop: "4px" }}>
                      {!above && (
                        <div
                          className="text-center cursor-pointer group"
                          onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                        >
                          <p className="text-white text-[11px] font-bold leading-tight max-w-[120px] group-hover:text-white/80 transition-colors">{m.label}</p>
                          {m.description && <p className="text-white/35 text-[9px] mt-0.5 max-w-[120px]">{m.description}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Edit panel + list */}
      <div className="grid gap-3">
        {milestones.map((m, i) => (
          <div
            key={m.id}
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${editingId === m.id ? "ring-2 ring-[#7B2FBE]/30 bg-violet-50" : "bg-white hover:bg-slate-50"}`}
            style={{ border: "1px solid #E2E8F0" }}
          >
            {/* Status dot */}
            <button
              onClick={() => updateMilestone(m.id, { status: m.status === "DONE" ? "PLANNED" : "DONE" })}
              className="shrink-0"
            >
              {m.status === "DONE"
                ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                : <Circle className="w-5 h-5 text-slate-300 hover:text-[#7B2FBE] transition-colors" />
              }
            </button>

            {/* Label */}
            {editingId === m.id ? (
              <input
                autoFocus
                value={m.label}
                onChange={(e) => updateMilestone(m.id, { label: e.target.value })}
                className="flex-1 text-sm font-semibold text-[#0F172A] border-b border-[#7B2FBE] outline-none bg-transparent"
              />
            ) : (
              <span
                className={`flex-1 text-sm font-semibold cursor-pointer ${m.status === "DONE" ? "line-through text-slate-400" : "text-[#0F172A]"}`}
                onClick={() => setEditingId(m.id)}
              >
                {m.label}
              </span>
            )}

            {/* Date */}
            <input
              type="date"
              value={m.date}
              onChange={(e) => updateMilestone(m.id, { date: e.target.value })}
              className="text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-[#7B2FBE] bg-white"
            />

            {/* Description (when editing) */}
            {editingId === m.id && (
              <input
                value={m.description ?? ""}
                onChange={(e) => updateMilestone(m.id, { description: e.target.value })}
                placeholder="Descrição (opcional)"
                className="text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-[#7B2FBE] bg-white w-40"
              />
            )}

            {/* Position number */}
            <span className="text-[10px] text-slate-300 font-bold shrink-0">{i + 1}</span>

            <button
              onClick={() => setEditingId(editingId === m.id ? null : m.id)}
              className={`shrink-0 p-1 rounded transition-colors ${editingId === m.id ? "text-[#7B2FBE]" : "text-slate-300 hover:text-slate-500"}`}
            >
              {editingId === m.id ? <Check className="w-3.5 h-3.5" /> : <Pen className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => removeMilestone(m.id)}
              className="shrink-0 p-1 rounded text-slate-200 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addMilestone}
        className="flex items-center gap-2 text-sm font-semibold text-[#7B2FBE] hover:text-[#9333EA] transition-colors"
      >
        <Plus className="w-4 h-4" /> Adicionar Marco
      </button>
    </div>
  )
}

// ── File Icon helper ──────────────────────────────────────────────────────────

function FileIcon({ type }: { type: string }) {
  if (type.includes("image")) return <ImageIcon className="w-4 h-4 text-blue-500" />
  if (type.includes("sheet") || type.includes("excel") || type.includes("csv")) return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
  return <FileText className="w-4 h-4 text-slate-400" />
}

// ── Main Client ───────────────────────────────────────────────────────────────

interface KickOffClientProps {
  project:             ProjectData
  existing:            (KickOffData & { id: string }) | null
  projectParticipants: PickerUser[]
  allUsers:            PickerUser[]
}

export function KickOffClient({ project, existing, projectParticipants, allUsers }: KickOffClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isRegistered = !!existing?.registeredAt

  // ── State ──────────────────────────────────────────────────────────────────
  const [docId, setDocId] = useState(existing?.id)
  const [meetingDate, setMeetingDate] = useState(existing?.meetingDate ?? new Date().toISOString().slice(0, 10))
  const [location, setLocation] = useState(existing?.location ?? "")
  const [objectives, setObjectives] = useState(existing?.objectives ?? "")
  const [eapAreas, setEapAreas] = useState<EAPArea[]>(() => existing?.eapAreas ?? generateEAP(project))
  const [milestones, setMilestones] = useState<Milestone[]>(() => existing?.milestones ?? generateMilestones(project))
  const [attachments, setAttachments] = useState<KickOffAttachment[]>(existing?.attachments ?? [])
  const [attendeeIds, setAttendeeIds] = useState<string[]>(
    existing?.attendeeIds ?? projectParticipants.map((p) => p.id)
  )
  const [externalAttendees, setExternalAttendees] = useState<ExternalAttendee[]>(
    existing?.externalAttendees ?? []
  )
  const [notes, setNotes] = useState(existing?.notes ?? "")
  const [observations, setObservations] = useState(existing?.observations ?? "")
  const [uploading, setUploading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [showSuccess, setShowSuccess] = useState(false)
  const [activeSection, setActiveSection] = useState("reunion")

  // ── Actions ────────────────────────────────────────────────────────────────

  function buildData(): KickOffData {
    return {
      id: docId,
      projectId: project.id,
      meetingDate,
      location,
      objectives,
      eapAreas,
      milestones,
      attachments,
      attendeeIds,
      externalAttendees,
      notes,
      observations,
    }
  }

  function removeExternal(id: string) {
    setExternalAttendees((prev) => prev.filter((e) => e.id !== id))
  }

  function handleSave() {
    setSaveStatus("saving")
    startTransition(async () => {
      const result = await saveKickOff(buildData())
      setDocId(result.id)
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2000)
    })
  }

  function handleRegister() {
    startTransition(async () => {
      await registerKickOff(buildData())
      setShowSuccess(true)
    })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      const fd = new FormData()
      fd.append("files", file)
      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd })
        const data = await res.json()
        if (data.files?.[0]) {
          setAttachments((prev) => [...prev, {
            id: uid(),
            name: file.name,
            url: data.files[0].url,
            fileType: file.type,
            size: file.size,
          }])
        }
      } catch {}
    }
    setUploading(false)
    e.target.value = ""
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  function toggleAttendee(userId: string) {
    setAttendeeIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  // ── Success Screen ─────────────────────────────────────────────────────────
  if (showSuccess) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "linear-gradient(135deg, #0F172A, #1E1B4B)" }}>
        <div className="text-center space-y-8 px-8 max-w-md">
          <div className="relative mx-auto w-24 h-24">
            <div className="absolute inset-0 rounded-full animate-ping" style={{ background: "rgba(16,185,129,0.15)" }} />
            <div className="relative w-24 h-24 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #10B981, #059669)", boxShadow: "0 0 60px rgba(16,185,129,0.4)" }}>
              <Rocket className="w-10 h-10 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-black text-white">Projeto Iniciado!</h1>
            <p className="text-white/60 mt-2">O Kick-Off foi registrado com sucesso.</p>
            <p className="text-emerald-400 font-bold mt-1">Status → Em Andamento</p>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              href={`/projects/${project.id}/kickoff-presentation`}
              className="inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl text-sm font-black text-white transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 8px 32px rgba(123,47,190,0.4)" }}
            >
              <Presentation className="w-5 h-5" />
              Gerar Apresentação de Kick-Off
            </Link>
            <Link
              href={`/projects/${project.id}`}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-semibold text-white/60 hover:text-white transition-colors border border-white/10 hover:border-white/30"
            >
              Ir para o Projeto
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]">

      {/* Top bar */}
      <div className="flex items-center gap-4 px-5 h-14 border-b border-slate-200 bg-white shrink-0">
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#0F172A] transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 font-medium">Kick-Off</p>
          <p className="text-sm font-black text-[#0F172A] truncate">{project.title}</p>
        </div>

        {isRegistered && (
          <span className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Kick-Off Realizado
          </span>
        )}
        {isRegistered && (
          <Link
            href={`/projects/${project.id}/kickoff-presentation`}
            className="inline-flex items-center gap-1.5 px-3.5 h-8 text-xs font-bold rounded-xl text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 16px rgba(123,47,190,0.3)" }}
          >
            <Presentation className="w-3.5 h-3.5" /> Apresentação
          </Link>
        )}
        <button
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-3.5 h-8 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-[#7B2FBE] hover:text-[#7B2FBE] transition-all"
        >
          {saveStatus === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : saveStatus === "saved" ? <><Check className="w-3.5 h-3.5" /> Salvo</>
            : <><Save className="w-3.5 h-3.5" /> Salvar</>}
        </button>
        {!isRegistered && (
          <button
            onClick={handleRegister}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 h-8 text-xs font-black rounded-xl text-white transition-all hover:opacity-90 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #10B981, #059669)", boxShadow: "0 4px 16px rgba(16,185,129,0.35)" }}
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
            Registrar Kick-Off
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">

        {/* Left sidebar nav */}
        <div className="w-52 shrink-0 border-r border-slate-200 bg-white flex flex-col py-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-3">Seções</p>
          {SECTION_NAV.map((s) => {
            const Icon = s.icon
            const isActive = activeSection === s.id
            return (
              <button
                key={s.id}
                onClick={() => {
                  setActiveSection(s.id)
                  document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                }}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-all text-left ${
                  isActive
                    ? "text-[#7B2FBE] bg-violet-50 border-r-2 border-[#7B2FBE]"
                    : "text-slate-500 hover:text-[#0F172A] hover:bg-slate-50"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-[#7B2FBE]" : "text-slate-400"}`} />
                {s.label}
              </button>
            )
          })}

          {/* Summary box */}
          <div className="mt-auto mx-3 mb-2 p-3 rounded-xl" style={{ background: "linear-gradient(135deg, #F5F3FF, #EDE9FE)", border: "1px solid rgba(123,47,190,0.12)" }}>
            <p className="text-[10px] font-black text-violet-600 uppercase tracking-widest mb-2">Resumo</p>
            <div className="space-y-1">
              <p className="text-xs text-slate-600"><span className="font-bold">{eapAreas.length}</span> áreas na EAP</p>
              <p className="text-xs text-slate-600"><span className="font-bold">{eapAreas.reduce((acc, a) => acc + a.tasks.length, 0)}</span> atividades</p>
              <p className="text-xs text-slate-600"><span className="font-bold">{milestones.length}</span> marcos</p>
              <p className="text-xs text-slate-600"><span className="font-bold">{attendeeIds.length}</span> participantes</p>
              <p className="text-xs text-slate-600"><span className="font-bold">{attachments.length}</span> arquivos</p>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-5xl mx-auto px-8 py-8 space-y-12">

            {/* ── Hero card ── */}
            <div
              className="rounded-2xl p-6 text-white relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E1B4B 60%, #2D1B69 100%)", boxShadow: "0 8px 40px rgba(0,0,0,0.20)" }}
            >
              <div style={{ position: "absolute", width: "300px", height: "300px", borderRadius: "50%", top: "-100px", right: "-50px", background: "radial-gradient(circle, rgba(123,47,190,0.20) 0%, transparent 65%)", pointerEvents: "none" }} />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <div className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ background: "rgba(16,185,129,0.15)", color: "#34D399", border: "1px solid rgba(52,211,153,0.25)" }}>
                    Kick-Off
                  </div>
                  <div className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white/50 border border-white/10">
                    {isRegistered ? "Registrado" : "Rascunho"}
                  </div>
                </div>
                <h1 className="text-2xl font-black leading-tight">{project.title}</h1>
                {project.description && <p className="text-white/50 text-sm mt-1">{project.description}</p>}
                <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-white/40">
                  <span>Solicitante: <strong className="text-white/70">{project.sponsor?.name ?? "—"}</strong></span>
                  {project.expectedStart && (
                    <span>Início previsto: <strong className="text-white/70">{format(parseDateStr(project.expectedStart), "dd/MM/yyyy")}</strong></span>
                  )}
                  {project.expectedEnd && (
                    <span>Término previsto: <strong className="text-white/70">{format(parseDateStr(project.expectedEnd), "dd/MM/yyyy")}</strong></span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Section 1: Reunião ── */}
            <section id="section-reunion">
              <SectionHeader number={1} title="Informações da Reunião" icon={Calendar} />
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-700 uppercase tracking-widest text-slate-400 mb-1.5">Data da Reunião</label>
                  <input
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] outline-none focus:border-[#7B2FBE] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-700 uppercase tracking-widest text-slate-400 mb-1.5">Local / Sala / Link</label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Ex: Sala de Reuniões 2, Microsoft Teams..."
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] outline-none focus:border-[#7B2FBE] transition-colors placeholder-slate-300"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-700 uppercase tracking-widest text-slate-400 mb-1.5">Objetivos do Projeto</label>
                  <textarea
                    value={objectives}
                    onChange={(e) => setObjectives(e.target.value)}
                    rows={5}
                    placeholder="Descreva os objetivos, escopo e expectativas do projeto para apresentar na reunião de Kick-Off..."
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] outline-none focus:border-[#7B2FBE] transition-colors resize-y placeholder-slate-300 leading-relaxed"
                  />
                </div>
              </div>
            </section>

            {/* ── Section 2: EAP ── */}
            <section id="section-eap">
              <SectionHeader number={2} title="EAP — Estrutura Analítica do Projeto" icon={Target} description="Defina as atividades por área. Clique no nome da área ou na tarefa para editar." />
              <div className="mt-4">
                <EAPTable areas={eapAreas} onChange={setEapAreas} />
              </div>
            </section>

            {/* ── Section 3: Marcos ── */}
            <section id="section-marcos">
              <SectionHeader number={3} title="Cronograma de Marcos" icon={CheckCircle2} description="Defina as grandes entregas do projeto. Clique no círculo para marcar como concluído." />
              <div className="mt-4">
                <MarcosTimeline milestones={milestones} onChange={setMilestones} />
              </div>
            </section>

            {/* ── Section 4: Documentos ── */}
            <section id="section-documentos">
              <SectionHeader number={4} title="Documentos & Anexos" icon={Paperclip} description="Adicione qualquer arquivo relevante: análises, planilhas, imagens, apresentações." />
              <div className="mt-4 space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex flex-col items-center justify-center gap-3 py-10 rounded-2xl border-2 border-dashed border-slate-200 hover:border-[#7B2FBE] hover:bg-violet-50 transition-all text-slate-400 hover:text-[#7B2FBE]"
                >
                  {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                  <div className="text-center">
                    <p className="text-sm font-semibold">{uploading ? "Enviando..." : "Clique ou arraste arquivos aqui"}</p>
                    <p className="text-xs mt-1 text-slate-300">Excel · Word · PDF · Imagens · Qualquer formato</p>
                  </div>
                </button>

                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((att) => (
                      <div key={att.id} className="flex items-center gap-3 p-3 rounded-xl bg-white" style={{ border: "1px solid #E2E8F0" }}>
                        <FileIcon type={att.fileType} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#0F172A] truncate">{att.name}</p>
                          {att.size && <p className="text-xs text-slate-400">{(att.size / 1024).toFixed(0)} KB</p>}
                        </div>
                        <a href={att.url} target="_blank" rel="noreferrer" className="text-xs text-[#2463FF] hover:underline font-medium shrink-0">
                          Ver
                        </a>
                        <button onClick={() => removeAttachment(att.id)} className="shrink-0 text-slate-300 hover:text-red-400 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {attachments.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-2">Nenhum arquivo anexado ainda.</p>
                )}
              </div>
            </section>

            {/* ── Section 5: Participantes ── */}
            <section id="section-participantes">
              <SectionHeader number={5} title="Participantes & Notas" icon={Users} description="Selecione quem participará do Kick-Off." />
              <div className="mt-4 space-y-4">
                <MeetingParticipantPicker
                  projectParticipants={projectParticipants}
                  allUsers={allUsers}
                  selectedIds={attendeeIds}
                  onChange={setAttendeeIds}
                  externalAttendees={externalAttendees.map((e) => ({
                    id: e.id, name: e.name, area: e.role ?? "", kind: e.kind ?? "EXTERNO" as const,
                  }))}
                  onAddExternal={(p) => setExternalAttendees((prev) => [...prev, { id: p.id, name: p.name, role: p.area, kind: p.kind, type: p.kind === "INTERNO" ? "INTERNAL" : "EXTERNAL" }])}
                  onRemoveExternal={(id) => setExternalAttendees((prev) => prev.filter((e) => e.id !== id))}
                />

                <div>
                  <label className="block text-xs font-700 uppercase tracking-widest text-slate-400 mb-1.5">Notas & Decisões da Reunião</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    placeholder="Ações definidas, decisões tomadas, próximos passos..."
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] outline-none focus:border-[#7B2FBE] transition-colors resize-y placeholder-slate-300 leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-700 uppercase tracking-widest text-slate-400 mb-1.5">Observações</label>
                  <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    rows={3}
                    placeholder="Comentários livres sobre esta reunião (aparecerá na ATA)..."
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] outline-none focus:border-violet-400 transition-colors resize-y placeholder-slate-300 leading-relaxed"
                  />
                </div>
              </div>
            </section>

            {/* ── Bottom CTA ── */}
            {!isRegistered && (
              <div
                className="rounded-2xl p-6 flex items-center justify-between"
                style={{ background: "linear-gradient(135deg, #F0FDF4, #DCFCE7)", border: "1px solid rgba(16,185,129,0.20)" }}
              >
                <div>
                  <p className="font-black text-emerald-800 text-base">Pronto para iniciar o projeto?</p>
                  <p className="text-emerald-600 text-sm mt-0.5">
                    Ao registrar, o status mudará para <strong>Em Andamento</strong> e a EAP será criada no sistema.
                  </p>
                </div>
                <button
                  onClick={handleRegister}
                  disabled={isPending}
                  className="inline-flex items-center gap-2.5 px-6 py-3 text-sm font-black rounded-2xl text-white transition-all hover:opacity-90 disabled:opacity-60 shrink-0"
                  style={{ background: "linear-gradient(135deg, #10B981, #059669)", boxShadow: "0 8px 24px rgba(16,185,129,0.35)" }}
                >
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  Registrar Kick-Off
                </button>
              </div>
            )}

            <div className="h-8" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ number, title, icon: Icon, description }: {
  number: number
  title: string
  icon: typeof Calendar
  description?: string
}) {
  return (
    <div className="flex items-start gap-4">
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-white text-sm font-black"
        style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 12px rgba(123,47,190,0.25)" }}
      >
        {number}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400" />
          <h2 className="text-base font-black text-[#0F172A]">{title}</h2>
        </div>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
        <div className="h-px bg-slate-100 mt-3" />
      </div>
    </div>
  )
}
