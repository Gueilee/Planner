import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { auth } from "@/auth"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain", "text/csv",
])
const ALLOWED_EXTENSIONS = new Set([
  "jpg","jpeg","png","gif","webp","pdf","docx","doc","xlsx","xls","txt","csv",
])

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const files = formData.getAll("files") as File[]

  if (!files.length) return NextResponse.json({ files: [] })

  const uploadsDir = path.join(process.cwd(), "public", "uploads")
  await mkdir(uploadsDir, { recursive: true })

  const uploaded: { name: string; url: string; size: number }[] = []

  for (const file of files) {
    // Size check
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Arquivo "${file.name}" excede o limite de 10MB` },
        { status: 413 }
      )
    }

    // Extension check
    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `Tipo de arquivo não permitido: .${ext}` },
        { status: 415 }
      )
    }

    // MIME type check
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `MIME type não permitido: ${file.type}` },
        { status: 415 }
      )
    }

    const bytes  = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    // Sanitize filename — only alphanumeric, dots, dashes, underscores
    const safe   = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100)
    const fname  = `${Date.now()}-${safe}`
    await writeFile(path.join(uploadsDir, fname), buffer)
    uploaded.push({ name: file.name, url: `/uploads/${fname}`, size: file.size })
  }

  return NextResponse.json({ files: uploaded })
}
