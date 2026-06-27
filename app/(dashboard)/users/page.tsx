import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { UsersClient } from "./users-client"

export const metadata = { title: "Usuários" }

export default async function UsersPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      role: true,
      phone: true,
      active: true,
      image: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  })

  const serialized = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }))

  return (
    <div className="flex flex-col h-full">
      <Header title="Usuários" subtitle="Cadastro e gestão de usuários do sistema" />
      <UsersClient initialUsers={serialized} />
    </div>
  )
}
