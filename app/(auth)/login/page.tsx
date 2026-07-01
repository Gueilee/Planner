"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2, ArrowRight } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const res = await signIn("credentials", { email, password, redirect: false })
    if (res?.error) {
      setError("E-mail ou senha inválidos.")
      setLoading(false)
      return
    }
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <>
      <div className="lp-root">

        {/* Imagem ancorada ao lado esquerdo */}
        <div className="lp-bg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/login_V4.png" alt="" className="lp-bg-img" draggable={false} />
        </div>

        {/* Gradiente de transição: imagem → escuro */}
        <div className="lp-overlay" />

        {/* Glow roxo profundo no lado direito */}
        <div className="lp-glow" />

        {/* Card de login flutuando à direita */}
        <div className="lp-card-wrap">
          <div className="lp-card">

            <div className="lp-logo" />

            <h1 className="lp-title">Bem-vindo de volta</h1>
            <p className="lp-sub">Acesse o PLANNER com suas credenciais</p>

            <form onSubmit={handleSubmit} className="lp-form">

              <div className="lp-field">
                <label className="lp-lbl">E-mail</label>
                <input
                  type="email"
                  className="lp-inp"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="lp-field">
                <div className="lp-lbl-row">
                  <label className="lp-lbl">Senha</label>
                  <a href="/reset-password" className="lp-forgot">
                    Esqueceu a senha?
                  </a>
                </div>
                <div className="lp-pw-wrap">
                  <input
                    type={showPw ? "text" : "password"}
                    className="lp-inp"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    style={{ paddingRight: 46 }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="lp-eye"
                    onClick={() => setShowPw(v => !v)}
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="lp-err">
                  <span className="lp-err-dot" />
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="lp-btn">
                {loading
                  ? <><Loader2 size={16} className="lp-spin" /> Entrando...</>
                  : <><span>Entrar no PLANNER</span><ArrowRight size={16} /></>}
              </button>
            </form>

            <p className="lp-footer">PLANNER © 2026 · By Vendemmia</p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; }

        /* ── Raiz — fundo escuro profundo (lado direito) ── */
        .lp-root {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding-right: 60px;
          font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
          background: #07031a;
        }

        /* ── Imagem ancorada ao lado esquerdo ── */
        .lp-bg {
          position: absolute;
          inset: 0;
          overflow: hidden;
          z-index: 0;
        }
        .lp-bg-img {
          position: absolute;
          left: 0;
          top: 0;
          width: 82%;
          height: 100%;
          object-fit: contain;
          object-position: left center;
          display: block;
        }

        /* ── Gradiente: imagem dissolve para escuro ── */
        .lp-overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: linear-gradient(
            to right,
            transparent         0%,
            transparent        52%,
            rgba(7,3,26,0.20)  62%,
            rgba(7,3,26,0.72)  72%,
            rgba(7,3,26,0.97)  80%,
            rgba(7,3,26,1.00) 100%
          );
        }

        /* ── Glow roxo em camadas no lado direito ── */
        .lp-glow {
          position: absolute;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          background:
            /* Halo principal atrás do card */
            radial-gradient(ellipse 55% 70% at 82% 50%,
              rgba(123,47,190,0.38) 0%,
              rgba(123,47,190,0.12) 40%,
              transparent 70%),
            /* Brilho quente superior */
            radial-gradient(ellipse 40% 45% at 90% 22%,
              rgba(168,85,247,0.22) 0%,
              transparent 60%),
            /* Brilho frio inferior */
            radial-gradient(ellipse 45% 40% at 75% 82%,
              rgba(99,102,241,0.18) 0%,
              transparent 65%),
            /* Ambient glow difuso */
            radial-gradient(ellipse 70% 80% at 78% 50%,
              rgba(147,51,234,0.07) 0%,
              transparent 80%);
        }

        /* ── Posição do card ── */
        .lp-card-wrap {
          position: relative;
          z-index: 10;
          width: 400px;
          flex-shrink: 0;
        }

        /* ── Card off-white com sombras para fundo escuro ── */
        .lp-card {
          background: #faf9f5;
          border-radius: 22px;
          padding: 38px 34px 30px;
          position: relative;
          box-shadow:
            /* Borda sutil */
            0 0 0 1px rgba(255,255,255,0.08),
            /* Sombras de profundidade */
            0 4px 10px  rgba(0,0,0,0.25),
            0 12px 32px rgba(0,0,0,0.30),
            0 32px 64px rgba(0,0,0,0.28),
            0 64px 120px rgba(0,0,0,0.22),
            /* Halo roxo ao redor do card */
            0 0 60px  rgba(123,47,190,0.22),
            0 0 120px rgba(123,47,190,0.14),
            0 0 200px rgba(147,51,234,0.10);
        }
        /* Reflexo de luz no topo */
        .lp-card::before {
          content: '';
          position: absolute;
          top: 0; left: 10%; right: 10%;
          height: 1px;
          background: linear-gradient(90deg,
            transparent,
            rgba(255,255,255,0.90) 25%,
            rgba(255,255,255,1.00) 50%,
            rgba(255,255,255,0.90) 75%,
            transparent
          );
          border-radius: 999px;
        }
        /* Borda luminosa */
        .lp-card::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.75);
          pointer-events: none;
        }

        /* ── Logo centralizado ── */
        .lp-logo {
          width: 100%;
          height: 70px;
          margin-bottom: 26px;
          background-image: url('/logo_v4.png');
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center center;
        }

        /* ── Textos ── */
        .lp-title {
          font-size: 22px;
          font-weight: 800;
          color: #1a1625;
          letter-spacing: -0.025em;
          margin-bottom: 5px;
        }
        .lp-sub {
          font-size: 13px;
          color: #6b6880;
          margin-bottom: 26px;
          line-height: 1.5;
        }

        /* ── Formulário ── */
        .lp-form { display: flex; flex-direction: column; gap: 15px; }
        .lp-field { display: flex; flex-direction: column; gap: 6px; }
        .lp-lbl-row { display: flex; justify-content: space-between; align-items: center; }

        .lp-lbl {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: #4a4760;
        }

        .lp-forgot {
          font-size: 12px;
          font-weight: 600;
          color: #7B2FBE;
          background: none;
          border: none;
          cursor: pointer;
          transition: color 0.15s;
        }
        .lp-forgot:hover { color: #9333EA; }

        /* ── Inputs ── */
        .lp-inp {
          width: 100%;
          height: 46px;
          padding: 0 14px;
          background: #ffffff;
          border: 1.5px solid rgba(0,0,0,0.11);
          border-radius: 11px;
          color: #1a1625;
          font-size: 14px;
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05) inset;
        }
        .lp-inp::placeholder { color: #b0adc0; }
        .lp-inp:focus {
          border-color: #7B2FBE;
          box-shadow: 0 0 0 3px rgba(123,47,190,0.12), 0 1px 3px rgba(0,0,0,0.05) inset;
        }
        .lp-inp:-webkit-autofill,
        .lp-inp:-webkit-autofill:hover,
        .lp-inp:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px #ffffff inset;
          -webkit-text-fill-color: #1a1625;
          border-color: rgba(0,0,0,0.11);
          transition: background-color 9999s;
          caret-color: #1a1625;
        }

        .lp-pw-wrap { position: relative; }
        .lp-eye {
          position: absolute; right: 13px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #9c99b0; line-height: 0; padding: 3px;
          transition: color 0.15s;
        }
        .lp-eye:hover { color: #4a4760; }

        /* ── Erro ── */
        .lp-err {
          display: flex; align-items: center; gap: 9px;
          padding: 10px 13px; border-radius: 10px;
          background: rgba(239,68,68,0.07);
          border: 1px solid rgba(239,68,68,0.20);
          font-size: 13px; color: #dc2626; font-weight: 500;
        }
        .lp-err-dot {
          width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
          background: #ef4444;
        }

        /* ── Botão ── */
        .lp-btn {
          margin-top: 4px;
          height: 48px; width: 100%;
          border: none; border-radius: 12px;
          background: linear-gradient(135deg, #7B2FBE 0%, #9333EA 60%, #A855F7 100%);
          color: #fff;
          font-size: 14.5px; font-weight: 700; letter-spacing: 0.02em;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 9px;
          box-shadow:
            0 4px 14px rgba(123,47,190,0.45),
            0 1px 0 rgba(255,255,255,0.15) inset;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .lp-btn:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(123,47,190,0.65), 0 1px 0 rgba(255,255,255,0.15) inset;
        }
        .lp-btn:not(:disabled):active { transform: translateY(0); }
        .lp-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .lp-spin { animation: lp-rotate 0.8s linear infinite; }

        /* ── Footer ── */
        .lp-footer {
          margin-top: 22px;
          text-align: center;
          font-size: 11px;
          color: #a09db8;
          letter-spacing: 0.04em;
        }

        /* ── Responsivo ── */
        @media (max-width: 768px) {
          .lp-root { padding-right: 0; justify-content: center; padding: 20px; }
          .lp-card-wrap { width: 100%; max-width: 400px; }
          .lp-bg-img { width: 100%; object-position: center center; }
          .lp-overlay { background: rgba(7,3,26,0.75); }
        }

        /* ── Keyframes ── */
        @keyframes lp-rotate { to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}
