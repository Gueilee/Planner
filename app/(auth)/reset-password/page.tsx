"use client"

import { useState, useTransition } from "react"
import { Loader2, CheckCircle, ArrowLeft } from "lucide-react"
import { requestPasswordReset } from "@/lib/actions/password-reset"

export default function ResetPasswordPage() {
  const [email,     setEmail]     = useState("")
  const [sent,      setSent]      = useState(false)
  const [isPending, start]        = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      await requestPasswordReset(email)
      setSent(true)
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

            {sent ? (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <CheckCircle style={{ width: 48, height: 48, color: "#16a34a", margin: "0 auto 16px" }} />
                <h2 className="lp-title" style={{ fontSize: 20 }}>E-mail enviado!</h2>
                <p className="lp-sub">
                  Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha em instantes.
                  Verifique também a pasta de spam.
                </p>
                <a href="/login" className="lp-back">← Voltar ao login</a>
              </div>
            ) : (
              <>
                <h1 className="lp-title">Esqueceu a senha?</h1>
                <p className="lp-sub">
                  Informe seu e-mail e enviaremos um link para você criar uma nova senha.
                </p>

                <form onSubmit={handleSubmit} className="lp-form">
                  <div className="lp-field">
                    <label className="lp-lbl">E-mail</label>
                    <input
                      type="email"
                      className="lp-inp"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>

                  <button type="submit" disabled={isPending} className="lp-btn">
                    {isPending
                      ? <><Loader2 size={16} className="lp-spin" /> Enviando...</>
                      : <span>Enviar link de redefinição</span>}
                  </button>
                </form>

                <p className="lp-footer" style={{ marginTop: 16 }}>
                  <a href="/login" className="lp-back">← Voltar ao login</a>
                </p>
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
        .lp-footer { margin-top: 22px; text-align: center; font-size: 11px; color: #a09db8; letter-spacing: 0.04em; }
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
