// Grava os feriados nacionais (mesma fonte de lib/working-days.ts) num
// WorkCalendarV2 para um projeto — primeira vez que o calendário de
// feriados do Cronograma v2 fica editável pelo time sem precisar de
// deploy de código (WorkCalendarV2/HolidayV2 são tabelas, não mais uma
// constante hardcoded).
//
// Uso: npx tsx scripts/seed-work-calendar-v2.ts <projectId> [anoInicial] [anoFinal]
// Exemplo: npx tsx scripts/seed-work-calendar-v2.ts cmxxxxx 2025 2027

import { db } from "../lib/db"
import { getHolidaysForYear } from "../lib/working-days"

async function main() {
  const [projectId, anoInicialArg, anoFinalArg] = process.argv.slice(2)
  if (!projectId) {
    console.error("Uso: npx tsx scripts/seed-work-calendar-v2.ts <projectId> [anoInicial] [anoFinal]")
    process.exit(1)
  }

  const anoAtual = new Date().getFullYear()
  const anoInicial = anoInicialArg ? parseInt(anoInicialArg, 10) : anoAtual - 1
  const anoFinal = anoFinalArg ? parseInt(anoFinalArg, 10) : anoAtual + 2

  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, title: true } })
  if (!project) throw new Error(`Projeto ${projectId} não encontrado`)

  const calendar = await db.workCalendarV2.upsert({
    where: { projectId },
    update: {},
    create: { projectId, diasUteis: [1, 2, 3, 4, 5] },
  })

  let created = 0
  for (let ano = anoInicial; ano <= anoFinal; ano++) {
    for (const h of getHolidaysForYear(ano)) {
      await db.holidayV2.upsert({
        where: { calendarId_dia: { calendarId: calendar.id, dia: new Date(`${h.date}T00:00:00`) } },
        update: { descricao: h.name },
        create: { calendarId: calendar.id, dia: new Date(`${h.date}T00:00:00`), descricao: h.name },
      })
      created++
    }
  }

  console.log(`Calendário do projeto "${project.title}" (${projectId}) semeado com ${created} feriados (${anoInicial}-${anoFinal}).`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
