// Redimensiona e converte uma foto de perfil pra base64 antes de enviar —
// evita gravar imagens gigantes no banco (usuário sobe uma foto de celular
// de vários MB, aqui vira um avatar pequeno o bastante pra um círculo de
// interface). Extraído de app/(dashboard)/organizations/organizations-client.tsx
// pra ser reaproveitado também no painel global de usuários.
export function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 80
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
      const w = Math.max(1, Math.round(img.width * ratio))
      const h = Math.max(1, Math.round(img.height * ratio))
      const canvas = document.createElement("canvas")
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("Canvas não suportado")); return }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(objectUrl)
      resolve(canvas.toDataURL("image/jpeg", 0.78))
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Falha ao ler imagem")) }
    img.src = objectUrl
  })
}
