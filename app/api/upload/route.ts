import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv",
  "application/zip", "application/x-rar-compressed",
  "application/octet-stream", // fallback for files where browser doesn't detect MIME
])

const ALLOWED_EXTENSIONS = new Set([
  "jpg","jpeg","png","gif","webp",
  "pdf",
  "docx","doc",
  "xlsx","xls",
  "ppt","pptx",
  "txt","csv",
  "zip","rar",
])

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
  }

  const files = formData.getAll("files") as File[]
  if (!files.length) return NextResponse.json({ files: [] })

  const uploaded: { id: string; name: string; url: string; size: number }[] = []

  for (const file of files) {
    if (!(file instanceof File)) continue

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Arquivo "${file.name}" excede o limite de 20 MB` },
        { status: 413 },
      )
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `Extensão não permitida: .${ext}` },
        { status: 415 },
      )
    }

    // Allow octet-stream as fallback (some browsers don't detect MIME for .pptx etc)
    const mimeOk = !file.type || file.type === "application/octet-stream" || ALLOWED_TYPES.has(file.type)
    if (!mimeOk) {
      return NextResponse.json(
        { error: `Tipo de arquivo não permitido: ${file.type}` },
        { status: 415 },
      )
    }

    try {
      const bytes   = await file.arrayBuffer()
      const base64  = Buffer.from(bytes).toString("base64")
      const mime    = file.type || "application/octet-stream"

      // ── 1. Vercel Blob when token is configured ───────────────────────────
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const { put } = await import("@vercel/blob")
        const blob = await put(`uploads/${Date.now()}-${file.name}`, Buffer.from(bytes), {
          access: "public",
          contentType: mime,
          addRandomSuffix: false,
        })
        const att = await db.attachment.create({
          data: { fileName: file.name, fileUrl: blob.url, fileType: ext, fileSize: file.size, mimeType: mime },
        })
        uploaded.push({ id: att.id, name: file.name, url: blob.url, size: file.size })
        continue
      }

      // ── 2. Dev: filesystem ────────────────────────────────────────────────
      if (process.env.NODE_ENV !== "production") {
        const { writeFile, mkdir } = await import("fs/promises")
        const path = await import("path")
        const fname = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100)}`
        const dir   = path.join(process.cwd(), "public", "uploads")
        await mkdir(dir, { recursive: true })
        await writeFile(path.join(dir, fname), Buffer.from(bytes))
        const att = await db.attachment.create({
          data: { fileName: file.name, fileUrl: `/uploads/${fname}`, fileType: ext, fileSize: file.size, mimeType: mime },
        })
        uploaded.push({ id: att.id, name: file.name, url: `/uploads/${fname}`, size: file.size })
        continue
      }

      // ── 3. Production: save blob to DB, serve via /api/files/[id] ─────────
      const att = await db.attachment.create({
        data: {
          fileName: file.name,
          fileUrl:  "", // will be set after we have the ID
          fileType: ext,
          fileSize: file.size,
          blobData: base64,
          mimeType: mime,
        },
      })
      // Update fileUrl to point to our serve route
      await db.attachment.update({
        where: { id: att.id },
        data:  { fileUrl: `/api/files/${att.id}` },
      })

      uploaded.push({ id: att.id, name: file.name, url: `/api/files/${att.id}`, size: file.size })
    } catch (err) {
      console.error("[upload] error:", err)
      return NextResponse.json(
        { error: `Falha ao armazenar "${file.name}". Tente novamente.` },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({ files: uploaded })
}
