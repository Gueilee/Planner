"use client"

// Extraído de app/(dashboard)/projects/[id]/schedule-v2/schedule-v2-client.tsx
// (só existia ali) pra ser reaproveitado também pelo Gantt — mesmo visual
// de barra de ferramentas agrupada em "cartões" nas duas telas.

// `ghost`: usado dentro de um ToolbarGroup (o cartão já dá o fundo/borda) —
// sem contorno próprio, só reage no hover; sem `ghost`, mantém o pill branco
// contornado (usado fora de grupos, ex.: dentro de modais).
export function ToolbarBtn({ children, onClick, title, disabled, wide, ghost }: {
  children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; wide?: boolean; ghost?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`${wide ? "px-2.5 gap-1.5 text-xs font-bold" : "w-7 justify-center"} h-7 rounded-lg flex items-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        ghost
          ? "text-slate-500 hover:bg-white hover:shadow-sm hover:text-slate-800 disabled:hover:bg-transparent disabled:hover:shadow-none"
          : "border border-slate-200 text-slate-500 bg-white hover:bg-slate-100 hover:text-slate-800 disabled:hover:bg-white"
      }`}
    >
      {children}
    </button>
  )
}

// Agrupa botões relacionados num "cartão" leve — separa visualmente por
// finalidade (histórico, produtividade, compartilhamento) sem depender só
// de traços finos entre botões idênticos.
// `accent`: reservado pro grupo de ações que fazem sentido numa reunião com
// cliente (exportar/compartilhar) — leve tom violeta em vez do cinza padrão.
export function ToolbarGroup({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`flex items-center gap-0.5 p-1 rounded-xl border ${accent ? "bg-violet-50/50 border-violet-100" : "bg-slate-50 border-slate-100"}`}>
      {children}
    </div>
  )
}
