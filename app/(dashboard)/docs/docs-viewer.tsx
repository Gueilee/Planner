"use client"

import { useRef, useState } from "react"
import { FileText, ExternalLink, Printer, Loader2 } from "lucide-react"

export function DocsViewer() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [printing, setPrinting] = useState(false)

  function handlePrint() {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    setPrinting(true)
    // Give the iframe a moment to be ready, then trigger print
    setTimeout(() => {
      iframe.contentWindow!.focus()
      iframe.contentWindow!.print()
      setPrinting(false)
    }, 200)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
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
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Restrito — Administrador
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Print / PDF button */}
          <button
            onClick={handlePrint}
            disabled={printing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}
          >
            {printing ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparando...</>
            ) : (
              <><Printer className="w-3.5 h-3.5" /> Gerar PDF / Imprimir</>
            )}
          </button>

          {/* Open in new tab */}
          <a
            href="/docs/especificacao-funcional.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 hover:bg-white hover:text-[#7B2FBE] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Nova aba
          </a>
        </div>
      </div>

      {/* iframe */}
      <iframe
        ref={iframeRef}
        src="/docs/especificacao-funcional.html"
        className="flex-1 w-full border-0"
        title="Especificação Funcional do Sistema"
      />
    </div>
  )
}
