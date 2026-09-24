"use client"

// Participantes de uma atividade do Cronograma — mistura dois grupos:
// pessoas de verdade (usuários Kronex, achadas/criadas via busca ao vivo no
// Azure AD, mesma fonte de components/kronex/people-picker.tsx) e texto
// livre (fornecedor/terceiro fora do diretório da empresa). Célula fechada
// mostra um resumo compacto (avatares + contagem); clicar abre um painel
// com chips removíveis + busca, no mesmo espírito de
// components/meeting-participant-picker.tsx (chips com UserAvatar).
//
// O painel usa @base-ui/react/popover (mesma lib já usada pelo
// DropdownMenu em components/ui/dropdown-menu.tsx) em vez de um simples
// `absolute` — a grade do Cronograma rola horizontalmente dentro de um
// container com overflow (ver schedule-v2-client.tsx), que recorta
// qualquer conteúdo `absolute` que extrapole sua altura; o Popover
// renderiza via portal direto no body, escapando desse recorte.

import { useEffect, useRef, useState, useTransition } from "react"
import { Popover } from "@base-ui/react/popover"
import { Search, X, Loader2, UserPlus } from "lucide-react"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { searchDirectoryUsers, getOrCreateUserFromDirectory, type DirectoryUser } from "@/lib/actions/directory"

interface PeopleMultiPickerProps {
  linkedIds: string[]
  /** Resolve nome de um id vinculado — normalmente h.membersById.get. */
  resolveName: (id: string) => string | undefined
  freeText: string[]
  onChange: (next: { linkedIds: string[]; freeText: string[] }) => void
  onPersonLinked: (person: { id: string; name: string }) => void
  organizationId?: string
  placeholder?: string
}

