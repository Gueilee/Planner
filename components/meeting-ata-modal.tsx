"use client"

import { useState, useCallback } from "react"
import { X, Printer, Copy, Check, Loader2, FileText } from "lucide-react"

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

  const handlePrint = useCallback(() => {
    const win = window.open("", "_blank")
    if (!win) return

    // Convert markdown to a minimal print-ready HTML
    const htmlContent = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^---$/gm, "<hr>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/_(.+?)_/g, "<em>$1</em>")
      .replace(/^\| /gm, "TABLE_ROW_START| ")
      .split("\n")
      .map((line) => {
        if (line.startsWith("TABLE_ROW_START")) {
          return line.replace("TABLE_ROW_START", "")
        }
        if (line.startsWith("<h") || line.startsWith("<hr")) return line
        if (line.trim() === "") return "<br>"
        if (line.startsWith("- ") || line.startsWith("* ")) return `<li>${line.slice(2)}</li>`
        return `<p>${line}</p>`
      })
      .join("\n")

    win.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; margin: 2cm; }
          h1 { font-size: 16pt; font-weight: bold; border-bottom: 2pt solid #000; padding-bottom: 4pt; margin-top: 0; }
          h2 { font-size: 11pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1pt; margin-top: 18pt; }
          hr { border: none; border-top: 1pt solid #999; margin: 12pt 0; }
          p { line-height: 1.6; margin: 4pt 0; font-size: 11pt; }
          li { margin-bottom: 3pt; }
          table { width: 100%; border-collapse: collapse; font-size: 10pt; margin: 8pt 0; }
          th { background: #f0f0f0; padding: 4pt 8pt; text-align: left; border: 1pt solid #ccc; font-weight: bold; }
          td { padding: 4pt 8pt; border: 1pt solid #ccc; }
          strong { font-weight: bold; }
          em { font-style: italic; }
        </style>
      </head>
      <body>${htmlContent}</body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 250)
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
          padding: "14px 20px",
          borderBottom: "1px solid #E2E8F0",
          background: "#F8FAFC",
          borderRadius: "16px 16px 0 0",
          flexShrink: 0,
        }}>
          <div style={{
            width: "34px", height: "34px", borderRadius: "8px",
            background: "linear-gradient(135deg, #0F172A, #1E293B)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <FileText size={16} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "13px", fontWeight: 800, color: "#0F172A", margin: 0 }}>{title}</p>
            <p style={{ fontSize: "11px", color: "#64748B", margin: 0 }}>Documento gerado automaticamente</p>
          </div>

          <button
            onClick={handleCopy}
            title="Copiar texto"
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "6px 12px", borderRadius: "8px",
              border: "1px solid #E2E8F0", background: "#fff",
              fontSize: "12px", fontWeight: 600, color: "#475569",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {copied ? <Check size={13} color="#10B981" /> : <Copy size={13} />}
            {copied ? "Copiado!" : "Copiar"}
          </button>

          <button
            onClick={handlePrint}
            title="Imprimir"
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "6px 12px", borderRadius: "8px",
              border: "1px solid #0F172A", background: "#0F172A",
              fontSize: "12px", fontWeight: 600, color: "#fff",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <Printer size={13} />
            Imprimir
          </button>

          <button
            onClick={onClose}
            title="Fechar"
            style={{
              width: "30px", height: "30px", borderRadius: "8px",
              border: "1px solid #E2E8F0", background: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#64748B",
            }}
          >
            <X size={15} />
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
