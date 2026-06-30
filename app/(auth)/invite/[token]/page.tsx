"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { validateInvitation, acceptInvitation } from "@/lib/actions/invitations"

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter()
  const [token,    setToken]    = useState("")
  const [name,     setName]     = useState("")
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [confirm,  setConfirm]  = useState("")
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState("")
  const [done,     setDone]     = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [isPending, start]      = useTransition()

  useEffect(() => {
    params.then(async ({ token: t }) => {
      setToken(t)
      const res = await validateInvitation(t)
      if (res.error) {
        setError(res.error)
      } else if (res.invitation) {
        setName(res.invitation.name)
        setEmail(res.invitation.email)
      }
      setLoading(false)
    })
  }, [params])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError("Senha deve ter no mínimo 6 caracteres"); return }
    if (password !== confirm)  { setError("As senhas não coincidem"); return }
    setError("")
    start(async () => {
      const res = await acceptInvitation(token, password)
      if (res.error) { setError(res.error); return }
      setDone(true)
      setTimeout(() => router.push("/login"), 2500)
    })
  }

  return (
    <div className="lp-root">
      <div className="lp-bg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/login_V4.png" alt="" className="lp-bg-img" draggable={false} />
      </div>
      <div className="lp-overlay" />
      <div className="lp-glow" />

      <div className="lp-card-wrap">
        <div className="lp-card">
          <div className="lp-logo" />

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
              <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: "#422c76" }} />
            </div>
          ) : done ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <CheckCircle style={{ width: 48, height: 48, color: "#16a34a", margin: "0 auto 16px" }} />
              <h2 className="lp-title" style={{ fontSize: 20 }}>Acesso ativado!</h2>
              <p className="lp-sub">Redirecionando para o login…</p>
            </div>
          ) : error && !name ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <AlertCircle style={{ width: 48, height: 48, color: "#dc2626", margin: "0 auto 16px" }} />
              <h2 className="lp-title" style={{ fontSize: 20 }}>Link inválido</h2>
              <p className="lp-sub">{error}</p>
            </div>
          ) : (
            <>
              <h1 className="lp-title">Bem-vindo(a), {name}!</h1>
              <p className="lp-sub">Defina sua senha para ativar o acesso ao PLANNER</p>

              <form onSubmit={handleSubmit} className="lp-form">
                <div className="lp-field">
                  <label className="lp-lbl">E-mail</label>
                  <input className="lp-input" type="email" value={email} disabled
                    style={{ opacity: 0.6, cursor: "not-allowed" }} />
                </div>

                <div className="lp-field">
                  <label className="lp-lbl">Nova senha</label>
                  <div style={{ position: "relative" }}>
                    <input
                      className="lp-input"
                      type={showPw ? "text" : "password"}
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="lp-field">
                  <label className="lp-lbl">Confirmar senha</label>
                  <input
                    className="lp-input"
                    type="password"
                    placeholder="Repita a senha"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <p style={{ color: "#dc2626", fontSize: 13, margin: "4px 0" }}>{error}</p>
                )}

                <button className="lp-btn" type="submit" disabled={isPending}>
                  {isPending ? <Loader2 className="animate-spin" style={{ width: 18, height: 18 }} /> : "Ativar meu acesso →"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
