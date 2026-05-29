"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

// ─── Types ────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  CHECKPOINT:      "Checkpoint",
  GO_NO_GO:        "Go/No-Go",
  KICKOFF:         "Kick Off",
  GO_LIVE:         "Go-Live",
  POST_GOLIVE:     "Pós-Go-Live",
  LESSONS_LEARNED: "Lições Aprendidas",
  PROJECT_CLOSURE: "Encerramento de Projeto",
  STATUS_REPORT:   "Status Report",
  PILOT:           "Piloto",
  OTHER:           "Reunião",
}

const STATUS_LABELS: Record<string, string> = {
  INITIATIVE:  "A Iniciar",
  PLANNING:    "A Fazer",
  IN_PROGRESS: "Em Andamento",
  VALIDATION:  "Em Validação",
  COMPLETED:   "Concluída",
  ON_HOLD:     "Pausada",
  DELAYED:     "Atrasada",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
}

function fmtDateTime(d: Date): string {
  // Força fuso horário de Brasília (UTC-3) independente do servidor
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ""
  return `${get("day")}/${get("month")}/${get("year")} às ${get("hour")}:${get("minute")}`
}

function section(num: number, title: string, body: string): string {
  return `## ${num}. ${title.toUpperCase()}\n\n${body.trim() || "_Não informado_"}`
}

function participantTable(parts: { name: string; department: string | null }[]): string {
  if (!parts.length) return "_Nenhum participante registrado_"
  const rows = parts
    .map((p) => `| **${p.name}** | ${p.department ?? "—"} |`)
    .join("\n")
  return `| Nome | Departamento |\n|------|:-------------|\n${rows}`
}

function hr(): string { return "\n\n---\n\n" }

function encerramento(registeredBy: string, projectTitle: string): string {
  return (
    `Encerramos a reunião, onde eu, **${registeredBy}**, validei a ATA que será ` +
    `encaminhada por e-mail aos participantes para registro.\n\n` +
    `_O documento mostra as ações realizadas no projeto **${projectTitle}**._`
  )
}

// ─── Type-specific builders ───────────────────────────────────────────────────

