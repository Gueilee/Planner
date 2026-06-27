import { getSCurveData } from "@/lib/actions/s-curve"
import { SCurveClient } from "./s-curve-client"
import { DatabaseZap } from "lucide-react"

function MigrationPending() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 bg-amber-50 rounded-2xl border border-amber-200">
      <DatabaseZap className="w-10 h-10 text-amber-400" />
      <div className="text-center">
        <p className="text-amber-800 font-semibold text-base">Migration pendente no banco de produção</p>
        <p className="text-amber-600 text-sm mt-1">
          Execute <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-xs">prisma migrate deploy</code> no servidor de produção.
        </p>
      </div>
    </div>
  )
}

export async function SCurveTab({ projectId }: { projectId: string }) {
  try {
    const data = await getSCurveData(projectId)
    return <SCurveClient projectId={projectId} initialData={data} />
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (
      msg.includes("no such table") ||
      msg.includes("does not exist") ||
      msg.includes("ProjectBaseline") ||
      msg.includes("BaselineSnap")
    ) {
      return <MigrationPending />
    }
    throw err
  }
}
