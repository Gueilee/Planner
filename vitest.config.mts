import { defineConfig } from "vitest/config"
import path from "node:path"

// Escopo deliberadamente restrito a módulos puros, sem depender do
// Next.js/Prisma/React — o motor de Cronograma v2 (lib/domain), o cliente
// Microsoft Graph (lib/graph, só funções puras + fetch nativo, testadas sem
// rede de verdade) e lib/utils (funções puras de cálculo tipo
// computeProjectProgress, sem I/O). Outras pastas do app não têm testes
// ainda.
export default defineConfig({
  test: {
    include: ["lib/domain/**/*.test.ts", "lib/graph/**/*.test.ts", "lib/utils/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
})
