import nodemailer from 'nodemailer'

const BASE_URL = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const MAILER_DSN  = process.env.MAILER_DSN  || ''
const MAILER_FROM = process.env.MAILER_FROM || ''

let smtpHost   = ''
let smtpPort   = 587
let smtpUser   = ''
let smtpPass   = ''
let smtpSecure = false

if (MAILER_DSN) {
  try {
    const parsed          = new URL(MAILER_DSN)
    const userParam       = parsed.searchParams.get('username')
    const passParam       = parsed.searchParams.get('password')
    const encryptionParam = parsed.searchParams.get('encryption')

    smtpUser = userParam || decodeURIComponent(parsed.username || '')
    smtpPass = passParam || decodeURIComponent(parsed.password || '')
    smtpHost = parsed.hostname || ''
    smtpPort = parsed.port
      ? parseInt(parsed.port, 10)
      : parsed.protocol === 'smtps:' ? 465 : 587

    const encryption = (encryptionParam || (smtpPort === 465 ? 'ssl' : 'tls')).toLowerCase()
    smtpSecure = encryption === 'ssl'
  } catch (e) {
    console.error('[email] Erro ao parsear MAILER_DSN:', e)
  }
}

if (!smtpHost) {
  smtpHost   = process.env.EMAIL_HOST   || ''
  smtpPort   = parseInt(process.env.EMAIL_PORT   || '587', 10)
  smtpUser   = process.env.EMAIL_USER   || ''
  smtpPass   = process.env.EMAIL_PASS   || ''
  smtpSecure = process.env.EMAIL_SECURE === 'true' || smtpPort === 465
}

const FROM     = MAILER_FROM || `PLANNER Vendemmia <naoresponda@vendemmia.com.br>`
const DEV_MODE = !smtpHost

function makeTransport() {
  if (DEV_MODE) return null
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
    tls: { rejectUnauthorized: false },
  })
}

async function sendMail(to: string, subject: string, html: string) {
  const transport = makeTransport()
  if (!transport) {
    console.log(`\n📧 [DEV] E-mail para ${to}\n   Assunto: ${subject}\n`)
    return
  }
  await transport.sendMail({ from: FROM, to, subject, html })
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function sendInviteEmail(to: string, name: string, token: string) {
  const link = `${BASE_URL}/invite/${token}`
  await sendMail(to, 'Você foi convidado para o PLANNER Vendemmia', inviteHtml(name, link))
}

// ── HTML Templates ───────────────────────────────────────────────────────────

function wrapper(content: string) {
  const logo = `${BASE_URL}/logo_v4.png`
  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>PLANNER Vendemmia</title>
</head>
<body style="margin:0;padding:0;background-color:#f0edf8;font-family:Arial,Helvetica,sans-serif">
<table width="100%" bgcolor="#f0edf8" cellpadding="0" cellspacing="0" border="0" role="presentation">
  <tr><td align="center" style="padding:32px 16px">
    <table width="560" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:560px;width:100%">

      <tr>
        <td>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
            style="background:linear-gradient(135deg,#422c76 0%,#C026D3 100%);border-radius:14px 14px 0 0">
            <tr>
              <td align="center" style="padding:28px 40px">
                <img src="${logo}" alt="PLANNER Vendemmia" width="160"
                  style="display:inline-block;height:auto;max-width:160px;border:0" />
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td bgcolor="#422c76" height="4" style="font-size:0;line-height:0">&nbsp;</td>
      </tr>

      <tr>
        <td bgcolor="#ffffff"
          style="padding:36px 44px;border-left:1px solid #e8e3f4;border-right:1px solid #e8e3f4">
          ${content}
        </td>
      </tr>

      <tr>
        <td bgcolor="#f5f3fa"
          style="padding:18px 40px;text-align:center;border:1px solid #e8e3f4;border-top:none;border-radius:0 0 14px 14px">
          <p style="margin:0;font-size:11px;color:#9ca3af;font-family:Arial,sans-serif;line-height:1.6">
            &copy; 2026 Vendemmia Com&eacute;rcio Internacional &nbsp;&middot;&nbsp; Mensagem autom&aacute;tica, n&atilde;o responda este e-mail
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

function btn(label: string, link: string) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
      <tr>
        <td align="center" style="padding:28px 0 4px">
          <a href="${link}"
            style="display:inline-block;padding:15px 40px;background:linear-gradient(135deg,#422c76 0%,#C026D3 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;font-family:Arial,sans-serif;border-radius:8px">
            ${label}
          </a>
        </td>
      </tr>
    </table>`
}

function inviteHtml(name: string, link: string) {
  return wrapper(`
    <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:#C026D3;text-transform:uppercase;letter-spacing:1.5px;line-height:20px">
      Convite de acesso
    </p>
    <h2 style="margin:8px 0 20px;font-family:Arial,sans-serif;font-size:24px;font-weight:bold;color:#422c76;line-height:32px">
      Bem-vindo(a), ${name}!
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
      <tr><td bgcolor="#e8e3f4" height="1" style="font-size:0;line-height:0">&nbsp;</td></tr>
    </table>
    <p style="margin:20px 0 0;font-family:Arial,sans-serif;font-size:15px;color:#4b5563;line-height:1.7">
      Voc&ecirc; foi convidado para acessar o <strong style="color:#422c76">PLANNER Vendemmia</strong> &mdash;
      a plataforma de gest&atilde;o de projetos da Vendemmia.
      Clique no bot&atilde;o abaixo para definir sua senha e ativar seu acesso.
    </p>
    ${btn('Ativar meu acesso', link)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:8px">
      <tr>
        <td width="4" bgcolor="#422c76" style="font-size:0;line-height:0">&nbsp;</td>
        <td bgcolor="#f0ecff" style="padding:14px 18px;font-family:Arial,sans-serif;font-size:13px;color:#555;line-height:1.6">
          <strong style="color:#422c76">Este link &eacute; v&aacute;lido por 7 dias.</strong><br>
          Se voc&ecirc; n&atilde;o esperava este convite, pode ignorar este e-mail com seguran&ccedil;a.
        </td>
      </tr>
    </table>
  `)
}
