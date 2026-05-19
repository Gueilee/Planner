import { Header } from "@/components/layout/header"
import { Settings, Sparkles } from "lucide-react"

export default function Page() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Configurações" subtitle="Preferências e configurações do sistema" />
      <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div
            className="relative w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{
              background: "linear-gradient(135deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)",
              boxShadow: "0 8px 32px rgba(37,99,235,0.35)",
            }}
          >
            <Settings className="w-9 h-9 text-white animate-[spin_8s_linear_infinite]" />
            <Sparkles className="absolute -top-2 -right-2 w-5 h-5 text-yellow-400 animate-pulse" />
          </div>
          <h3 className="text-xl font-black text-[#0F172A] mb-2">Em desenvolvimento</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            As configurações de perfil, notificações e preferências da organização serão disponibilizadas em breve.
          </p>
          <div
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold"
            style={{ background: "rgba(37,99,235,0.08)", color: "#2563EB", border: "1px solid rgba(37,99,235,0.15)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse" />
            Em breve
          </div>
        </div>
      </div>
    </div>
  )
}
