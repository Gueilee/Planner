import { redirect } from "next/navigation"

// Fase 6 (corte): o motor v2 virou o Cronograma oficial em /schedule — esta
// rota (usada durante a fase Beta) só redireciona, para não quebrar links
// antigos salvos/compartilhados.
export default async function ScheduleV2RedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/projects/${id}/schedule`)
}
