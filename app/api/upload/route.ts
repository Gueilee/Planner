import { NextRequest, NextResponse } from "next/server"
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
  "application/zip", "application/x-rar-compressed",
])

const ALLOWED_EXTENSIONS = new Set([
  "jpg","jpeg","png","gif","webp","pdf","docx","doc","xlsx","xls","txt","csv","zip","rar",
])

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100)
}

// Try Vercel Blob if token is available, otherwise fall back to local filesystem
async function storeFile(buffer: Buffer, originalName: string, mimeType: string): Promise<string> {
  const fname = `${Date.now()}-${sanitizeName(originalName)}`

  // Vercel Blob (production)
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob")
    const blob = await put(`uploads/${fname}`, buffer, {
      access: "public",
      contentType: mimeType || "application/octet-stream",
      addRandomSuffix: false,
    })
    return blob.url
  }

  // Local filesystem (development)
  const { writeFile, mkdir } = await import("fs/promises")
  const path = await import("path")
  const uploadsDir = path.join(process.cwd(), "public", "uploads")
  await mkdir(uploadsDir, { recursive: true })
  await writeFile(path.join(uploadsDir, fname), buffer)
  return `/uploads/${fname}`
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const files    = formData.getAll("files") as File[]

  if (!files.length) return NextResponse.json({ files: [] })

  const uploaded: { name: string; url: string; size: number }[] = []

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Arquivo "${file.name}" excede o limite de 10MB` },
        { status: 413 }
      )
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `Tipo não permitido: .${ext}` }, { status: 415 })
    }

    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: `MIME type não permitido: ${file.type}` }, { status: 415 })
    }

    const bytes  = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const url    = await storeFile(buffer, file.name, file.type)
    uploaded.push({ name: file.name, url, size: file.size })
  }

  return NextResponse.json({ files: uploaded })
}
