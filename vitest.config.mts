import { defineConfig } from "vitest/config"
import path from "node:path"

// Escopo deliberadamente restrito à camada de domínio pura (lib/domain) —
// o motor de Cronograma v2 precisa rodar e ser testado sem depender do
// Next.js/Prisma. Outras pastas do app não têm testes ainda.
export default defineConfig({
  test: {
    include: ["lib/domain/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
})
