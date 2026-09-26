import { describe, expect, it } from "vitest"
import { computeProjectProgress, type TaskForProgress } from "../project-progress"

describe("computeProjectProgress — média entre atividades mãe, ponderada por duração dentro de cada uma", () => {
  it("uma tarefa com data absurda não pode mais dominar o projeto inteiro (incidente real: APTISSEN-CD2)", () => {
    // Duas atividades mãe: A com 4 tarefas normais (~10 dias cada, 0-100%
    // variados), B com só 1 tarefa cujo término foi digitado 3 anos no
    // futuro por engano (peso de duração ordens de grandeza maior que
    // TODAS as outras somadas) e 100% concluída. Ponderar direto entre
    // todas as tarefas-folha do projeto (comportamento antigo) fazia essa
    // única tarefa, sozinha, valer mais que o projeto inteiro. Com a média
    // por atividade mãe, o estrago de B fica contido em 1/2 do total.
    const tasks: TaskForProgress[] = [
      { id: "a", progress: 0, parentId: null, startDate: "2026-01-01", endDate: "2026-01-31" },
      { id: "a1", progress: 20, parentId: "a", startDate: "2026-01-01", endDate: "2026-01-10" },
      { id: "a2", progress: 40, parentId: "a", startDate: "2026-01-11", endDate: "2026-01-20" },
      { id: "a3", progress: 60, parentId: "a", startDate: "2026-01-21", endDate: "2026-01-31" },
      { id: "b", progress: 0, parentId: null, startDate: "2026-01-01", endDate: "2029-01-01" },
      { id: "b1", progress: 100, parentId: "b", startDate: "2026-01-01", endDate: "2029-01-01" },
    ]
    const pct = computeProjectProgress(tasks)
    // A pondera 20/40/60 pelas próprias durações (~10d cada, quase iguais)
    // ≈ 40; B = 100 (única folha); projeto = média simples (40+100)/2 = 70.
    expect(pct).toBe(70)
    expect(pct).toBeLessThan(100) // não deixa a tarefa de 3 anos varrer tudo
  })

  it("dentro da MESMA atividade mãe, ainda pondera por duração (tarefa grande pesa mais que pequena)", () => {
    const tasks: TaskForProgress[] = [
      { id: "mae", progress: 0, parentId: null, startDate: "2026-01-01", endDate: "2026-01-20" },
      { id: "curta", progress: 100, parentId: "mae", startDate: "2026-01-01", endDate: "2026-01-01" },
      { id: "grande", progress: 20, parentId: "mae", startDate: "2026-01-02", endDate: "2026-01-20" },
    ]
    // peso curta=1, peso grande=19 → (100*1 + 20*19)/20 = 24 — só existe 1
    // atividade mãe, então o valor dela É o valor do projeto.
    expect(computeProjectProgress(tasks)).toBe(24)
  })

  it("sem nenhum agrupamento (tudo no topo, cronograma pequeno/plano): cada tarefa é sua própria atividade, peso igual entre elas", () => {
    const tasks: TaskForProgress[] = [
      { id: "a", progress: 100, parentId: null },
      { id: "b", progress: 0, parentId: null },
    ]
    expect(computeProjectProgress(tasks)).toBe(50)
  })

  it("marco (início == término) entra na conta da própria atividade mãe normalmente", () => {
    const tasks: TaskForProgress[] = [
      { id: "mae", progress: 0, parentId: null },
      { id: "marco", progress: 0, parentId: "mae", startDate: "2026-03-10", endDate: "2026-03-10" },
      { id: "tarefa-1d", progress: 100, parentId: "mae", startDate: "2026-03-11", endDate: "2026-03-11" },
    ]
    expect(computeProjectProgress(tasks)).toBe(50) // pesos iguais (1 e 1) dentro da mesma mãe
  })

  it("ignora itens de grupo (não-folha) no valor de cada atividade mãe, só pondera as tarefas-folha", () => {
    const tasks: TaskForProgress[] = [
      { id: "grupo", progress: 999, parentId: null, startDate: "2026-01-01", endDate: "2026-01-31" }, // não deve entrar na conta
      { id: "filha", progress: 40, parentId: "grupo", startDate: "2026-01-01", endDate: "2026-01-05" },
    ]
    expect(computeProjectProgress(tasks)).toBe(40)
  })

  it("datas invertidas (fim antes do início) não quebram — cai pro peso mínimo 1", () => {
    const tasks: TaskForProgress[] = [
      { id: "mae", progress: 0, parentId: null },
      { id: "a", progress: 100, parentId: "mae", startDate: "2026-05-10", endDate: "2026-05-01" },
      { id: "b", progress: 0, parentId: "mae", startDate: "2026-05-01", endDate: "2026-05-01" },
    ]
    expect(computeProjectProgress(tasks)).toBe(50)
  })

  it("lista vazia devolve 0", () => {
    expect(computeProjectProgress([])).toBe(0)
  })

  it("tarefa cancelada não conta no % da atividade mãe (nem como 0%, nem como 100%)", () => {
    const tasks: TaskForProgress[] = [
      { id: "mae", progress: 0, parentId: null },
      { id: "ativa", progress: 60, parentId: "mae", startDate: "2026-01-01", endDate: "2026-01-10" },
      { id: "cancelada", progress: 0, parentId: "mae", startDate: "2026-01-01", endDate: "2026-01-10", cancelled: true },
    ]
    // Se a cancelada contasse como 0%, daria (60+0)/2=30 — ela precisa ficar
    // de fora inteira, sobrando só "ativa" (60%).
    expect(computeProjectProgress(tasks)).toBe(60)
  })

  it("atividade mãe inteira cancelada não entra na média do projeto", () => {
    const tasks: TaskForProgress[] = [
      { id: "mae-ativa",     progress: 0, parentId: null },
      { id: "t1", progress: 80, parentId: "mae-ativa", startDate: "2026-01-01", endDate: "2026-01-05" },
      { id: "mae-cancelada", progress: 0, parentId: null, cancelled: true },
      { id: "t2", progress: 100, parentId: "mae-cancelada", startDate: "2026-01-01", endDate: "2026-01-05" },
    ]
    // Só "mae-ativa" deveria contar (80%) — a mãe cancelada e tudo dentro
    // dela ficam fora da média do projeto.
    expect(computeProjectProgress(tasks)).toBe(80)
  })
})
