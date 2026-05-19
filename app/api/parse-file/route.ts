import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  const bytes = await file.arrayBuffer()
  const buf = Buffer.from(bytes)

  try {
    // ── Excel ──────────────────────────────────────────────────────
    if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      const XLSX = await import("xlsx")
      const wb = XLSX.read(buf, { type: "buffer" })
      const sheets = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name]
        const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null })
        const allRows = raw.filter((r) => r.some((c) => c !== null && c !== ""))
        if (allRows.length === 0) return { name, headers: [], rows: [] }
        const headers = allRows[0].map((h) => String(h ?? ""))
        const rows = allRows.slice(1)
        return { name, headers, rows }
      }).filter((s) => s.headers.length > 0)
      return NextResponse.json({ type: "excel", sheets, fileName: file.name })
    }

    // ── Word ───────────────────────────────────────────────────────
    if (ext === "docx" || ext === "doc") {
      const mammoth = await import("mammoth")
      const result = await mammoth.extractRawText({ buffer: buf })
      const paragraphs = result.value
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 20)
      return NextResponse.json({ type: "word", paragraphs, fileName: file.name })
    }

    // ── Plain text ─────────────────────────────────────────────────
    if (ext === "txt" || ext === "md") {
      const text = new TextDecoder().decode(buf)
      const paragraphs = text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 10)
      return NextResponse.json({ type: "text", paragraphs, fileName: file.name })
    }

    // ── Image ──────────────────────────────────────────────────────
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
      return NextResponse.json({ type: "image", fileName: file.name, requiresUpload: true })
    }

    return NextResponse.json({ type: "unsupported", fileName: file.name, ext })
  } catch (err) {
    console.error("parse-file error:", err)
    return NextResponse.json({ error: "Failed to parse file", fileName: file.name }, { status: 500 })
  }
}
