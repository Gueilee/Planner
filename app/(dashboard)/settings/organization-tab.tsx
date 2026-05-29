"use client"

import { useState, useRef, useTransition } from "react"
import {
  Save, Loader2, Check, AlertCircle, Camera,
  Building2, Globe, Tag, Layers, Info,
} from "lucide-react"
import { saveOrgConfig, DEFAULT_AREA_CONFIGS, type OrgConfigData, type AreaConfigs } from "@/lib/actions/org-config"

// ─── Logo upload ──────────────────────────────────────────────────────────────

async function uploadLogo(file: File): Promise<string> {
  const fd = new FormData()
  fd.append("files", file)
  const res = await fetch("/api/upload", { method: "POST", body: fd })
  if (!res.ok) throw new Error("Falha no upload")
  const data = await res.json() as { files: { url: string }[] }
  return data.files[0].url
}

// ─── Color picker strip ───────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#0891B2","#2463FF","#7B2FBE","#059669","#D97706",
  "#DC2626","#DB2777","#0D9488","#9333EA","#EA580C",
  "#16A34A","#65A30D","#0369A1","#7C3AED","#475569",
]

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-lg border-2 transition-transform hover:scale-110"
          style={{
            background:   c,
            borderColor:  value === c ? "#0F172A" : "transparent",
            boxShadow:    value === c ? "0 0 0 2px white, 0 0 0 4px " + c : "none",
          }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-6 h-6 rounded-lg cursor-pointer border-0 bg-transparent p-0"
        title="Cor personalizada"
      />
    </div>
  )
}

// ─── Area card ────────────────────────────────────────────────────────────────

const ICON_OPTIONS = ["💻","✅","🎯","🔧","📊","🚀","⚡","🔬","💡","🏗️","🌐","📋"]

