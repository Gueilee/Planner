"use client"

import { useState, useTransition } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Bell, Check, Save, Loader2, Inbox, Trash2,
  Calendar, AlertTriangle, ShieldAlert, Users,
  CheckCheck, Clock, CalendarClock, Info,
} from "lucide-react"
import {
  saveNotificationPreferences,
  type NotificationPreferenceData,
} from "@/lib/actions/notification-preferences"
import { markRead, markAllRead, deleteNotification } from "@/lib/actions/notifications"

// ─── Types ────────────────────────────────────────────────────────────────────

type Pref = NotificationPreferenceData

type NotifItem = {
  id:        string
  type:      string
  title:     string
  message:   string
  link:      string | null
  read:      boolean
  createdAt: string
}

type Props = {
  preferences: Pref
  notifications: NotifItem[]
}

// ─── Notification visual config ───────────────────────────────────────────────

const NOTIF_CFG: Record<string, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  SUBMISSION_RECEIVED: { icon: Info,          color: "#2463FF", bg: "#EFF6FF", border: "#BFDBFE" },
  DECISION_NEEDED:     { icon: AlertTriangle,  color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  INITIATIVE_APPROVED: { icon: Check,          color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
  INITIATIVE_REJECTED: { icon: AlertTriangle,  color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  DEADLINE_ALERT:      { icon: CalendarClock,  color: "#F97316", bg: "#FFF7ED", border: "#FED7AA" },
  TASK_OVERDUE:        { icon: Clock,           color: "#EF4444", bg: "#FEF2F2", border: "#FECACA" },
  TASK_ASSIGNED:       { icon: Users,           color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  CHECKPOINT_ADDED:    { icon: CheckCheck,      color: "#0891B2", bg: "#ECFEFF", border: "#A5F3FC" },
  MEETING_ADDED:       { icon: Calendar,        color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
  CRITICAL_RISK:       { icon: ShieldAlert,     color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  DEFAULT:             { icon: Bell,            color: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" },
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

function PrefToggle({
  label, description, icon: Icon, color, enabled, onChange,
}: {
  label: string; description: string; icon: React.ElementType
  color: string; enabled: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-3.5 px-1">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${color}12` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#0F172A]">{label}</p>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{description}</p>
        </div>
      </div>
      {/* Toggle switch */}
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className="relative shrink-0 ml-4 w-11 h-6 rounded-full transition-all duration-200 focus:outline-none"
        style={{ background: enabled ? "linear-gradient(135deg, #7B2FBE, #2463FF)" : "#E2E8F0" }}
        role="switch"
        aria-checked={enabled}
      >
        <span
          className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200"
          style={{ left: enabled ? "calc(100% - 22px)" : "2px" }}
        />
      </button>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function NotificationsTab({ preferences: initial, notifications: initialNotifs }: Props) {
  const [prefs,  setPrefs]  = useState<Pref>(initial)
  const [notifs, setNotifs] = useState<NotifItem[]>(initialNotifs)
  const [saved,  setSaved]  = useState(false)
  const [isPending, start]  = useTransition()

  function toggle(key: keyof Pref) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
    setSaved(false)
  }

  function handleSave() {
    start(async () => {
      await saveNotificationPreferences(prefs)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    })
  }

  async function handleMarkAll() {
    await markAllRead()
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  async function handleDelete(id: string) {
    await deleteNotification(id)
    setNotifs((prev) => prev.filter((n) => n.id !== id))
  }

  async function handleMarkOne(id: string) {
    await markRead(id)
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
  }

  const unread = notifs.filter((n) => !n.read).length

  const PREF_GROUPS = [
    {
      label: "Projetos",
      items: [
        { key: "projectDeadline"  as keyof Pref, label: "Prazo se aproximando",    description: "Aviso 7 dias antes do término previsto do projeto",    icon: CalendarClock, color: "#F97316" },
        { key: "projectOnHold"    as keyof Pref, label: "Projeto pausado",          description: "Quando um projeto em que você participa for colocado em espera", icon: Clock,        color: "#8B5CF6" },
        { key: "projectCompleted" as keyof Pref, label: "Projeto concluído",        description: "Quando um projeto for marcado como concluído",          icon: Check,        color: "#059669" },
      ],
    },
    {
      label: "Atividades",
      items: [
        { key: "taskOverdue"   as keyof Pref, label: "Tarefa atrasada",         description: "Quando uma tarefa sob sua responsabilidade está atrasada",    icon: AlertTriangle, color: "#EF4444" },
        { key: "taskAssigned"  as keyof Pref, label: "Tarefa atribuída a mim",  description: "Quando você é designado como responsável por uma atividade",  icon: Users,         color: "#7C3AED" },
      ],
    },
    {
      label: "Reuniões",
      items: [
        { key: "checkpointAdded" as keyof Pref, label: "Checkpoint registrado", description: "Quando um checkpoint é registrado em projeto que você participa", icon: CheckCheck, color: "#0891B2" },
        { key: "meetingAdded"    as keyof Pref, label: "Qualquer reunião",       description: "Para cada reunião registrada nos seus projetos",               icon: Calendar,   color: "#059669" },
      ],
    },
    {
      label: "Riscos",
      items: [
        { key: "criticalRisk" as keyof Pref, label: "Risco crítico identificado", description: "Quando um risco crítico é adicionado a um projeto seu", icon: ShieldAlert, color: "#DC2626" },
      ],
    },
  ]

  return (
    <div className="space-y-4">

      {/* ── Preferences card ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6" style={{ border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-black text-[#0F172A]">Preferências de Notificação</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Escolha quais eventos geram alertas para você</p>
          </div>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}
          >
            {isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</>
              : saved
                ? <><Check className="w-3.5 h-3.5" /> Salvo!</>
                : <><Save className="w-3.5 h-3.5" /> Salvar</>}
          </button>
        </div>

        <div className="space-y-5">
          {PREF_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 px-1">{group.label}</p>
              <div className="divide-y divide-slate-50">
                {group.items.map((item) => (
                  <PrefToggle
                    key={item.key}
                    label={item.label}
                    description={item.description}
                    icon={item.icon}
                    color={item.color}
                    enabled={prefs[item.key]}
                    onChange={() => toggle(item.key)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Notification inbox ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6" style={{ border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-black text-[#0F172A]">Caixa de Notificações</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {notifs.length === 0
                ? "Nenhuma notificação recebida"
                : `${notifs.length} notificação${notifs.length > 1 ? "ões" : ""}${unread > 0 ? ` · ${unread} não lida${unread > 1 ? "s" : ""}` : " · todas lidas"}`}
            </p>
          </div>
          {unread > 0 && (
            <button
              onClick={handleMarkAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 hover:text-[#7B2FBE] hover:bg-violet-50 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Marcar todas como lidas
            </button>
          )}
        </div>

        {notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-300">
            <Inbox className="w-10 h-10" />
            <p className="text-sm font-semibold text-slate-400">Tudo limpo por aqui!</p>
            <p className="text-xs text-slate-300">As notificações aparecerão aqui conforme os eventos acontecem</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifs.map((n) => {
              const cfg  = NOTIF_CFG[n.type] ?? NOTIF_CFG.DEFAULT
              const Icon = cfg.icon
              return (
                <div
                  key={n.id}
                  className="flex items-start gap-3 p-4 rounded-xl transition-all group"
                  style={{
                    background: n.read ? "#FAFBFC" : `${cfg.color}06`,
                    border: `1px solid ${n.read ? "#F1F5F9" : cfg.border}`,
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${n.read ? "font-medium text-slate-500" : "font-bold text-[#0F172A]"}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{n.message}</p>
                    <p className="text-[10px] text-slate-300 mt-1.5">
                      {format(new Date(n.createdAt), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.read && (
                      <button
                        onClick={() => handleMarkOne(n.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                        title="Marcar como lida"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Remover notificação"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {!n.read && (
                    <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: cfg.color }} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
