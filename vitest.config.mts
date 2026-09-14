import { defineConfig } from "vitest/config"
import path from "node:path"

// Escopo deliberadamente restrito a módulos puros, sem depender do
// Next.js/Prisma/React — o motor de Cronograma v2 (lib/domain) e o cliente
// Microsoft Graph (lib/graph, só funções puras + fetch nativo, testadas sem
// rede de verdade). Outras pastas do app não têm testes ainda.
export default defineConfig({
  test: {
    include: ["lib/domain/**/*.test.ts", "lib/graph/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
})
