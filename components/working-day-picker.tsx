"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  format, parseISO, addMonths, subMonths,
  startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isToday,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { ChevronLeft, ChevronRight, X, CalendarDays } from "lucide-react"
import { isWeekend, isHoliday, isWorkingDay, getHolidayName } from "@/lib/working-days"

interface WorkingDayPickerProps {
  value: string           // "yyyy-MM-dd" or ""
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
}

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

export function WorkingDayPicker({
  value,
  onChange,
  placeholder = "Selecionar data",
  className = "",
  style,
  disabled,
}: WorkingDayPickerProps) {
  const [open, setOpen]         = useState(false)
  const [viewDate, setViewDate] = useState(() => value ? parseISO(value) : new Date())
  const [hovered, setHovered]   = useState<string | null>(null)
  const [calPos, setCalPos]     = useState({ top: 0, left: 0, above: false })

  const triggerRef  = useRef<HTMLDivElement>(null)
  const calendarRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !calendarRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Sync view when value changes externally
  useEffect(() => { if (value) setViewDate(parseISO(value)) }, [value])

  const openCalendar = useCallback(() => {
    if (disabled) return
    if (!triggerRef.current) { setOpen(true); return }
    const rect = triggerRef.current.getBoundingClientRect()
    const calH = 340
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const above = spaceBelow < calH && rect.top > calH
    setCalPos({
      top:   above ? rect.top - calH - 4 : rect.bottom + 4,
      left:  Math.min(rect.left, window.innerWidth - 316),
      above,
    })
    setOpen((v) => !v)
  }, [disabled])

  // Calendar grid
  const monthStart  = startOfMonth(viewDate)
  const monthEnd    = endOfMonth(viewDate)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPad    = getDay(monthStart) // 0 = Sunday
  const cells: (Date | null)[] = [...Array(startPad).fill(null), ...daysInMonth]
  while (cells.length % 7 !== 0) cells.push(null)

  function selectDate(day: Date) {
    const ds = format(day, "yyyy-MM-dd")
    if (!isWorkingDay(ds)) return
    onChange(ds)
    setOpen(false)
  }

  function clearDate(e: React.MouseEvent) {
    e.stopPropagation()
    onChange("")
  }

  const displayValue = value ? format(parseISO(value), "dd/MM/yyyy") : ""
  const hoveredHoliday = hovered ? getHolidayName(hovered) : null
  const hoveredWE      = hovered ? isWeekend(hovered) : false

  return (
    <>
      {/* Trigger */}
      <div
        ref={triggerRef}
        onClick={openCalendar}
        className={`flex items-center gap-2 cursor-pointer select-none ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
        style={style}
      >
        <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className={`flex-1 text-sm ${displayValue ? "text-[#0F172A]" : "text-slate-400"}`}>
          {displayValue || placeholder}
        </span>
        {value && !disabled && (
          <button
            onClick={clearDate}
            className="text-slate-300 hover:text-slate-500 transition-colors shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Calendar — fixed so it escapes overflow:hidden parents */}
      {open && (
        <div
          ref={calendarRef}
          style={{
            position:  "fixed",
            top:       calPos.top,
            left:      calPos.left,
            zIndex:    9999,
            width:     312,
            boxShadow: "0 24px 72px rgba(15,23,42,0.22), 0 0 0 1px rgba(226,232,240,1)",
            borderRadius: 20,
            overflow: "hidden",
            background: "white",
          }}
        >
          {/* Header — month nav */}
          <div
            style={{
              background: "linear-gradient(135deg,#0F172A,#1E293B)",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <button
              onClick={() => setViewDate(subMonths(viewDate, 1))}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center">
              <p className="text-xs font-black text-white capitalize">
                {format(viewDate, "MMMM yyyy", { locale: ptBR })}
              </p>
              <p className="text-[10px] text-white/40 mt-0.5">Apenas dias úteis</p>
            </div>
            <button
              onClick={() => setViewDate(addMonths(viewDate, 1))}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 px-2 pt-2 pb-1">
            {DOW.map((d, i) => (
              <div
                key={d}
                className="text-center text-[9px] font-black uppercase tracking-wide py-1"
                style={{ color: i === 0 || i === 6 ? "#E2E8F0" : "#CBD5E1" }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
            {cells.map((day, idx) => {
              if (!day) return <div key={`e-${idx}`} />
              const ds       = format(day, "yyyy-MM-dd")
              const weekend  = isWeekend(ds)
              const holiday  = isHoliday(ds)
              const disabled = weekend || holiday
              const selected = value === ds
              const today    = isToday(day)
              const holName  = getHolidayName(ds)

              return (
                <div
                  key={ds}
                  onMouseEnter={() => setHovered(ds)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => !disabled && selectDate(day)}
                  style={{
                    cursor:     disabled ? "not-allowed" : "pointer",
                    borderRadius: 10,
                    aspectRatio: "1",
                    display:    "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    position:   "relative",
                    transition: "all 0.12s",
                    background: selected
                      ? "linear-gradient(135deg,#7B2FBE,#2463FF)"
                      : holiday && !weekend
                        ? "#FFF7ED"
                        : weekend
                          ? "#F8FAFC"
                          : today
                            ? "#EFF6FF"
                            : hovered === ds
                              ? "#F1F5F9"
                              : "transparent",
                    border: selected
                      ? "none"
                      : today && !selected
                        ? "1.5px solid #BFDBFE"
                        : holiday && !weekend && !selected
                          ? "1.5px solid #FED7AA"
                          : "1.5px solid transparent",
                    opacity: disabled && !holiday ? 0.3 : 1,
                  }}
                >
                  <span
                    style={{
                      fontSize:   11,
                      fontWeight: selected ? 800 : today ? 700 : 600,
                      color: selected
                        ? "white"
                        : holiday && !weekend
                          ? "#EA580C"
                          : weekend
                            ? "#CBD5E1"
                            : today
                              ? "#2463FF"
                              : "#0F172A",
                      lineHeight: 1,
                    }}
                  >
                    {format(day, "d")}
                  </span>
                  {/* Holiday dot */}
                  {holName && !weekend && (
                    <div
                      style={{
                        width:        4,
                        height:       4,
                        borderRadius: "50%",
                        background:   selected ? "rgba(255,255,255,0.7)" : "#F97316",
                        marginTop:    1,
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer — legend / holiday tooltip */}
          <div
            style={{
              borderTop:  "1px solid #F1F5F9",
              padding:    "8px 14px",
              minHeight:  40,
              display:    "flex",
              alignItems: "center",
              background: "#FAFBFC",
            }}
          >
            {hovered && (hoveredWE || hoveredHoliday) ? (
              <div className="flex items-center gap-2">
                <div
                  style={{
                    width:        8,
                    height:       8,
                    borderRadius: "50%",
                    background:   hoveredHoliday ? "#F97316" : "#CBD5E1",
                    flexShrink:   0,
                  }}
                />
                <span style={{ fontSize: 11, fontWeight: 600, color: hoveredHoliday ? "#EA580C" : "#94A3B8" }}>
                  {hoveredHoliday ? `Feriado: ${hoveredHoliday}` : "Fim de semana — dia não útil"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-4 w-full">
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#F97316" }} />
                  <span style={{ fontSize: 10, color: "#94A3B8" }}>Feriado</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#E2E8F0" }} />
                  <span style={{ fontSize: 10, color: "#94A3B8" }}>Fim de semana</span>
                </div>
                <button
                  onClick={() => setViewDate(new Date())}
                  className="ml-auto text-[10px] font-black text-[#7B2FBE] hover:underline"
                >
                  Hoje
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