async function buildCheckpointATA(
  meeting: MeetingWithRelations,
  projectTitle: string,
  participants: { name: string; department: string | null }[],
): Promise<string> {
  // Fetch task updates registered at this checkpoint
  const dateStr   = format(meeting.date, "dd/MM")
  const dayStart  = new Date(meeting.date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd    = new Date(meeting.date)
  dayEnd.setHours(23, 59, 59, 999)

  const comments = await db.comment.findMany({
    where: {
      task:      { projectId: meeting.projectId },
      content:   { startsWith: `[Checkpoint ${dateStr}]` },
      createdAt: { gte: dayStart, lte: dayEnd },
    },
    include: {
      task: {
        select: {
          title:  true,
          status: true,
          progress: true,
          wbsArea: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  // Extract frequency from title ("Checkpoint Semanal — 25/05/2025")
  const titleParts = meeting.title.split("—")[0].trim().replace("Checkpoint", "").trim()
  const frequency  = titleParts || "Periódico"

  let actSection = "_Nenhuma atividade atualizada neste checkpoint_"
  if (comments.length > 0) {
    const header = "| Atividade | Área | Status | % | Observação |\n|-----------|------|--------|---|:----------|\n"
    const rows   = comments.map((c) => {
      const obs = c.content.replace(`[Checkpoint ${dateStr}]`, "").trim()
      const area = c.task.wbsArea?.name ?? "—"
      const status = STATUS_LABELS[c.task.status] ?? c.task.status
      return `| ${c.task.title} | ${area} | ${status} | ${c.task.progress}% | ${obs || "—"} |`
    }).join("\n")
    actSection = header + rows
  }

  const sections = [
    section(1, "Participantes", participantTable(participants)),
    section(2, "Destaques e Situação Atual", meeting.content ?? ""),
    section(3, "Atualização de Atividades", actSection),
    section(4, "Impedimentos Identificados", meeting.nextActions ?? ""),
    section(5, "Próximas Ações e Responsabilidades", meeting.decisions ?? ""),
    section(6, "Observações", meeting.observations ?? ""),
    section(7, "Encerramento", encerramento(meeting.createdBy.name, projectTitle)),
  ]

  return buildDocument({
    typeLabel:    `Checkpoint ${frequency}`,
    projectTitle,
    date:         fmtDate(meeting.date),
    location:     meeting.location,
    registeredBy: meeting.createdBy.name,
    sections,
    generatedAt:  fmtDateTime(new Date()),
  })
}

async function buildGoNoGoATA(
  meeting: MeetingWithRelations,
  projectTitle: string,
  participants: { name: string; department: string | null }[],
): Promise<string> {
  // Parse decision from title: "Reunião Go/No-Go — APROVADO — Em Planejamento"
  const decisionMap: Record<string, { label: string; impact: string }> = {
    "APROVADO":    { label: "✅ GO — APROVADO", impact: "O projeto avança para a fase de **Planejamento**, com início formal das atividades previsto para os próximos dias, conforme cronograma estabelecido." },
    "ANÁLISE":     { label: "⏸ NO-GO — ANÁLISE FUTURA", impact: "O projeto permanece em **Análise Futura**. Serão necessárias adequações ou complementações ao escopo/viabilidade antes de nova deliberação." },
    "STAND BY":    { label: "⏸ STAND BY — AGUARDANDO", impact: "O projeto entra em **Stand By**. A retomada dependerá de condições específicas a serem confirmadas pelas partes envolvidas." },
  }

  let decisionInfo = { label: "Decisão registrada", impact: "Consultar notas da reunião." }
  for (const [key, val] of Object.entries(decisionMap)) {
    if (meeting.title.toUpperCase().includes(key)) { decisionInfo = val; break }
  }

  const sections = [
    section(1, "Participantes", participantTable(participants)),
    section(2, "Objetivo da Reunião",
      "Análise da viabilidade e maturidade do projeto para deliberação sobre o início formal da execução. " +
      "Os participantes avaliaram critérios de escopo, recursos, riscos e alinhamento estratégico."
    ),
    section(3, "Decisão Tomada",
      `**${decisionInfo.label}**\n\n` +
      (meeting.decisions ? `**Justificativa e Considerações:**\n\n${meeting.decisions}` : "")
    ),
    section(4, "Impacto e Próximos Passos", decisionInfo.impact),
    section(5, "Observações", meeting.observations ?? ""),
    section(6, "Encerramento", encerramento(meeting.createdBy.name, projectTitle)),
  ]

  return buildDocument({
    typeLabel:    "Reunião Go/No-Go",
    projectTitle,
    date:         fmtDate(meeting.date),
    location:     meeting.location,
    registeredBy: meeting.createdBy.name,
    sections,
    generatedAt:  fmtDateTime(new Date()),
  })
}

async function buildKickOffATA(
  meeting: MeetingWithRelations,
  projectTitle: string,
  participants: { name: string; department: string | null }[],
): Promise<string> {
  // Try to fetch the KickOff document for richer content
  const kickoffDoc = await db.projectDocument.findFirst({
    where: { projectId: meeting.projectId, type: "KICKOFF" },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  })

  let objectives = meeting.content ?? ""
  let eapContent = ""
  let milestonesContent = ""
  let externalAttendees = ""
  let notes = meeting.decisions ?? ""
  let observations = meeting.observations ?? ""

  if (kickoffDoc?.content) {
    try {
      const data = JSON.parse(kickoffDoc.content) as {
        objectives?: string
        eapAreas?: { name: string; tasks?: { text: string }[] }[]
        milestones?: { label: string; date?: string; status?: string; description?: string }[]
        externalAttendees?: { name: string; role?: string }[]
        notes?: string
        observations?: string
      }
      if (data.objectives)   objectives   = data.objectives
      if (data.notes)        notes        = data.notes
      if (data.observations) observations = data.observations

      if (data.eapAreas?.length) {
        eapContent = data.eapAreas.map((a, i) => {
          const tasks = a.tasks?.map((t) => `  - ${t.text}`).join("\n") ?? ""
          return `**${i + 1}. ${a.name}**\n${tasks}`
        }).join("\n\n")
      }

      if (data.milestones?.length) {
        const header = "| Marco | Data Prevista | Status | Descrição |\n|-------|:-------------:|--------|:----------|\n"
        const rows = data.milestones.map((m) =>
          `| ${m.label} | ${m.date ?? "—"} | ${m.status === "DONE" ? "✅ Realizado" : "⏳ Previsto"} | ${m.description ?? "—"} |`
        ).join("\n")
        milestonesContent = header + rows
      }

      if (data.externalAttendees?.length) {
        externalAttendees = data.externalAttendees
          .map((e) => `- **${e.name}**${e.role ? ` — ${e.role}` : ""}`)
          .join("\n")
      }
    } catch { /* ignore parse error, use meeting fields */ }
  }

  const base = externalAttendees ? 1 : 0
  const sections = [
    section(1, "Participantes Internos", participantTable(participants)),
    ...(externalAttendees ? [section(2, "Participantes Externos / Convidados", externalAttendees)] : []),
    section(2 + base, "Objetivos do Projeto", objectives),
    section(3 + base, "Estrutura Analítica do Projeto (EAP)", eapContent || "_EAP não detalhada neste registro_"),
    section(4 + base, "Marcos e Milestones", milestonesContent || "_Marcos não informados_"),
    section(5 + base, "Deliberações e Encaminhamentos", notes || "_Ver notas da reunião_"),
    section(6 + base, "Observações", observations),
    section(7 + base, "Encerramento", encerramento(meeting.createdBy.name, projectTitle)),
  ]

  return buildDocument({
    typeLabel:    "Reunião de Kick Off",
    projectTitle,
    date:         fmtDate(meeting.date),
    location:     meeting.location,
    registeredBy: meeting.createdBy.name,
    sections,
    generatedAt:  fmtDateTime(new Date()),
  })
}

async function buildGoLiveATA(
  meeting: MeetingWithRelations,
  projectTitle: string,
  participants: { name: string; department: string | null }[],
): Promise<string> {
  const isFaseado = meeting.location?.includes("Faseado") ?? false
  const deployType = isFaseado
    ? "**Faseado** — Piloto + Ramp-Up + Go-Live"
    : "**Direto** — Implantação imediata em ambiente de produção"

  const sections = [
    section(1, "Participantes", participantTable(participants)),
    section(2, "Escopo do Go-Live",
      `**Tipo de Implantação:** ${deployType}\n\n` +
      (meeting.content ? `**Detalhes técnicos:**\n\n${meeting.content}` : "")
    ),
    section(3, "Deliberações e Decisões", meeting.decisions ?? ""),
    section(4, "Monitoramento Pós Go-Live",
      (meeting.nextActions ?? "") +
      "\n\nA equipe de projeto permanecerá em suporte ativo durante o período de hipercare para garantir a estabilidade da operação."
    ),
    section(5, "Encerramento", encerramento(meeting.createdBy.name, projectTitle)),
  ]

  return buildDocument({
    typeLabel:    "Reunião de Go-Live",
    projectTitle,
    date:         fmtDate(meeting.date),
    location:     meeting.location,
    registeredBy: meeting.createdBy.name,
    sections,
    generatedAt:  fmtDateTime(new Date()),
  })
}

async function buildLessonsLearnedATA(
  meeting: MeetingWithRelations,
  projectTitle: string,
  participants: { name: string; department: string | null }[],
): Promise<string> {
  const lessons = await db.lessonLearned.findMany({
    where:   { projectId: meeting.projectId },
    orderBy: [{ influence: "asc" }, { impact: "desc" }, { createdAt: "asc" }],
    select:  { lesson: true, area: true, influence: true, impact: true, occurrence: true },
  })

  const positive = lessons.filter((l) => l.influence === "POSITIVE")
  const negative = lessons.filter((l) => l.influence === "NEGATIVE")

  function lessonList(ls: typeof lessons): string {
    if (!ls.length) return "_Nenhuma registrada_"
    return ls.map((l) =>
      `- **[${l.area}]** ${l.lesson}` +
      (l.impact ? ` _(Impacto: ${l.impact})_` : "") +
      (l.occurrence ? `\n  > ${l.occurrence}` : "")
    ).join("\n")
  }

  const sections = [
    section(1, "Participantes", participantTable(participants)),
    section(2, "Objetivo da Reunião",
      "Registro sistemático das lições aprendidas ao longo do ciclo de vida do projeto, " +
      "com foco na identificação de boas práticas e oportunidades de melhoria para projetos futuros."
    ),
    section(3, "Boas Práticas Identificadas", lessonList(positive)),
    section(4, "Oportunidades de Melhoria", lessonList(negative)),
    section(5, "Deliberações e Encaminhamentos",
      (meeting.decisions ?? "") +
      "\n\nAs lições registradas serão incorporadas à base de conhecimento organizacional para referência em projetos futuros."
    ),
    section(6, "Encerramento", encerramento(meeting.createdBy.name, projectTitle)),
  ]

  return buildDocument({
    typeLabel:    "Reunião de Lições Aprendidas",
    projectTitle,
    date:         fmtDate(meeting.date),
    location:     meeting.location,
    registeredBy: meeting.createdBy.name,
    sections,
    generatedAt:  fmtDateTime(new Date()),
  })
}

async function buildClosureATA(
  meeting: MeetingWithRelations,
  projectTitle: string,
  participants: { name: string; department: string | null }[],
): Promise<string> {
  // Fetch project summary stats
  const project = await db.project.findUnique({
    where:  { id: meeting.projectId },
    select: {
      actualStart: true,
      actualEnd:   true,
      expectedEnd: true,
      economy:     true,
      tasks:       { select: { status: true } },
    },
  })

  let statsContent = ""
  if (project) {
    const total    = project.tasks.length
    const done     = project.tasks.filter((t) => t.status === "COMPLETED").length
    const pct      = total > 0 ? Math.round((done / total) * 100) : 0
    const economy  = project.economy ? project.economy.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—"
    const start    = project.actualStart ? format(project.actualStart, "dd/MM/yyyy") : "—"
    const end      = project.actualEnd   ? format(project.actualEnd,   "dd/MM/yyyy") : "—"
    const expected = project.expectedEnd ? format(project.expectedEnd, "dd/MM/yyyy") : "—"

    statsContent =
      `| Indicador | Valor |\n|-----------|------|\n` +
      `| Início Real | ${start} |\n` +
      `| Término Real | ${end} |\n` +
      `| Término Previsto | ${expected} |\n` +
      `| Tarefas Concluídas | ${done}/${total} (${pct}%) |\n` +
      `| Economia Gerada | ${economy} |`
  }

  const sections = [
    section(1, "Participantes", participantTable(participants)),
    section(2, "Indicadores Finais do Projeto", statsContent || "_Dados não disponíveis_"),
    section(3, "Avaliação Final e Entregáveis", meeting.content ?? ""),
    section(4, "Decisões e Deliberações Finais", meeting.decisions ?? ""),
    section(5, "Ações e Responsabilidades Pós-Projeto", meeting.nextActions ?? ""),
    section(6, "Observações", meeting.observations ?? ""),
    section(7, "Declaração Formal de Encerramento",
      `O projeto **${projectTitle}** está formalmente encerrado a partir desta data. ` +
      "Todos os entregáveis foram aceitos, os sistemas estão em operação e as responsabilidades " +
      "de suporte foram transferidas às equipes de operação." +
      "\n\n" +
      encerramento(meeting.createdBy.name, projectTitle)
    ),
  ]

  return buildDocument({
    typeLabel:    "Reunião de Encerramento de Projeto",
    projectTitle,
    date:         fmtDate(meeting.date),
    location:     meeting.location,
    registeredBy: meeting.createdBy.name,
    sections,
    generatedAt:  fmtDateTime(new Date()),
  })
}

async function buildGenericATA(
  meeting: MeetingWithRelations,
  projectTitle: string,
  participants: { name: string; department: string | null }[],
): Promise<string> {
  const sections = [
    section(1, "Participantes", participantTable(participants)),
    section(2, "Pauta e Conteúdo Discutido", meeting.content ?? ""),
    section(3, "Deliberações e Decisões", meeting.decisions ?? ""),
    section(4, "Ações e Próximos Passos", meeting.nextActions ?? ""),
    section(5, "Encerramento", encerramento(meeting.createdBy.name, projectTitle)),
  ]

  return buildDocument({
    typeLabel:    TYPE_LABELS[meeting.type] ?? "Reunião",
    projectTitle,
    date:         fmtDate(meeting.date),
    location:     meeting.location,
    registeredBy: meeting.createdBy.name,
    sections,
    generatedAt:  fmtDateTime(new Date()),
  })
}

// ─── Document builder ─────────────────────────────────────────────────────────

function buildDocument(opts: {
  typeLabel:    string
  projectTitle: string
  date:         string
  location:     string | null
  registeredBy: string
  sections:     string[]
  generatedAt:  string
}): string {
  const header =
    `# ATA DE REUNIÃO — ${opts.typeLabel.toUpperCase()}\n\n` +
    `---\n\n` +
    `**Projeto:** ${opts.projectTitle}\n` +
    `**Tipo de Reunião:** ${opts.typeLabel}\n` +
    `**Data:** ${opts.date}\n` +
    `**Local:** ${opts.location || "A definir / Online"}\n` +
    `**Elaborado por:** ${opts.registeredBy}\n`

  const footer =
    `---\n\n` +
    `_Documento gerado automaticamente pelo sistema Planner em ${opts.generatedAt}_\n` +
    `_Projeto: ${opts.projectTitle} | ${opts.typeLabel}_`

  return header + hr() + opts.sections.join(hr()) + hr() + footer
}

// ─── Meeting type ─────────────────────────────────────────────────────────────

type MeetingWithRelations = {
  id:           string
  projectId:    string
  type:         string
  title:        string
  date:         Date
  location:     string | null
  content:      string | null
  decisions:    string | null
  nextActions:  string | null
  observations: string | null
  createdBy:    { name: string }
  participants: { user: { name: string; department: string | null } }[]
  project:      { title: string }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateMeetingATA(meetingId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    include: {
      createdBy:    { select: { name: true } },
      participants: { include: { user: { select: { name: true, department: true } } } },
      project:      { select: { title: true } },
    },
  })
  if (!meeting) throw new Error("Reunião não encontrada")

  const projectTitle = meeting.project.title
  const participants = meeting.participants.map((p) => ({
    name:       p.user.name,
    department: p.user.department,
  }))

  // Build ATA content based on meeting type
  let content: string
  switch (meeting.type) {
    case "CHECKPOINT":
      content = await buildCheckpointATA(meeting, projectTitle, participants)
      break
    case "GO_NO_GO":
      content = await buildGoNoGoATA(meeting, projectTitle, participants)
      break
    case "KICKOFF":
      content = await buildKickOffATA(meeting, projectTitle, participants)
      break
    case "GO_LIVE":
    case "POST_GOLIVE":
      content = await buildGoLiveATA(meeting, projectTitle, participants)
      break
    case "LESSONS_LEARNED":
      content = await buildLessonsLearnedATA(meeting, projectTitle, participants)
      break
    case "PROJECT_CLOSURE":
      content = await buildClosureATA(meeting, projectTitle, participants)
      break
    default:
      content = await buildGenericATA(meeting, projectTitle, participants)
  }

  const typeLabel = TYPE_LABELS[meeting.type] ?? "Reunião"
  const dateLabel = format(meeting.date, "dd/MM/yyyy")

  // Upsert ATA document
  const userId = (await db.user.findUnique({
    where:  { email: session.user.email! },
    select: { id: true },
  }))?.id ?? session.user.id!

  const existing = await db.projectDocument.findFirst({
    where: { meetingId },
  })

  let docId: string
  if (existing) {
    await db.projectDocument.update({
      where: { id: existing.id },
      data:  { content, updatedAt: new Date() },
    })
    docId = existing.id
  } else {
    const doc = await db.projectDocument.create({
      data: {
        projectId:   meeting.projectId,
        type:        "MEETING_ATA",
        title:       `ATA — ${typeLabel} — ${dateLabel}`,
        content,
        version:     1,
        meetingId,
        createdById: userId,
      },
    })
    docId = doc.id
  }

  revalidatePath(`/projects/${meeting.projectId}`)
  return { content, docId, meetingId }
}

// ─── Direct Checkpoint ATA (uses session data, not DB reconstruction) ─────────

export async function generateCheckpointATADirect(ctx: {
  meetingId:     string
  projectId:     string
  date:          Date
  frequency:     string
  location:      string
  highlights:    string
  blockers:      string
  nextSteps:     string
  observations?: string
  registeredBy:  string
  participants:  { name: string; department: string | null }[]
  taskUpdates:   {
    title: string; areaName: string; responsible: string
    startDate: string | null; endDate: string | null
    oldStatus: string; oldProgress: number
    status: string; progress: number; comment?: string
    attachments?: { fileName: string }[]
  }[]
}): Promise<string> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const project = await db.project.findUnique({ where: { id: ctx.projectId }, select: { title: true } })
  const projectTitle = project?.title ?? ctx.projectId

  const dateLabel = fmtDate(ctx.date)
  const dateTime  = fmtDateTime(new Date())

  // Build task update table
  let taskSection = "_Nenhuma atividade foi atualizada neste checkpoint._"

  if (ctx.taskUpdates.length > 0) {
    // Group by area
    const byArea = new Map<string, typeof ctx.taskUpdates>()
    for (const upd of ctx.taskUpdates) {
      const key = upd.areaName || "Sem Área"
      if (!byArea.has(key)) byArea.set(key, [])
      byArea.get(key)!.push(upd)
    }

    const parts: string[] = []
    for (const [area, updates] of byArea) {
      parts.push(`\n**Área: ${area}**\n`)
      const header = "| Atividade | Responsável | Datas Plan. | Status Anterior | Novo Status | % | Observação | Evidências |\n" +
                     "|-----------|-------------|-------------|-----------------|-------------|---|:-----------|:----------|\n"
      const rows = updates.map((u) => {
        const dates    = u.startDate && u.endDate ? `${u.startDate} → ${u.endDate}` : u.startDate ?? u.endDate ?? "—"
        const oldSt    = STATUS_LABELS[u.oldStatus]  ?? u.oldStatus
        const newSt    = STATUS_LABELS[u.status]     ?? u.status
        const changed  = u.status !== u.oldStatus || u.progress !== u.oldProgress
        const statusCell = changed ? `**${newSt}**` : newSt
        const attCount = u.attachments?.length ?? 0
        const evidence = attCount > 0 ? `${attCount} arquivo${attCount > 1 ? "s" : ""}` : "—"
        return `| ${u.title} | ${u.responsible} | ${dates} | ${oldSt} (${u.oldProgress}%) | ${statusCell} | ${u.progress}% | ${u.comment || "—"} | ${evidence} |`
      }).join("\n")
      parts.push(header + rows)
    }
    taskSection = parts.join("\n")
  }

  const participantList = ctx.participants.length
    ? participantTable(ctx.participants)
    : "_Nenhum participante registrado_"

  const sections = [
    section(1, "Participantes", participantList),
    section(2, "Destaques e Conquistas do Período", ctx.highlights || "_Não informado_"),
    section(3, "Atividades Atualizadas nesta Reunião", taskSection),
    section(4, "Impedimentos e Bloqueios Identificados", ctx.blockers || "_Nenhum impedimento registrado_"),
    section(5, "Próximos Passos e Responsabilidades", ctx.nextSteps || "_Não informado_"),
    section(6, "Observações", ctx.observations || ""),
    section(7, "Encerramento", encerramento(ctx.registeredBy, projectTitle)),
  ]

  const content = buildDocument({
    typeLabel:    `Checkpoint ${ctx.frequency}`,
    projectTitle,
    date:         dateLabel,
    location:     ctx.location || null,
    registeredBy: ctx.registeredBy,
    sections,
    generatedAt:  dateTime,
  })

  // Upsert ATA document
  const userId = (await db.user.findUnique({
    where:  { email: session.user.email! },
    select: { id: true },
  }))?.id ?? session.user.id!

  const existing = await db.projectDocument.findFirst({ where: { meetingId: ctx.meetingId } })
  if (existing) {
    await db.projectDocument.update({ where: { id: existing.id }, data: { content, updatedAt: new Date() } })
  } else {
    await db.projectDocument.create({
      data: {
        projectId:   ctx.projectId,
        type:        "MEETING_ATA",
        title:       `ATA — Checkpoint ${ctx.frequency} — ${format(ctx.date, "dd/MM/yyyy", { locale: ptBR })}`,
        content,
        version:     1,
        meetingId:   ctx.meetingId,
        createdById: userId,
      },
    })
  }

  revalidatePath(`/projects/${ctx.projectId}`)
  return content
}

export async function getExistingMeetingATA(meetingId: string) {
  const doc = await db.projectDocument.findFirst({
    where:  { meetingId },
    select: { id: true, content: true, updatedAt: true },
  })
  if (!doc?.content) return null
  return {
    docId:     doc.id,
    content:   doc.content,
    updatedAt: doc.updatedAt.toISOString(),
  }
}

export async function getAllMeetingsForProject(projectId: string) {
  const meetings = await db.meeting.findMany({
    where:   { projectId },
    orderBy: { date: "desc" },
    include: {
      createdBy:    { select: { name: true } },
      participants: { include: { user: { select: { name: true, department: true } } } },
      _count:       { select: { participants: true, attachments: true } },
    },
  })

  const atas = await db.projectDocument.findMany({
    where:  { projectId, type: "MEETING_ATA" },
    select: { meetingId: true, id: true, updatedAt: true },
  })
  const ataByMeeting = new Map(atas.map((a) => [a.meetingId, { docId: a.id, updatedAt: a.updatedAt }]))

  return meetings.map((m) => ({
    id:           m.id,
    type:         m.type as string,
    typeLabel:    TYPE_LABELS[m.type] ?? "Reunião",
    title:        m.title,
    date:         m.date.toISOString(),
    location:     m.location,
    observations: m.observations ?? null,
    registeredBy: m.createdBy.name,
    participants: m.participants.map((p) => ({ name: p.user.name, department: p.user.department })),
    participantCount: m._count.participants,
    attachmentCount:  m._count.attachments,
    hasATA:      ataByMeeting.has(m.id),
    ataDocId:    ataByMeeting.get(m.id)?.docId ?? null,
    ataUpdatedAt: ataByMeeting.get(m.id)?.updatedAt?.toISOString() ?? null,
  }))
}
