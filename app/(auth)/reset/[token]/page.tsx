"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { validateResetToken, resetPassword } from "@/lib/actions/password-reset"

export default function ResetTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter()
  const [token,     setToken]     = useState("")
  const [name,      setName]      = useState("")
  const [email,     setEmail]     = useState("")
  const [password,  setPassword]  = useState("")
  const [confirm,   setConfirm]   = useState("")
  const [showPw,    setShowPw]    = useState(false)
  const [error,     setError]     = useState("")
  const [done,      setDone]      = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [isPending, start]        = useTransition()

  useEffect(() => {
    params.then(async ({ token: t }) => {
      setToken(t)
      const res = await validateResetToken(t)
      if (res.error) {
        setError(res.error)
      } else {
        setName(res.name ?? "")
        setEmail(res.email ?? "")
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
      const res = await resetPassword(token, password)
      if (res.error) { setError(res.error); return }
      setDone(true)
      setTimeout(() => router.push("/login"), 2500)
    })
  }

  return (
    <>
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
                <Loader2 className="lp-spin" style={{ width: 32, height: 32, color: "#422c76" }} />
              </div>
            ) : done ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <CheckCircle style={{ width: 48, height: 48, color: "#16a34a", margin: "0 auto 16px" }} />
                <h2 className="lp-title" style={{ fontSize: 20 }}>Senha redefinida!</h2>
                <p className="lp-sub">Redirecionando para o login…</p>
              </div>
            ) : error && !name ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <AlertCircle style={{ width: 48, height: 48, color: "#dc2626", margin: "0 auto 16px" }} />
                <h2 className="lp-title" style={{ fontSize: 20 }}>Link inválido</h2>
                <p className="lp-sub">{error}</p>
                <a href="/reset-password" className="lp-back" style={{ marginTop: 16, display: "inline-block" }}>
                  Solicitar novo link →
                </a>
              </div>
            ) : (
              <>
                <h1 className="lp-title">Nova senha</h1>
                <p className="lp-sub">Olá, {name}! Defina sua nova senha para {email}.</p>

                <form onSubmit={handleSubmit} className="lp-form">
                  <div className="lp-field">
                    <label className="lp-lbl">Nova senha</label>
                    <div style={{ position: "relative" }}>
                      <input
                        className="lp-inp"
                        type={showPw ? "text" : "password"}
                        placeholder="Mínimo 6 caracteres"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ paddingRight: 46 }}
                        required
                      />
                      <button
                        type="button"
                        className="lp-eye"
                        onClick={() => setShowPw((v) => !v)}
                      >
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="lp-field">
                    <label className="lp-lbl">Confirmar senha</label>
                    <input
                      className="lp-inp"
                      type="password"
                      placeholder="Repita a senha"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                    />
                  </div>

                  {error && (
                    <div className="lp-err">
                      <span className="lp-err-dot" />
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={isPending} className="lp-btn">
                    {isPending
                      ? <><Loader2 size={16} className="lp-spin" /> Salvando...</>
                      : <span>Salvar nova senha →</span>}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; }

        .lp-root {
          position: fixed; inset: 0;
          display: flex; align-items: center; justify-content: flex-end;
          padding-right: 60px;
          font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
          background: #07031a;
        }
        .lp-bg { position: absolute; inset: 0; overflow: hidden; z-index: 0; }
        .lp-bg-img {
          position: absolute; left: 0; top: 0;
          width: 82%; height: 100%;
          object-fit: contain; object-position: left center; display: block;
        }
        .lp-overlay {
          position: absolute; inset: 0; z-index: 1;
          background: linear-gradient(to right,
            transparent 0%, transparent 52%,
            rgba(7,3,26,0.20) 62%, rgba(7,3,26,0.72) 72%,
            rgba(7,3,26,0.97) 80%, rgba(7,3,26,1.00) 100%);
        }
        .lp-glow {
          position: absolute; inset: 0; z-index: 2; pointer-events: none;
          background:
            radial-gradient(ellipse 55% 70% at 82% 50%, rgba(123,47,190,0.38) 0%, rgba(123,47,190,0.12) 40%, transparent 70%),
            radial-gradient(ellipse 40% 45% at 90% 22%, rgba(168,85,247,0.22) 0%, transparent 60%),
            radial-gradient(ellipse 45% 40% at 75% 82%, rgba(99,102,241,0.18) 0%, transparent 65%),
            radial-gradient(ellipse 70% 80% at 78% 50%, rgba(147,51,234,0.07) 0%, transparent 80%);
        }
        .lp-card-wrap { position: relative; z-index: 10; width: 400px; flex-shrink: 0; }
        .lp-card {
          background: #faf9f5; border-radius: 22px; padding: 38px 34px 30px; position: relative;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.08),
            0 4px 10px rgba(0,0,0,0.25), 0 12px 32px rgba(0,0,0,0.30),
            0 32px 64px rgba(0,0,0,0.28), 0 64px 120px rgba(0,0,0,0.22),
            0 0 60px rgba(123,47,190,0.22), 0 0 120px rgba(123,47,190,0.14),
            0 0 200px rgba(147,51,234,0.10);
        }
        .lp-card::before {
          content: ''; position: absolute; top: 0; left: 10%; right: 10%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.90) 25%, rgba(255,255,255,1.00) 50%, rgba(255,255,255,0.90) 75%, transparent);
          border-radius: 999px;
        }
        .lp-card::after {
          content: ''; position: absolute; inset: 0; border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.75); pointer-events: none;
        }
        .lp-logo {
          width: 100%; height: 70px; margin-bottom: 26px;
          background-image: url('/logo_v4.png');
          background-size: contain; background-repeat: no-repeat; background-position: center center;
        }
        .lp-title { font-size: 22px; font-weight: 800; color: #1a1625; letter-spacing: -0.025em; margin-bottom: 5px; }
        .lp-sub { font-size: 13px; color: #6b6880; margin-bottom: 26px; line-height: 1.5; }
        .lp-form { display: flex; flex-direction: column; gap: 15px; }
        .lp-field { display: flex; flex-direction: column; gap: 6px; }
        .lp-lbl { font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #4a4760; }
        .lp-inp {
          width: 100%; height: 46px; padding: 0 14px;
          background: #ffffff; border: 1.5px solid rgba(0,0,0,0.11); border-radius: 11px;
          color: #1a1625; font-size: 14px; outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05) inset;
        }
        .lp-inp::placeholder { color: #b0adc0; }
        .lp-inp:focus { border-color: #7B2FBE; box-shadow: 0 0 0 3px rgba(123,47,190,0.12), 0 1px 3px rgba(0,0,0,0.05) inset; }
        .lp-pw-wrap { position: relative; }
        .lp-eye {
          position: absolute; right: 13px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #9c99b0; line-height: 0; padding: 3px;
          transition: color 0.15s;
        }
        .lp-eye:hover { color: #4a4760; }
        .lp-err {
          display: flex; align-items: center; gap: 9px;
          padding: 10px 13px; border-radius: 10px;
          background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.20);
          font-size: 13px; color: #dc2626; font-weight: 500;
        }
        .lp-err-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: #ef4444; }
        .lp-btn {
          margin-top: 4px; height: 48px; width: 100%; border: none; border-radius: 12px;
          background: linear-gradient(135deg, #7B2FBE 0%, #9333EA 60%, #A855F7 100%);
          color: #fff; font-size: 14.5px; font-weight: 700; letter-spacing: 0.02em; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 9px;
          box-shadow: 0 4px 14px rgba(123,47,190,0.45), 0 1px 0 rgba(255,255,255,0.15) inset;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .lp-btn:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(123,47,190,0.65), 0 1px 0 rgba(255,255,255,0.15) inset; }
        .lp-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .lp-spin { animation: lp-rotate 0.8s linear infinite; }
        .lp-back { font-size: 13px; color: #7B2FBE; font-weight: 600; text-decoration: none; }
        .lp-back:hover { color: #9333EA; }
        @media (max-width: 768px) {
          .lp-root { padding-right: 0; justify-content: center; padding: 20px; }
          .lp-card-wrap { width: 100%; max-width: 400px; }
          .lp-bg-img { width: 100%; object-position: center center; }
          .lp-overlay { background: rgba(7,3,26,0.75); }
        }
        @keyframes lp-rotate { to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}
