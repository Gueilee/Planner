// Parser da sintaxe de predecessor do Artia — CLAUDE.md §3.4/§3.5:
// "A3" (sem sigla) ⇒ FS; "A3ss+2" ⇒ SS com lag +2; código inexistente é
// ignorado silenciosamente (não é erro fatal).
//
// SF é reconhecido pelo parser (para não quebrar dado futuro) mas o
// scheduler.ts ainda não implementa esse tipo — decisão de escopo do v1
// (ver plano: "núcleo primeiro").

import type { LinkType } from "./types"

export type ParsedPredecessor = {
  code: string
  type: LinkType
  lag: number
}

// Código: letras/números/pontos (EAP "1.1.1" ou "A3"). Tipo: fs/ss/ff/sf,
// opcional (default FS). Lag: opcional, só faz sentido junto de um tipo
// explícito (igual ao Artia: "A1ss+2", nunca "A1+2" sem sigla).
const TOKEN_RE = /^(.+?)(?:(fs|ss|ff|sf)([+-]\d+)?)?$/i

export function parsePredecessorToken(rawToken: string): ParsedPredecessor | null {
  const token = rawToken.trim()
  if (!token) return null

  const m = TOKEN_RE.exec(token)
  if (!m || !m[1]) return null

  const code = m[1].trim()
  if (!code) return null

  const type = (m[2]?.toUpperCase() as LinkType | undefined) ?? "FS"
  const lag = m[3] ? parseInt(m[3], 10) : 0

  return { code, type, lag }
}

/** Aceita "A1; A2fs; A3ss+2" ou separado por vírgula — espaços são ignorados. */
export function parsePredecessors(raw: string): ParsedPredecessor[] {
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parsePredecessorToken)
    .filter((p): p is ParsedPredecessor => p !== null)
}

/**
 * Filtra predecessores cujo código não existe entre os códigos válidos do
 * cronograma — regra §3.5: ID de predecessor inexistente é IGNORADO, nunca
 * lança erro.
 */
export function dropUnknownCodes(
  preds: ParsedPredecessor[],
  validCodes: ReadonlySet<string>
): ParsedPredecessor[] {
  return preds.filter((p) => validCodes.has(p.code))
}

/**
 * Detecta se adicionar a aresta successorId -> predecessorId criaria um
 * ciclo no grafo de dependências já existente (DFS) — regra §3.6: validar
 * ANTES de gravar. `edges` é o grafo atual (successorId -> [predecessorId]).
 */
export function wouldCreateCycle(
  successorId: string,
  predecessorId: string,
  edges: ReadonlyMap<string, readonly string[]>
): boolean {
  if (successorId === predecessorId) return true

  // Ciclo existe se, partindo de predecessorId e seguindo as arestas
  // "depende de" (predecessor de um predecessor, ...), chegarmos de volta
  // em successorId — isso significaria que successorId já é (transitivamente)
  // predecessor de predecessorId, e a nova aresta fecharia o laço.
  const visited = new Set<string>()
  const stack = [predecessorId]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === successorId) return true
    if (visited.has(current)) continue
    visited.add(current)
    const preds = edges.get(current) ?? []
    for (const p of preds) stack.push(p)
  }
  return false
}
