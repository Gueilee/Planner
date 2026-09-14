"use client"

// Busca de pessoas no diretório do Azure AD (Microsoft Graph), estilo Teams:
// digita o nome ou e-mail, aparece o resultado com foto/cargo, clica e
// pronto — usado em qualquer campo que hoje só aceita nome digitado (ex.:
// Responsável de atividade no Cronograma, criação de usuário em Usuários).
//
// Mesmo padrão visual/interação de components/meeting-participant-picker.tsx
// (input com ícone de busca, dropdown abaixo, onMouseDown nos resultados pra
// dispararem antes do blur fechar o dropdown) — só troca o filtro local por
// busca no servidor (Graph) com debounce.

import { useEffect, useRef, useState, useTransition } from "react"
import { Popover } from "@base-ui/react/popover"
import { Search, Loader2 } from "lucide-react"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { searchDirectoryUsers, getOrCreateUserFromDirectory, type DirectoryUser } from "@/lib/actions/directory"

export type PickedPerson = { id: string; name: string; email: string }

interface PeoplePickerProps {
  placeholder?: string
  className?: string
  /**
   * Chamado com o usuário Kronex já garantido (existente ou recém-criado) —
   * só dispara quando `autoLink` (default true). Use isto quando o campo em
   * si É o dado final (ex.: Responsável de atividade, que precisa de um FK
   * na hora).
   */
  onSelect?: (person: PickedPerson) => void
  /**
   * Chamado com o resultado cru do Azure AD, SEM criar/vincular nada — só
   * dispara quando `autoLink={false}`. Use isto dentro de um formulário que
   * já tem seu próprio passo de "criar" (ex.: tela Usuários): o picker só
   * pré-preenche nome/e-mail, quem cria é o formulário.
   */
  onPick?: (person: DirectoryUser) => void
  /**
   * Chamado quando o usuário digita algo e sai do campo sem escolher uma
   * sugestão — preserva o comportamento atual de nome livre (prestador,
   * cliente, quem não está no Azure AD). Se omitido, texto sem seleção é
   * descartado ao perder o foco.
   */
  onFreeText?: (typed: string) => void
  defaultValue?: string
  /** Filial onde a pessoa é criada, se ainda não existir (default: a do usuário logado). */
  organizationId?: string
  /**
   * Visual reduzido (sem borda/ícone), para caber numa célula estreita de
   * grade — ex.: coluna "Responsável" do Cronograma. Sem isso, usa o visual
   * completo (caixa com borda), adequado a um formulário.
   */
  compact?: boolean
  /**
   * true (default): escolher um resultado já cria/vincula o usuário Kronex
   * (`onSelect`). false: só devolve o resultado cru do Azure (`onPick`),
   * sem persistir nada — o formulário-pai decide quando/como criar.
   */
  autoLink?: boolean
}

