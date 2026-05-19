"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, ChevronRight, X, Maximize2, Minimize2, FileText } from "lucide-react"
import { SlideContent } from "../builder-client"
import type { Presentation } from "@/lib/types/presentation"

interface ViewerClientProps {
  presentation: Presentation
  projectId: string
}

const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 80 : -80, scale: 0.96 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -80 : 80, scale: 0.96 }),
}

export function ViewerClient({ presentation, projectId }: ViewerClientProps) {
  const router = useRouter()
  const [current, setCurrent] = useState(0)
  const [dir, setDir] = useState(1)
  const [showNotes, setShowNotes] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [idle, setIdle] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const slides = presentation.slides
  const slide = slides[current]
  const total = slides.length

  const go = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= total) return
      setDir(idx > current ? 1 : -1)
      setCurrent(idx)
    },
    [current, total],
  )

  const next = useCallback(() => go(current + 1), [go, current])
  const prev = useCallback(() => go(current - 1), [go, current])

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  function resetIdle() {
    setIdle(false)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setIdle(true), 3500)
  }

  useEffect(() => {
    resetIdle()
    return () => clearTimeout(idleTimer.current)
  }, [current])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next() }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev() }
      if (e.key === "Escape") router.push(`/projects/${projectId}/presentation`)
      if (e.key === "f" || e.key === "F") toggleFullscreen()
      if (e.key === "n" || e.key === "N") setShowNotes((v) => !v)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [next, prev, projectId, router])

  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement) }
    document.addEventListener("fullscreenchange", onFsChange)
    return () => document.removeEventListener("fullscreenchange", onFsChange)
  }, [])

  if (!slide) return null

  const themeBg =
    presentation.theme === "dark" ? "#06060f" :
    presentation.theme === "slate" ? "#0b1120" : "#130523"

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: themeBg, zIndex: 9999 }}
      onMouseMove={resetIdle}
    >
      {/* Ambient background orbs */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", width: "800px", height: "800px", borderRadius: "50%", top: "-300px", right: "-250px", background: "radial-gradient(circle, rgba(123,47,190,0.09) 0%, transparent 60%)" }} />
        <div style={{ position: "absolute", width: "700px", height: "700px", borderRadius: "50%", bottom: "-250px", left: "-200px", background: "radial-gradient(circle, rgba(36,99,255,0.07) 0%, transparent 60%)" }} />
        <div style={{ position: "absolute", width: "400px", height: "400px", borderRadius: "50%", top: "40%", left: "50%", transform: "translate(-50%,-50%)", background: "radial-gradient(circle, rgba(0,196,224,0.04) 0%, transparent 60%)" }} />
      </div>

      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 z-20" style={{ background: "rgba(255,255,255,0.06)" }}>
        <motion.div
          className="h-full"
          style={{ background: "linear-gradient(90deg, #7B2FBE, #2463FF, #00C4E0)" }}
          animate={{ width: `${((current + 1) / total) * 100}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      {/* Top bar */}
      <motion.div
        animate={{ opacity: idle ? 0 : 1, y: idle ? -8 : 0 }}
        transition={{ duration: 0.35 }}
        className="relative flex items-center justify-between px-6 pt-4 pb-8 shrink-0 z-10"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)", pointerEvents: idle ? "none" : "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h1 className="text-white/90 font-bold text-sm leading-tight">{presentation.title}</h1>
          <p className="text-white/35 text-xs mt-0.5">{current + 1} / {total}</p>
        </div>
        <div className="flex items-center gap-1">
          {slide.notes && (
            <button
              onClick={() => setShowNotes((v) => !v)}
              className={`p-2 rounded-xl transition-all ${showNotes ? "bg-white/15 text-white" : "text-white/40 hover:text-white hover:bg-white/10"}`}
              title="Notas (N)"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all"
            title="Tela cheia (F)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => router.push(`/projects/${projectId}/presentation`)}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all"
            title="Fechar (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* Slide container */}
      <div className="flex-1 flex items-center justify-center px-8 min-h-0 relative z-10">
        <div
          style={{
            width: "min(100%, calc((100vh - 140px) * 16 / 9))",
            aspectRatio: "16/9",
            position: "relative",
            borderRadius: "14px",
            overflow: "hidden",
            boxShadow: "0 40px 100px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        >
          {/* Slide background */}
          <div
            style={{
              position: "absolute", inset: 0,
              background: presentation.theme === "dark" ? "#0a0a1a" : presentation.theme === "slate" ? "#0f172a" : "#1e0a3c",
            }}
          />
          {/* Slide ambient blobs */}
          <div style={{ position: "absolute", width: "500px", height: "500px", borderRadius: "50%", top: "-150px", right: "-150px", background: "radial-gradient(circle, rgba(123,47,190,0.16) 0%, transparent 65%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", width: "400px", height: "400px", borderRadius: "50%", bottom: "-100px", left: "-100px", background: "radial-gradient(circle, rgba(36,99,255,0.13) 0%, transparent 65%)", pointerEvents: "none" }} />

          {/* Slide content with transition */}
          <AnimatePresence custom={dir} mode="wait">
            <motion.div
              key={current}
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column",
                padding: "clamp(28px, 4.5%, 64px)",
              }}
            >
              <SlideContent slide={slide} preview={false} />
            </motion.div>
          </AnimatePresence>

          {/* Slide number badge */}
          <div
            style={{
              position: "absolute", bottom: "14px", right: "18px",
              fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.20)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {current + 1}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <motion.div
        animate={{ opacity: idle ? 0 : 1, y: idle ? 10 : 0 }}
        transition={{ duration: 0.35 }}
        className="relative shrink-0 px-8 pb-5 pt-2 z-10"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)", pointerEvents: idle ? "none" : "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button
            onClick={prev}
            disabled={current === 0}
            className="w-9 h-9 flex items-center justify-center rounded-full transition-all disabled:opacity-20"
            style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.80)" }}
            onMouseEnter={(e) => { if (current > 0) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.18)" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)" }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Dot navigation */}
          <div className="flex items-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => go(i)}
                className="transition-all rounded-full"
                style={{
                  width: i === current ? "24px" : "6px",
                  height: "6px",
                  background: i === current
                    ? "linear-gradient(90deg, #7B2FBE, #2463FF)"
                    : "rgba(255,255,255,0.25)",
                }}
              />
            ))}
          </div>

          <button
            onClick={next}
            disabled={current === total - 1}
            className="w-9 h-9 flex items-center justify-center rounded-full transition-all disabled:opacity-20"
            style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.80)" }}
            onMouseEnter={(e) => { if (current < total - 1) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.18)" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)" }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </motion.div>

      {/* Speaker notes panel */}
      <AnimatePresence>
        {showNotes && slide.notes && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            className="fixed bottom-0 left-0 right-0 z-30 max-h-[32vh] overflow-auto"
            style={{
              background: "rgba(10, 15, 28, 0.96)",
              backdropFilter: "blur(16px)",
              borderTop: "1px solid rgba(123,47,190,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-8 py-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  <span className="text-[10px] font-black text-white/35 uppercase tracking-widest">Notas do Apresentador</span>
                </div>
                <button
                  onClick={() => setShowNotes(false)}
                  className="text-white/30 hover:text-white/70 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{slide.notes}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gradient text CSS for slides */}
      <style jsx global>{`
        .slide-preview-gradient-text {
          background: linear-gradient(135deg, #f8fafc 30%, #C084FC 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>
    </div>
  )
}
