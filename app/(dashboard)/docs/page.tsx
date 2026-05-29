import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { FileText, Lock, ExternalLink } from "lucide-react"

export const metadata = { title: "Documentos — Planner" }

export default async function DocsPage() {
  const session = await auth()

  if (session?.user?.role !== "ADMIN") {
    redirect("/dashboard")
  }

  return (
    <div className="flex flex-col h-full">
      <Header />

      <div className="flex flex-col flex-1 min-h-0 bg-[#F7F6F2]">
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-6 py-3 shrink-0 bg-white"
          style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}
            >
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[#0F172A] leading-tight">Documentos do Sistema</h1>
              <p className="text-[11px] text-slate-400 leading-tight mt-0.5">Especificação Técnica e Funcional</p>
            </div>
            <span
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ml-2"
              style={{ background: "rgba(239,68,68,0.08)", color: "#DC2626", border: "1px solid rgba(239,68,68,0.15)" }}
            >
              <Lock className="w-2.5 h-2.5" />
              Restrito — Administrador
            </span>
          </div>

          <a
            href="/docs/especificacao-funcional.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 hover:bg-white hover:text-[#7B2FBE] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir em nova aba
          </a>
        </div>

        {/* iframe */}
        <iframe
          src="/docs/especificacao-funcional.html"
          className="flex-1 w-full border-0"
          title="Especificação Funcional do Sistema"
        />
      </div>
    </div>
  )
}
