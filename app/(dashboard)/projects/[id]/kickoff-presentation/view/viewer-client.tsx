"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, ChevronRight, X, Edit2, Maximize2, Minimize2, FileText,
} from "lucide-react"
import Link from "next/link"
import { KOSlideRenderer } from "../builder-client"
import type { KOPresentation } from "@/lib/types/kickoff-presentation"

interface KOViewerClientProps {
  presentation: KOPresentation & { id: string }
  projectId:    string
}

export function KOViewerClient({ presentation, projectId }: KOViewerClientProps) {
  const router = useRouter()
  const [current,    setCurrent]    = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [showNotes,  setShowNotes]  = useState(false)
  const [showThumb,  setShowThumb]  = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const slideAreaRef = useRef<HTMLDivElement>(null)
  const [slideW, setSlideW] = useState(960)

  const slides = presentation.slides ?? []
  const slide  = slides[current]

  useEffect(() => {
    const ro = new ResizeObserver((e) => setSlideW(e[0]?.contentRect.width ?? 960))
    if (slideAreaRef.current) ro.observe(slideAreaRef.current)
    return () => ro.disconnect()
  }, [])

  const go = useCallback((delta: number) => {
    setCurrent((c) => Math.max(0, Math.min(slides.length - 1, c + delta)))
  }, [slides.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); go(1) }
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")                    { e.preventDefault(); go(-1) }
      if (e.key === "Escape")  { if (fullscreen) setFullscreen(false); else router.push(`/projects/${projectId}/kickoff-presentation`) }
      if (e.key === "f" || e.key === "F") setFullscreen((f) => !f)
      if (e.key === "n" || e.key === "N") setShowNotes((n) => !n)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, fullscreen, router, projectId])

  useEffect(() => {
    if (fullscreen) {
      containerRef.current?.requestFullscreen?.().catch(() => {})
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {})
    }
  }, [fullscreen])

  useEffect(() => {
    function onFsChange() { if (!document.fullscreenElement) setFullscreen(false) }
    document.addEventListener("fullscreenchange", onFsChange)
    return () => document.removeEventListener("fullscreenchange", onFsChange)
  }, [])

  const scale = slideW / 960

  return (
    <div ref={containerRef} className={`flex flex-col bg-[#0F172A] ${fullscreen ? "fixed inset-0 z-50" : "h-full"}`}>

      {/* Top bar */}
      <div className={`flex items-center gap-3 px-4 h-12 border-b border-white/10 bg-slate-900/90 backdrop-blur shrink-0 transition-all ${fullscreen ? "opacity-0 hover:opacity-100" : ""}`}
        style={{ position: fullscreen ? "absolute" : "relative", top: 0, left: 0, right: 0, zIndex: 10 }}>
        <Link href={`/projects/${projectId}/kickoff-presentation`}
          className="text-slate-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </Link>
        <span className="text-sm font-bold text-white truncate flex-1">{presentation.title}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowNotes((n) => !n)} title="Notas (N)"
            className={`p-1.5 rounded-lg text-xs transition-colors ${showNotes ? "bg-violet-500/30 text-violet-300" : "text-slate-400 hover:text-white hover:bg-white/10"}`}>
            <FileText className="w-4 h-4" />
          </button>
          <Link href={`/projects/${projectId}/kickoff-presentation`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors" title="Editar">
            <Edit2 className="w-4 h-4" />
          </Link>
          <button onClick={() => setFullscreen((f) => !f)} title="Tela cheia (F)"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">

        {/* Thumbnail rail (toggle) */}
        {showThumb && (
          <div className="w-44 shrink-0 bg-slate-900 border-r border-white/10 overflow-y-auto py-3 px-2 space-y-2">
            {slides.map((s, i) => (
              <button key={s.id} onClick={() => setCurrent(i)}
                className={`w-full rounded-lg overflow-hidden border-2 transition-all ${i === current ? "border-violet-500" : "border-transparent opacity-60 hover:opacity-90"}`}>
                <div style={{ width: "100%", aspectRatio: "16/9" }}>
                  <KOSlideRenderer slide={s} scale={160 / 960} noShadow />
                </div>
                <div className={`text-center text-[9px] font-bold py-0.5 ${i === current ? "text-violet-400" : "text-slate-500"}`}>{i + 1}</div>
              </button>
            ))}
          </div>
        )}

        {/* Slide */}
        <div className="flex-1 flex flex-col items-center justify-center overflow-hidden relative p-6 gap-4">
          <div ref={slideAreaRef} className="w-full max-w-5xl">
            {slide && (
              <div style={{ width: "100%", aspectRatio: "16/9" }}>
                <KOSlideRenderer slide={slide} scale={scale} />
              </div>
            )}
          </div>

          {/* Speaker notes */}
          {showNotes && slide?.notes && (
            <div className="w-full max-w-5xl px-4 py-3 rounded-xl bg-amber-900/30 border border-amber-700/40">
              <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Notas</p>
              <p className="text-sm text-amber-200">{slide.notes}</p>
            </div>
          )}

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-700">
            <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-500"
              style={{ width: `${((current + 1) / slides.length) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className={`flex items-center justify-between px-6 h-12 bg-slate-900/90 border-t border-white/10 shrink-0 transition-all ${fullscreen ? "absolute bottom-0 left-0 right-0 opacity-0 hover:opacity-100" : ""}`}>
        <button onClick={() => setShowThumb((t) => !t)}
          className={`text-xs font-bold px-2 py-1 rounded transition-colors ${showThumb ? "text-violet-300" : "text-slate-500 hover:text-white"}`}>
          Miniaturas
        </button>
        <div className="flex items-center gap-4">
          <button onClick={() => go(-1)} disabled={current === 0}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 transition-colors hover:bg-white/10">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-slate-300 tabular-nums">{current + 1} / {slides.length}</span>
          <button onClick={() => go(1)} disabled={current === slides.length - 1}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 transition-colors hover:bg-white/10">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="text-xs text-slate-500 font-medium">←→ navegar · F tela cheia · N notas</div>
      </div>
    </div>
  )
}
