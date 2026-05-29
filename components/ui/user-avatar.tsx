"use client"

// Componente compartilhado de avatar de usuário.
// Exibe a foto do usuário quando disponível, ou um círculo colorido com iniciais.
// A cor do círculo é determinística baseada no nome (hash HSL) para ser sempre
// consistente entre componentes e recarregamentos.

function memberColor(name: string): string {
  const hue = (name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360
  return `hsl(${hue},55%,42%)`
}

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase()
}

interface UserAvatarProps {
  name: string
  image?: string | null
  size?: number
  className?: string
  style?: React.CSSProperties
}

export function UserAvatar({ name, image, size = 28, className, style }: UserAvatarProps) {
  const s = `${size}px`
  const fontSize = `${Math.max(7, Math.round(size * 0.36))}px`

  return (
    <div
      title={name}
      className={className}
      style={{
        width: s, height: s,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: image ? "transparent" : memberColor(name),
        fontSize,
        fontWeight: 800,
        color: "white",
        ...style,
      }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initials(name)
      )}
    </div>
  )
}