export function PeopleMultiPicker({
  linkedIds, resolveName, freeText, onChange, onPersonLinked, organizationId, placeholder,
}: PeopleMultiPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<DirectoryUser[]>([])
  const [linkingEmail, setLinkingEmail] = useState<string | null>(null)
  const [isSearching, startSearch] = useTransition()
  const debouncedSearch = useDebouncedValue(search, 300)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const term = debouncedSearch.trim()
    if (term.length < 2) { setResults([]); return }
    let cancelled = false
    startSearch(async () => {
      try {
        const found = await searchDirectoryUsers(term, organizationId)
        if (!cancelled) setResults(found)
      } catch {
        if (!cancelled) setResults([])
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, open])

  async function addLinked(person: DirectoryUser) {
    // Resultado local já é um usuário Kronex — usa o id direto, sem passar
    // pelo Azure (mesmo tratamento de components/kronex/people-picker.tsx).
    if (person.source === "local") {
      onPersonLinked({ id: person.id, name: person.name })
      if (!linkedIds.includes(person.id)) onChange({ linkedIds: [...linkedIds, person.id], freeText })
      setSearch("")
      inputRef.current?.focus()
      return
    }
    setLinkingEmail(person.email)
    try {
      const linked = await getOrCreateUserFromDirectory(
        { azureId: person.azureId, name: person.name, email: person.email },
        organizationId
      )
      onPersonLinked(linked)
      if (!linkedIds.includes(linked.id)) onChange({ linkedIds: [...linkedIds, linked.id], freeText })
      setSearch("")
      inputRef.current?.focus()
    } finally {
      setLinkingEmail(null)
    }
  }

  function addFreeText(typed: string) {
    const name = typed.trim()
    if (!name || freeText.includes(name)) return
    onChange({ linkedIds, freeText: [...freeText, name] })
    setSearch("")
  }

  function removeLinked(id: string) {
    onChange({ linkedIds: linkedIds.filter((x) => x !== id), freeText })
  }
  function removeFreeText(name: string) {
    onChange({ linkedIds, freeText: freeText.filter((x) => x !== name) })
  }

  const total = linkedIds.length + freeText.length

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="w-full flex items-center gap-1 min-h-[22px] text-left rounded px-1 -mx-1 hover:bg-slate-50 transition-colors">
        {total === 0 ? (
          <span className="text-xs text-slate-300">{placeholder ?? "Sem participantes"}</span>
        ) : (
          <>
            <div className="flex -space-x-1.5 shrink-0">
              {linkedIds.slice(0, 3).map((id) => (
                <UserAvatar key={id} name={resolveName(id) ?? "?"} size={18} className="ring-2 ring-white" />
              ))}
            </div>
            {linkedIds.length > 3 && (
              <span className="text-[9px] font-bold text-slate-400 shrink-0">+{linkedIds.length - 3}</span>
            )}
            {freeText.length > 0 && (
              <span className="text-[9px] font-semibold text-slate-400 border border-dashed border-slate-300 rounded-full px-1.5 shrink-0">
                +{freeText.length} externo{freeText.length > 1 ? "s" : ""}
              </span>
            )}
          </>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={4} className="z-50 outline-none">
          <Popover.Popup
            className="w-72 rounded-xl border border-slate-200 bg-white outline-none"
            style={{ boxShadow: "0 12px 32px rgba(15,23,42,0.14)" }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Participantes</span>
              <Popover.Close className="text-slate-300 hover:text-slate-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </Popover.Close>
            </div>

            {total > 0 && (
              <div className="flex flex-wrap gap-1.5 p-3 border-b border-slate-100">
                {linkedIds.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full bg-violet-50 border border-violet-100">
                    <UserAvatar name={resolveName(id) ?? "?"} size={18} />
                    <span className="text-[11px] font-semibold text-[#0F172A]">{resolveName(id) ?? "…"}</span>
                    <button onClick={() => removeLinked(id)} className="text-slate-400 hover:text-red-500 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {freeText.map((name) => (
                  <span key={name} className="inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-full bg-slate-50 border border-dashed border-slate-300">
                    <span className="text-[11px] font-semibold text-slate-600">{name}</span>
                    <span className="text-[8px] font-bold uppercase text-slate-400">externo</span>
                    <button onClick={() => removeFreeText(name)} className="text-slate-400 hover:text-red-500 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="p-2">
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus-within:border-[#7B2FBE] focus-within:ring-2 focus-within:ring-violet-50 transition-all">
                <Search className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                <input
                  ref={inputRef}
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && results.length === 0 && search.trim()) addFreeText(search)
                  }}
                  placeholder="Buscar pessoa da empresa..."
                  className="flex-1 min-w-0 text-xs bg-transparent outline-none text-[#0F172A] placeholder:text-slate-300"
                />
                {isSearching && <Loader2 className="w-3.5 h-3.5 text-slate-300 animate-spin shrink-0" />}
              </div>

              {search.trim().length >= 2 && (
                <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-100">
                  {results.map((r) => (
                    <button
                      key={`${r.source}:${r.source === "azure" ? r.azureId : r.id}`}
                      type="button"
                      onClick={() => addLinked(r)}
                      disabled={linkingEmail === r.email}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-violet-50 transition-colors text-left disabled:opacity-50 border-b border-slate-50 last:border-0"
                    >
                      <UserAvatar name={r.name} size={24} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#0F172A] truncate">{r.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{r.source === "local" ? "Cadastrado no Kronex · " : r.jobTitle ? `${r.jobTitle} · ` : ""}{r.email}</p>
                      </div>
                      {linkingEmail === r.email && <Loader2 className="w-3.5 h-3.5 text-[#7B2FBE] animate-spin shrink-0" />}
                    </button>
                  ))}
                  {!isSearching && results.length === 0 && (
                    <button
                      type="button"
                      onClick={() => addFreeText(search)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-slate-50 transition-colors text-left"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-xs text-slate-500">
                        Adicionar &quot;<strong>{search}</strong>&quot; como participante externo
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