function AreaCard({
  areaKey, config,
  onChange,
}: {
  areaKey: "TECNOLOGIA" | "QUALIDADE" | "ESTRATEGICO"
  config: { label: string; color: string; description: string; icon: string }
  onChange: (k: keyof typeof config, v: string) => void
}) {
  const iCls = "w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-[#F7F6F2] outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"

  return (
    <div
      className="rounded-2xl p-5 space-y-3"
      style={{ background: `${config.color}08`, border: `1.5px solid ${config.color}30` }}
    >
      {/* Header preview */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: `${config.color}18`, border: `1px solid ${config.color}30` }}>
          {config.icon}
        </div>
        <div>
          <p className="text-sm font-black" style={{ color: config.color }}>{config.label}</p>
          <p className="text-[10px] text-slate-400 font-mono">{areaKey}</p>
        </div>
      </div>

      {/* Editable fields */}
      <div className="space-y-2">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Nome de exibição</label>
          <input value={config.label} onChange={(e) => onChange("label", e.target.value)} className={iCls} />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Descrição</label>
          <input value={config.description} onChange={(e) => onChange("description", e.target.value)} className={iCls} placeholder="Descrição curta..." />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Ícone</label>
          <div className="flex flex-wrap gap-1.5">
            {ICON_OPTIONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => onChange("icon", ic)}
                className="w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all"
                style={{
                  background:  config.icon === ic ? `${config.color}20` : "#F8FAFC",
                  border:      `1.5px solid ${config.icon === ic ? config.color : "#E2E8F0"}`,
                  transform:   config.icon === ic ? "scale(1.15)" : "none",
                }}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Cor</label>
          <ColorPicker value={config.color} onChange={(c) => onChange("color", c)} />
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OrganizationTab({ initial }: { initial: OrgConfigData }) {
  const [name,        setName]        = useState(initial.name)
  const [logoUrl,     setLogoUrl]     = useState<string | null>(initial.logoUrl)
  const [sector,      setSector]      = useState(initial.sector ?? "")
  const [website,     setWebsite]     = useState(initial.website ?? "")
  const [areaConfigs, setAreaConfigs] = useState<AreaConfigs>(initial.areaConfigs)
  const [uploading,   setUploading]   = useState(false)
  const [isPending,   start]          = useTransition()
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function updateArea(key: keyof AreaConfigs, field: string, val: string) {
    setAreaConfigs((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: val },
    }))
    setSaved(false)
  }

  function resetArea(key: keyof AreaConfigs) {
    setAreaConfigs((prev) => ({ ...prev, [key]: DEFAULT_AREA_CONFIGS[key] }))
    setSaved(false)
  }

  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith("image/")) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadLogo(file)
      setLogoUrl(url)
      setSaved(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro no upload")
    } finally {
      setUploading(false)
    }
  }

  function handleSave() {
    if (!name.trim()) { setError("Nome da organização é obrigatório"); return }
    setError(null)
    start(async () => {
      try {
        await saveOrgConfig({ name, logoUrl, sector, website, areaConfigs })
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao salvar")
      }
    })
  }

  const iCls = "w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-[#F7F6F2] outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all placeholder:text-slate-300"

  return (
    <div className="space-y-4">

      {/* ── Identity card ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 space-y-5" style={{ border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div className="flex items-center gap-3 pb-4" style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #7B2FBE22, #2463FF22)" }}>
            <Building2 className="w-4.5 h-4.5 text-violet-600" style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <h2 className="text-sm font-black text-[#0F172A]">Identidade da Organização</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Nome e logo usados nas ATAs, documentos e cabeçalho do sistema</p>
          </div>
        </div>

        {/* Logo + Name row */}
        <div className="flex items-start gap-6">
          {/* Logo upload */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative group w-20 h-20 rounded-2xl overflow-hidden border-2 border-dashed border-slate-200 hover:border-violet-400 transition-all flex items-center justify-center bg-slate-50"
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-slate-300 group-hover:text-violet-400 transition-colors">
                  {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
                  {!uploading && <span className="text-[9px] font-bold uppercase tracking-wide">Logo</span>}
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all rounded-2xl" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f) }} />
            {logoUrl && (
              <button type="button" onClick={() => { setLogoUrl(null); setSaved(false) }}
                className="text-[10px] text-red-400 hover:text-red-600 font-semibold transition-colors">
                Remover
              </button>
            )}
            <p className="text-[9px] text-slate-300 text-center leading-tight">PNG, SVG<br />Recomendado:<br />240×80px</p>
          </div>

          {/* Fields */}
          <div className="flex-1 space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Nome da Organização <span className="text-red-400">*</span>
              </label>
              <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} className={iCls} placeholder="Ex: Vendemmia Logística" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Setor / Ramo</label>
                <input value={sector} onChange={(e) => { setSector(e.target.value); setSaved(false) }} className={iCls} placeholder="Ex: Logística, Tecnologia..." />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1.5">
                  <Globe className="w-3 h-3" /> Website
                </label>
                <input value={website} onChange={(e) => { setWebsite(e.target.value); setSaved(false) }} className={iCls} placeholder="https://..." />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Area configs card ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6" style={{ border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div className="flex items-center justify-between pb-4 mb-5" style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #0891B222, #7B2FBE22)" }}>
              <Layers className="w-4.5 h-4.5 text-indigo-600" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h2 className="text-sm font-black text-[#0F172A]">Áreas de Projeto</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Personalize o nome, cor e ícone de cada área</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <Info className="w-3 h-3" />
            3 áreas configuradas
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {(["TECNOLOGIA", "QUALIDADE", "ESTRATEGICO"] as const).map((key) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">{key}</span>
                <button
                  type="button"
                  onClick={() => resetArea(key)}
                  className="text-[10px] text-slate-400 hover:text-violet-600 font-semibold transition-colors"
                >
                  Restaurar padrão
                </button>
              </div>
              <AreaCard
                areaKey={key}
                config={areaConfigs[key]}
                onChange={(field, val) => updateArea(key, field, val)}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2">
          <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            As áreas são usadas para classificar projetos. As identificações internas (<span className="font-mono font-bold">TECNOLOGIA</span>, <span className="font-mono font-bold">QUALIDADE</span>, <span className="font-mono font-bold">ESTRATEGICO</span>) não mudam — apenas os rótulos e cores de exibição.
          </p>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* ── Save ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || uploading}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}
        >
          {isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
            : saved
              ? <><Check className="w-4 h-4" /> Salvo!</>
              : <><Save className="w-4 h-4" /> Salvar Configurações</>}
        </button>
        {saved && (
          <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Configurações atualizadas
          </span>
        )}
      </div>
    </div>
  )
}
