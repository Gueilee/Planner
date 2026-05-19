import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "PLANNER — Gestão de Projetos",
    template: "%s | PLANNER",
  },
  description: "PLANNER by Vendemmia — Plataforma de gestão de projetos empresariais",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full`}>
      <body className="h-full bg-[--kronex-light] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
