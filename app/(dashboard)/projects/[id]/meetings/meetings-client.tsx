"use client"

import { useState, useTransition } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowLeft, FileText, RefreshCw, Users, Paperclip, Calendar, MapPin } from "lucide-react"
import Link from "next/link"
import { generateMeetingATA, getExistingMeetingATA } from "@/lib/actions/ata"
import { MeetingAtaModal, MeetingAtaGenerating } from "@/components/meeting-ata-modal"

type MeetingItem = {
  id: string
  type: string
  typeLabel: string
  title: string
  date: string
  location: string | null
  observations: string | null
  registeredBy: string
  participantCount: number
  attachmentCount: number
  hasATA: boolean
  ataDocId: string | null
  ataUpdatedAt: string | null
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  CHECKPOINT:      { bg: "#EFF6FF", text: "#2463FF", border: "#BFDBFE" },
  GO_NO_GO:        { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
  KICKOFF:         { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  GO_LIVE:         { bg: "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" },
  POST_GOLIVE:     { bg: "#FDF4FF", text: "#A21CAF", border: "#F5D0FE" },
  LESSONS_LEARNED: { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
  PROJECT_CLOSURE: { bg: "#F8FAFC", text: "#475569", border: "#E2E8F0" },
  STATUS_REPORT:   { bg: "#ECFEFF", text: "#0891B2", border: "#A5F3FC" },
  PILOT:           { bg: "#FFF1F2", text: "#BE123C", border: "#FECDD3" },
  OTHER:           { bg: "#F8FAFC", text: "#64748B", border: "#E2E8F0" },
}

interface MeetingsClientProps {
  project: { id: string; title: string }
  meetings: MeetingItem[]
}

export function MeetingsClient({ project, meetings: initialMeetings }: MeetingsClientProps) {
  const [meetings, setMeetings] = useState(initialMeetings)
  const [generating, setGenerating] = useState<string | null>(null)
  const [ataModal, setAtaModal] = useState<{ content: string; title: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleGenerateATA(meeting: MeetingItem) {
    setGenerating(meeting.id)
    try {
      const result = await generateMeetingATA(meeting.id)
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === meeting.id
            ? { ...m, hasATA: true, ataDocId: result.docId, ataUpdatedAt: new Date().toISOString() }
            : m
        )
      )
      setAtaModal({
        content: result.content,
        title: `ATA — ${meeting.typeLabel} — ${format(new Date(meeting.date), "dd/MM/yyyy")}`,
      })
    } catch (e) {
      console.error(e)
    } finally {
      setGenerating(null)
    }
  }

  async function handleViewATA(meeting: MeetingItem) {
    setGenerating(meeting.id)
    try {
      const result = await getExistingMeetingATA(meeting.id)
      if (result) {
        setAtaModal({
          content: result.content,
          title: `ATA — ${meeting.typeLabel} — ${format(new Date(meeting.date), "dd/MM/yyyy")}`,
        })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC" }}>
      {/* Header */}
      <div style={{
        background: "#fff",
        borderBottom: "1px solid #E2E8F0",
        padding: "20px 32px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}>
        <Link
          href={`/projects/${project.id}`}
          style={{
            width: "36px", height: "36px", borderRadius: "10px",
            border: "1px solid #E2E8F0", background: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#64748B", flexShrink: 0,
          }}
        >
          <ArrowLeft size={16} />
        </Link>

        <div>
          <p style={{ fontSize: "11px", color: "#64748B", fontWeight: 600, margin: 0 }}>
            {project.title}
          </p>
          <h1 style={{ fontSize: "20px", fontWeight: 900, color: "#0F172A", margin: 0 }}>
            Histórico de Reuniões
          </h1>
        </div>

        <div style={{ marginLeft: "auto", fontSize: "13px", color: "#64748B", fontWeight: 500 }}>
          {meetings.length} reunião{meetings.length !== 1 ? "ões" : ""} registrada{meetings.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "32px", maxWidth: "900px", margin: "0 auto" }}>
        {meetings.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "80px 0",
            color: "#94A3B8", fontSize: "14px", fontWeight: 500,
          }}>
            Nenhuma reunião registrada neste projeto.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {meetings.map((meeting) => {
              const colors = TYPE_COLORS[meeting.type] ?? TYPE_COLORS.OTHER
              const isGenerating = generating === meeting.id

              return (
                <div
                  key={meeting.id}
                  style={{
                    background: "#fff",
                    border: "1px solid #E2E8F0",
                    borderRadius: "14px",
                    padding: "20px 24px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "16px",
                    transition: "box-shadow 0.15s",
                  }}
                >
                  {/* Type badge */}
                  <div style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    color: colors.text,
                    fontSize: "11px",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    marginTop: "2px",
                  }}>
                    {meeting.typeLabel}
                  </div>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A", margin: "0 0 6px" }}>
                      {meeting.title}
                    </p>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "12px", color: "#64748B" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Calendar size={12} />
                        {format(new Date(meeting.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </span>
                      {meeting.location && (
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <MapPin size={12} />
                          {meeting.location}
                        </span>
                      )}
                      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Users size={12} />
                        {meeting.participantCount} participante{meeting.participantCount !== 1 ? "s" : ""}
                      </span>
                      {meeting.attachmentCount > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Paperclip size={12} />
                          {meeting.attachmentCount} anexo{meeting.attachmentCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {meeting.hasATA && meeting.ataUpdatedAt && (
                      <p style={{ fontSize: "11px", color: "#10B981", fontWeight: 600, margin: "6px 0 0" }}>
                        ATA gerada em {format(new Date(meeting.ataUpdatedAt), "dd/MM/yyyy 'às' HH:mm")}
                      </p>
                    )}

                    {meeting.observations && (
                      <div style={{
                        marginTop: "10px",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        background: "#F8FAFC",
                        border: "1px solid #E2E8F0",
                        fontSize: "12px",
                        color: "#475569",
                        lineHeight: "1.5",
                      }}>
                        <span style={{ fontWeight: 700, color: "#64748B", textTransform: "uppercase", fontSize: "10px", letterSpacing: "0.08em" }}>Observações</span>
                        <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{meeting.observations}</p>
                      </div>
                    )}
                  </div>

                  {/* ATA actions */}
                  <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                    {meeting.hasATA ? (
                      <>
                        <button
                          onClick={() => handleViewATA(meeting)}
                          disabled={isGenerating}
                          style={{
                            display: "flex", alignItems: "center", gap: "6px",
                            padding: "7px 14px", borderRadius: "8px",
                            border: "1px solid #0F172A", background: "#0F172A",
                            fontSize: "12px", fontWeight: 600, color: "#fff",
                            cursor: "pointer", opacity: isGenerating ? 0.5 : 1,
                          }}
                        >
                          <FileText size={12} />
                          {isGenerating ? "Carregando..." : "Ver ATA"}
                        </button>
                        <button
                          onClick={() => handleGenerateATA(meeting)}
                          disabled={isGenerating}
                          title="Regerar ATA"
                          style={{
                            width: "32px", height: "32px", borderRadius: "8px",
                            border: "1px solid #E2E8F0", background: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", color: "#64748B",
                            opacity: isGenerating ? 0.5 : 1,
                          }}
                        >
                          <RefreshCw size={13} style={isGenerating ? { animation: "spin 1s linear infinite" } : {}} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleGenerateATA(meeting)}
                        disabled={isGenerating}
                        style={{
                          display: "flex", alignItems: "center", gap: "6px",
                          padding: "7px 14px", borderRadius: "8px",
                          border: "1px solid #2463FF", background: "#2463FF",
                          fontSize: "12px", fontWeight: 600, color: "#fff",
                          cursor: "pointer", opacity: isGenerating ? 0.5 : 1,
                        }}
                      >
                        <FileText size={12} />
                        {isGenerating ? "Gerando..." : "Gerar ATA"}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {generating && !ataModal && (
        <MeetingAtaGenerating onClose={() => setGenerating(null)} />
      )}

      {/* ATA Modal */}
      {ataModal && (
        <MeetingAtaModal
          content={ataModal.content}
          title={ataModal.title}
          onClose={() => setAtaModal(null)}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