export function PeoplePicker({
  placeholder, className, onSelect, onPick, onFreeText, defaultValue = "", organizationId, compact = false, autoLink = true,
}: PeoplePickerProps) {
  const [search, setSearch] = useState(defaultValue)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [results, setResults] = useState<DirectoryUser[]>([])
  const [linkingEmail, setLinkingEmail] = useState<string | null>(null)
  const [isSearching, startSearch] = useTransition()
  const debouncedSearch = useDebouncedValue(search, 300)
  const lastCommitted = useRef(defaultValue)
  const inputWrapperRef = useRef<HTMLDivElement>(null)
  // Passado como `initialFocus` do Popover — sem isso, o Popover move o foco
  // pra si mesmo ao abrir, o que dispara o onBlur do input e fecha o próprio
  // dropdown que acabou de abrir (loop). Mantém o foco no input, de propósito,
  // pra continuar digitando com o dropdown aberto.
  const inputElRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const term = debouncedSearch.trim()
    if (term.length < 2) { setResults([]); return }
    let cancelled = false
    startSearch(async () => {
      try {
        const found = await searchDirectoryUsers(term)
        if (!cancelled) setResults(found)
      } catch {
        if (!cancelled) setResults([])
      }
    })
    return () => { cancelled = true }
  }, [debouncedSearch])

  async function pick(person: DirectoryUser) {
    if (!autoLink) {
      lastCommitted.current = person.name
      setSearch(person.name)
      setDropdownOpen(false)
      onPick?.(person)
      return
    }
    setLinkingEmail(person.email)
    try {
      const linked = await getOrCreateUserFromDirectory(
        { azureId: person.azureId, name: person.name, email: person.email },
        organizationId
      )
      lastCommitted.current = linked.name
      setSearch(linked.name)
      setDropdownOpen(false)
      onSelect?.(linked)
    } finally {
      setLinkingEmail(null)
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const typed = e.target.value.trim()
    setTimeout(() => setDropdownOpen(false), 150)
    if (typed === lastCommitted.current) return
    onFreeText?.(typed)
    lastCommitted.current = typed
  }

  const showResults = dropdownOpen && results.length > 0
  const showEmpty = dropdownOpen && debouncedSearch.trim().length >= 2 && !isSearching && results.length === 0

  return (
    <div className={`relative ${className ?? ""}`}>
      <div
        ref={inputWrapperRef}
        className={
          compact
            ? "flex items-center gap-1 rounded border border-transparent focus-within:border-[#7B2FBE] focus-within:bg-violet-50 transition-all"
            : "flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white focus-within:border-[#7B2FBE] focus-within:ring-2 focus-within:ring-violet-50 transition-all"
        }
      >
        {!compact && <Search className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
        <input
          ref={inputElRef}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true) }}
          onFocus={() => setDropdownOpen(true)}
          onBlur={handleBlur}
          placeholder={placeholder ?? "Buscar pessoa pelo nome ou e-mail..."}
          className={`flex-1 min-w-0 bg-transparent outline-none text-[#0F172A] placeholder:text-slate-300 ${compact ? "text-xs px-1" : "text-xs"}`}
        />
        {isSearching && <Loader2 className="w-3.5 h-3.5 text-slate-300 animate-spin shrink-0" />}
      </div>

      {/* Portal (via @base-ui/react/popover, mesma lib do DropdownMenu) —
          a grade do Cronograma rola dentro de um container com overflow
          (schedule-v2-client.tsx) que recortaria um dropdown `absolute`
          comum; ancorado ao input via `anchor`, sem usar Popover.Trigger
          (que abriria só no clique — aqui precisa abrir ao focar/digitar,
          então quem controla `open` é o próprio onFocus/onChange/onBlur). */}
      <Popover.Root open={showResults || showEmpty} onOpenChange={() => {}}>
        <Popover.Portal>
          <Popover.Positioner anchor={inputWrapperRef} side="bottom" align="start" sideOffset={4} className="z-50 outline-none">
            <Popover.Popup
              initialFocus={inputElRef}
              className="w-(--anchor-width) rounded-xl border border-slate-200 bg-white shadow-xl outline-none overflow-hidden"
            >
              {showResults && results.map((r) => (
                <button
                  key={r.azureId}
                  type="button"
                  onMouseDown={() => pick(r)}
                  disabled={linkingEmail === r.email}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-violet-50 transition-colors text-left disabled:opacity-50 border-b border-slate-50 last:border-0"
                >
                  <UserAvatar name={r.name} image={null} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#0F172A] truncate">{r.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {r.jobTitle ? `${r.jobTitle} · ` : ""}{r.email}
                    </p>
                  </div>
                  {linkingEmail === r.email && <Loader2 className="w-3.5 h-3.5 text-[#7B2FBE] animate-spin shrink-0" />}
                </button>
              ))}
              {showEmpty && (
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-400">
                    Ninguém encontrado no diretório para &quot;{debouncedSearch}&quot; — o texto digitado será salvo como está.
                  </p>
                </div>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
