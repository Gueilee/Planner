import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// Serve user avatar from database — works whether the image is stored
// as a base64 data URL (default fallback) or an external URL (Vercel Blob).
// Keeping the actual image OUT of the JWT cookie avoids cookie overflow.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params

  if (!userId) {
    return new NextResponse(null, { status: 400 })
  }

  let image: string | null = null
  try {
    const user = await db.user.findUnique({
      where:  { id: userId },
      select: { image: true },
    })
    image = user?.image ?? null
  } catch {
    return new NextResponse(null, { status: 500 })
  }

  if (!image) {
    return new NextResponse(null, { status: 404 })
  }

  // ── Base64 data URL (e.g. "data:image/jpeg;base64,/9j/4AAQ...")
  if (image.startsWith("data:")) {
    const commaIdx = image.indexOf(",")
    if (commaIdx === -1) return new NextResponse(null, { status: 422 })

    const header   = image.slice(0, commaIdx)       // "data:image/jpeg;base64"
    const b64data  = image.slice(commaIdx + 1)      // actual base64
    const mimeType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg"
    const buffer   = Buffer.from(b64data, "base64")

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":  mimeType,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Content-Length": String(buffer.byteLength),
      },
    })
  }

  // ── External URL (Vercel Blob or other CDN) — redirect
  return NextResponse.redirect(image, { status: 302 })
}
