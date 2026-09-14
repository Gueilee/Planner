// Cliente Microsoft Graph — busca de usuários no Azure AD/Entra ID (diretório
// da empresa), estilo "people picker" do Teams. Reaproveita o App Registration
// "Reserva de Salas - Graph API" já autorizado no Azure (mesmo usado pelo
// Compras) — cliente-credenciais (app-only), sem envolver login individual de
// cada usuário. Não tem NENHUMA relação com o login do Kronex (auth.ts
// continua só e-mail/senha) — é só uma fonte de dados pra preencher campos
// como "Responsável".
//
// Módulo sem I/O de UI, testável isoladamente (buildSearchQuery é pura).

const GRAPH_BASE = "https://graph.microsoft.com/v1.0"

export type AzureDirectoryUser = {
  azureId: string
  name: string
  email: string
  jobTitle: string | null
  department: string | null
}

type CachedToken = { accessToken: string; expiresAt: number }
let cachedToken: CachedToken | null = null

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variável de ambiente ausente: ${name} (integração com Azure AD/Microsoft Graph)`)
  return v
}

// Renova com 60s de margem antes do vencimento real do token.
async function getGraphToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) return cachedToken.accessToken

  const tenantId = requiredEnv("AZURE_GRAPH_TENANT_ID")
  const clientId = requiredEnv("AZURE_GRAPH_CLIENT_ID")
  const clientSecret = requiredEnv("AZURE_GRAPH_CLIENT_SECRET")

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  })

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Falha ao autenticar no Microsoft Graph (${res.status}): ${detail.slice(0, 300)}`)
  }
  const json = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { accessToken: json.access_token, expiresAt: now + json.expires_in * 1000 }
  return cachedToken.accessToken
}

// Escapa aspas duplas dentro do termo buscado — a sintaxe $search do Graph
// exige o termo entre aspas; um termo com aspas quebraria a query inteira.
function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/"/g, '\\"')
}

// Monta a query OData de busca — função pura, testável sem rede. Busca por
// nome OU e-mail ao mesmo tempo (mesma UX do people picker do Teams, que não
// obriga saber se a pessoa vai digitar nome ou e-mail).
export function buildSearchQuery(term: string): string {
  const t = sanitizeSearchTerm(term.trim())
  return `"displayName:${t}" OR "mail:${t}"`
}

const MIN_QUERY_LENGTH = 2
const MAX_RESULTS = 8

export async function searchAzureUsers(term: string): Promise<AzureDirectoryUser[]> {
  const trimmed = term.trim()
  if (trimmed.length < MIN_QUERY_LENGTH) return []

  const token = await getGraphToken()
  const params = new URLSearchParams({
    $search: buildSearchQuery(trimmed),
    $select: "id,displayName,mail,userPrincipalName,jobTitle,department,accountEnabled",
    $top: String(MAX_RESULTS),
    $count: "true",
  })

  const res = await fetch(`${GRAPH_BASE}/users?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ConsistencyLevel: "eventual",
    },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Falha ao buscar usuários no Microsoft Graph (${res.status}): ${detail.slice(0, 300)}`)
  }
  const json = (await res.json()) as {
    value: Array<{
      id: string
      displayName: string | null
      mail: string | null
      userPrincipalName: string | null
      jobTitle: string | null
      department: string | null
      accountEnabled: boolean | null
    }>
  }

  return json.value
    .filter((u) => u.accountEnabled !== false && (u.mail || u.userPrincipalName) && u.displayName)
    .map((u) => ({
      azureId: u.id,
      name: u.displayName as string,
      email: (u.mail ?? u.userPrincipalName ?? "").toLowerCase(),
      jobTitle: u.jobTitle,
      department: u.department,
    }))
    .filter((u) => u.email)
}
