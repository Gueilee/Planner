import { describe, expect, it } from "vitest"
import { computeProjectProgress, type TaskForProgress } from "../project-progress"

describe("computeProjectProgress — ponderado por duração planejada", () => {
  it("uma tarefa curta concluída não deve inflar o % com uma tarefa grande em risco", () => {
    // 1 dia concluída (100%) + 19 dias em 20% — a grande domina o resultado
    // (média simples daria 60%, escondendo que a maior parte do trabalho
    // real ainda falta).
    const tasks: TaskForProgress[] = [
      { id: "curta", progress: 100, parentId: null, startDate: "2026-01-01", endDate: "2026-01-01" },
      { id: "grande", progress: 20, parentId: null, startDate: "2026-01-02", endDate: "2026-01-20" },
    ]
    const pct = computeProjectProgress(tasks)
    // peso curta=1, peso grande=19 → (100*1 + 20*19)/20 = 24
    expect(pct).toBe(24)
    expect(pct).toBeLessThan(60) // não é mais a média simples
  })

  it("cai pra peso 1 quando faltam datas (item não agendado)", () => {
    const tasks: TaskForProgress[] = [
      { id: "a", progress: 100, parentId: null },
      { id: "b", progress: 0, parentId: null },
    ]
    expect(computeProjectProgress(tasks)).toBe(50) // mesmo resultado de antes (média simples)
  })

  it("mistura tarefas com e sem data — só as com data pesam mais que 1", () => {
    const tasks: TaskForProgress[] = [
      { id: "sem-data", progress: 100, parentId: null },
      { id: "com-data-9d", progress: 0, parentId: null, startDate: "2026-02-01", endDate: "2026-02-09" },
    ]
    // peso sem-data=1, peso com-data=9 → (100*1 + 0*9)/10 = 10
    expect(computeProjectProgress(tasks)).toBe(10)
  })

  it("marco (início == término) pesa 1, igual tarefa de 1 dia", () => {
    const tasks: TaskForProgress[] = [
      { id: "marco", progress: 0, parentId: null, startDate: "2026-03-10", endDate: "2026-03-10" },
      { id: "tarefa-1d", progress: 100, parentId: null, startDate: "2026-03-11", endDate: "2026-03-11" },
    ]
    expect(computeProjectProgress(tasks)).toBe(50) // pesos iguais (1 e 1)
  })

  it("ignora itens de grupo (não-folha), só pondera as tarefas-folha", () => {
    const tasks: TaskForProgress[] = [
      { id: "grupo", progress: 999, parentId: null, startDate: "2026-01-01", endDate: "2026-01-31" }, // não deve entrar na conta
      { id: "filha", progress: 40, parentId: "grupo", startDate: "2026-01-01", endDate: "2026-01-05" },
    ]
    expect(computeProjectProgress(tasks)).toBe(40)
  })

  it("datas invertidas (fim antes do início) não quebram — cai pro peso mínimo 1", () => {
    const tasks: TaskForProgress[] = [
      { id: "a", progress: 100, parentId: null, startDate: "2026-05-10", endDate: "2026-05-01" },
      { id: "b", progress: 0, parentId: null, startDate: "2026-05-01", endDate: "2026-05-01" },
    ]
    expect(computeProjectProgress(tasks)).toBe(50)
  })

  it("lista vazia devolve 0", () => {
    expect(computeProjectProgress([])).toBe(0)
  })
})
