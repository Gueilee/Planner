"use client"

import { useState, useCallback } from "react"
import { X, Printer, Copy, Check, Loader2 } from "lucide-react"

// ─── Simple Markdown → JSX renderer ──────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  // Process **bold**, _italic_ inline
  const parts: React.ReactNode[] = []
  const re = /(\*\*(.+?)\*\*|_(.+?)_)/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[0].startsWith("**")) {
      parts.push(<strong key={m.index}>{m[2]}</strong>)
    } else {
      parts.push(<em key={m.index}>{m[3]}</em>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function renderMarkdown(markdown: string): React.ReactNode[] {
  const lines = markdown.split("\n")
  const nodes: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // H1
    if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={key++} style={{
          fontSize: "18px", fontWeight: 900, color: "#0F172A",
          marginTop: "28px", marginBottom: "6px", letterSpacing: "-0.02em",
          borderBottom: "2px solid #0F172A", paddingBottom: "6px",
        }}>
          {renderInline(line.slice(2))}
        </h1>
      )
      i++; continue
    }

    // H2 (numbered sections)
    if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={key++} style={{
          fontSize: "13px", fontWeight: 800, color: "#1E293B",
          marginTop: "22px", marginBottom: "8px", letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}>
          {renderInline(line.slice(3))}
        </h2>
      )
      i++; continue
    }

    // HR
    if (line.trim() === "---") {
      nodes.push(<hr key={key++} style={{ border: "none", borderTop: "1px solid #E2E8F0", margin: "16px 0" }} />)
      i++; continue
    }

    // Table
    if (line.startsWith("|")) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i])
        i++
      }
      // Filter separator row (|---|)
      const rows = tableLines.filter((l) => !l.match(/^\|[\s\-|:]+\|$/))
      if (rows.length > 0) {
        const headers = rows[0].split("|").slice(1, -1).map((c) => c.trim())
        const bodyRows = rows.slice(1)
        nodes.push(
          <div key={key++} style={{ overflowX: "auto", marginTop: "8px", marginBottom: "8px" }}>
            <table style={{
              width: "100%", borderCollapse: "collapse",
              fontSize: "12px", color: "#1E293B",
            }}>
              <thead>
                <tr style={{ background: "#F1F5F9" }}>
                  {headers.map((h, hi) => (
                    <th key={hi} style={{
                      padding: "6px 10px", textAlign: "left",
                      fontWeight: 700, borderBottom: "2px solid #CBD5E1",
                      whiteSpace: "nowrap",
                    }}>
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => {
                  const cells = row.split("|").slice(1, -1).map((c) => c.trim())
                  return (
                    <tr key={ri} style={{ borderBottom: "1px solid #E2E8F0", background: ri % 2 === 0 ? "#fff" : "#F8FAFC" }}>
                      {cells.map((c, ci) => (
                        <td key={ci} style={{ padding: "5px 10px" }}>{renderInline(c)}</td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // List item
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].slice(2))
        i++
      }
      nodes.push(
        <ul key={key++} style={{ paddingLeft: "20px", margin: "6px 0" }}>
          {items.map((item, ii) => (
            <li key={ii} style={{ fontSize: "13px", color: "#334155", marginBottom: "3px" }}>
              {renderInline(item)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Empty line → spacing
    if (line.trim() === "") {
      nodes.push(<div key={key++} style={{ height: "6px" }} />)
      i++; continue
    }

    // Regular paragraph
    nodes.push(
      <p key={key++} style={{ fontSize: "13px", color: "#334155", lineHeight: "1.7", margin: "3px 0" }}>
        {renderInline(line)}
      </p>
    )
    i++
  }

  return nodes
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MeetingAtaModalProps {
  content: string
  title?: string
  onClose: () => void
}

export function MeetingAtaModal({ content, title = "ATA de Reunião", onClose }: MeetingAtaModalProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content])

  const handlePrint = useCallback(async () => {
    const win = window.open("", "_blank")
    if (!win) return

    // Try to load org config for custom logo/name
    let orgLogoUrl = window.location.origin + "/logo_v4.png"
    let orgName    = "Planner"
    try {
      const { getOrgConfig } = await import("@/lib/actions/org-config")
      const cfg = await getOrgConfig()
      if (cfg.logoUrl) orgLogoUrl = cfg.logoUrl
      if (cfg.name)    orgName    = cfg.name
    } catch { /* use defaults */ }

    const logoUrl = orgLogoUrl
    const now     = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })

    // Markdown → HTML conversion (improved)
    const processTable = (tableLines: string[]) => {
      const rows = tableLines.filter(l => !l.match(/^\|[\s\-|:]+\|$/))
      if (!rows.length) return ""
      return "<table>" + rows.map((row, ri) => {
        const cells = row.split("|").slice(1, -1).map(c => c.trim())
        const tag = ri === 0 ? "th" : "td"
        return "<tr>" + cells.map(c => `<${tag}>${c}</${tag}>`).join("") + "</tr>"
      }).join("") + "</table>"
    }

    const lines = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").split("\n")
    const htmlParts: string[] = []
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (line.startsWith("# "))  { htmlParts.push(`<h1>${line.slice(2)}</h1>`);  i++; continue }
      if (line.startsWith("## ")) { htmlParts.push(`<h2>${line.slice(3)}</h2>`); i++; continue }
      if (line.trim() === "---")  { htmlParts.push("<hr>"); i++; continue }
      if (line.startsWith("|")) {
        const tl: string[] = []
        while (i < lines.length && lines[i].startsWith("|")) { tl.push(lines[i]); i++ }
        htmlParts.push(processTable(tl)); continue
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const items: string[] = []
        while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
          items.push(`<li>${lines[i].slice(2).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/_(.+?)_/g, "<em>$1</em>")}</li>`)
          i++
        }
        htmlParts.push("<ul>" + items.join("") + "</ul>"); continue
      }
      if (line.trim() === "") { htmlParts.push("<div class='spacer'></div>"); i++; continue }
      htmlParts.push(`<p>${line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/_(.+?)_/g, "<em>$1</em>")}</p>`)
      i++
    }
    const htmlContent = htmlParts.join("\n")

    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page {
      size: A4;
      margin: 2.2cm 2cm 2.5cm 2cm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 10.5pt;
      color: #1a1a1a;
      margin: 0;
      line-height: 1.55;
    }

    /* ── Document header (logo + title) ── */
    .doc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 14pt;
      margin-bottom: 10pt;
      border-bottom: 2.5pt solid #0F172A;
    }
    .doc-header img { height: 42pt; width: auto; object-fit: contain; }
    .doc-header-text { text-align: right; }
    .doc-title { font-size: 14pt; font-weight: 800; color: #0F172A; margin: 0 0 2pt; letter-spacing: -0.3pt; }
    .doc-meta  { font-size: 8pt; color: #64748B; margin: 0; }

    /* ── Content ── */
    h1 {
      font-size: 13pt; font-weight: 800; color: #0F172A;
      border-left: 4pt solid #2463FF; padding-left: 8pt;
      margin: 20pt 0 8pt; page-break-after: avoid;
    }
    h2 {
      font-size: 9.5pt; font-weight: 700; color: #1E3A5F;
      text-transform: uppercase; letter-spacing: 0.8pt;
      margin: 16pt 0 5pt; padding-bottom: 3pt;
      border-bottom: 1pt solid #CBD5E1; page-break-after: avoid;
    }
    hr { border: none; border-top: 1pt solid #E2E8F0; margin: 12pt 0; }
    .spacer { margin: 3pt 0; }
    p  { margin: 3pt 0 5pt; font-size: 10.5pt; }
    ul { margin: 4pt 0 6pt 18pt; padding: 0; }
    li { margin: 2pt 0; font-size: 10pt; }
    strong { font-weight: 700; }
    em { font-style: italic; }

    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 8pt 0; page-break-inside: avoid; }
    th { background: #0F172A; color: #fff; padding: 5pt 7pt; text-align: left; font-weight: 700; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.5pt; }
    td { padding: 4.5pt 7pt; border-bottom: 0.5pt solid #E2E8F0; }
    tr:nth-child(even) td { background: #F8FAFC; }

    /* ── Footer ── */
    .doc-footer {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      border-top: 1pt solid #E2E8F0;
      display: flex; align-items: center; justify-content: space-between;
      padding: 5pt 0 0;
      font-size: 7.5pt; color: #94A3B8;
    }
    @media print {
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="doc-header">
    <img src="${logoUrl}" alt="${orgName}" onerror="this.style.display='none'" />
    <div class="doc-header-text">
      <p class="doc-title">${title}</p>
      <p class="doc-meta">Documento oficial gerado automaticamente &nbsp;|&nbsp; ${now}</p>
    </div>
  </div>

  ${htmlContent}

  <div class="doc-footer">
    <span>Planner — Sistema de Gestão de Projetos</span>
    <span>Gerado em ${now}</span>
  </div>
</body>
</html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 400)
  }, [content, title])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
          zIndex: 100, backdropFilter: "blur(2px)",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "40px", left: "50%", transform: "translateX(-50%)",
          width: "min(780px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 80px)",
          background: "#fff",
          borderRadius: "16px",
          boxShadow: "0 32px 80px rgba(15,23,42,0.25)",
          zIndex: 101,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: "12px",
          padding: "12px 16px",
          borderBottom: "1px solid #E2E8F0",
          background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
          borderRadius: "16px 16px 0 0",
          flexShrink: 0,
        }}>
          {/* Logo */}
          <img
            src="/logo_v4.png"
            alt="Kronex"
            style={{ height: "32px", width: "auto", objectFit: "contain", flexShrink: 0 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
          />
          <div style={{ flex: 1, minWidth: 0, marginLeft: "4px" }}>
            <p style={{ fontSize: "13px", fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.2 }}>{title}</p>
            <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)", margin: "2px 0 0" }}>
              Documento oficial gerado automaticamente pelo sistema
            </p>
          </div>

          <button
            onClick={handleCopy}
            title="Copiar texto da ATA"
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "5px 10px", borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)",
              fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.75)",
              cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
            }}
          >
            {copied ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
            {copied ? "Copiado!" : "Copiar"}
          </button>

          <button
            onClick={handlePrint}
            title="Gerar PDF e imprimir"
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "5px 12px", borderRadius: "8px",
              border: "1.5px solid #2463FF", background: "#2463FF",
              fontSize: "11px", fontWeight: 700, color: "#fff",
              cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
            }}
          >
            <Printer size={12} />
            Baixar PDF
          </button>

          <button
            onClick={onClose}
            title="Fechar"
            style={{
              width: "28px", height: "28px", borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "rgba(255,255,255,0.6)", flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          overflowY: "auto",
          padding: "28px 36px 36px",
          flex: 1,
        }}>
          {renderMarkdown(content)}
        </div>
      </div>
    </>
  )
}

// ─── Loading placeholder (while ATA is being generated) ───────────────────────

export function MeetingAtaGenerating({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 100, backdropFilter: "blur(2px)",
      }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        background: "#fff", borderRadius: "16px", padding: "40px 48px",
        boxShadow: "0 32px 80px rgba(15,23,42,0.25)", zIndex: 101,
        display: "flex", flexDirection: "column", alignItems: "center", gap: "16px",
      }}>
        <Loader2 size={32} color="#2463FF" style={{ animation: "spin 1s linear infinite" }} />
        <p style={{ fontSize: "14px", fontWeight: 600, color: "#0F172A", margin: 0 }}>Gerando ATA...</p>
        <p style={{ fontSize: "12px", color: "#64748B", margin: 0 }}>Aguarde um momento</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  )
}
