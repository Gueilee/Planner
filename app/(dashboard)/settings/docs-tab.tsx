"use client"

import { DocsViewer } from "@/app/(dashboard)/docs/docs-viewer"

export function DocsTab() {
  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 180px)" }}>
      <DocsViewer />
    </div>
  )
}
