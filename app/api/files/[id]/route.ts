import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return new NextResponse("Not found", { status: 404 })

  const att = await db.attachment.findUnique({ where: { id } })
  if (!att) return new NextResponse("Not found", { status: 404 })

  // Serve blob stored in DB
  if (att.blobData) {
    const buffer = Buffer.from(att.blobData, "base64")
    const mime   = att.mimeType ?? "application/octet-stream"
    const name   = encodeURIComponent(att.fileName)
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":        mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${name}`,
        "Content-Length":      String(buffer.byteLength),
        "Cache-Control":       "private, max-age=86400",
      },
    })
  }

  // External URL (Vercel Blob etc.) — redirect
  if (att.fileUrl.startsWith("http")) {
    return NextResponse.redirect(att.fileUrl)
  }

  return new NextResponse("Not found", { status: 404 })
}
