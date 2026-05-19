import { Header } from "@/components/layout/header"
import { Users, Sparkles } from "lucide-react"

export default function Page() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Usuários" subtitle="Gestão de usuários e permissões do sistema" />
      <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div
            className="relative w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{
              background: "linear-gradient(135deg, #5B21B6 0%, #7C3AED 50%, #8B5CF6 100%)",
              boxShadow: "0 8px 32px rgba(124,58,237,0.35)",
            }}
          >
            <Users className="w-9 h-9 text-white" />
            <Sparkles className="absolute -top-2 -right-2 w-5 h-5 text-yellow-400 animate-pulse" />
          </div>
          <h3 className="text-xl font-black text-[#0F172A] mb-2">Em desenvolvimento</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            O módulo de usuários permitirá gerenciar acesso, perfis e permissões de toda a equipe da organização.
          </p>
          <div
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold"
            style={{ background: "rgba(124,58,237,0.08)", color: "#7C3AED", border: "1px solid rgba(124,58,237,0.15)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED] animate-pulse" />
            Em breve
          </div>
        </div>
      </div>
    </div>
  )
}
