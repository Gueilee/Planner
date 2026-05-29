import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { DocsViewer } from "./docs-viewer"

export const metadata = { title: "Documentos — Planner" }

export default async function DocsPage() {
  const session = await auth()

  if (session?.user?.role !== "ADMIN") {
    redirect("/dashboard")
  }

  return (
    <div className="flex flex-col h-full">
      <Header />
      <DocsViewer />
    </div>
  )
}
