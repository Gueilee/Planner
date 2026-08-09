export type ScreenPermission = {
  canView:   boolean
  canCreate: boolean
  canEdit:   boolean
  canDelete: boolean
}

export type ScreenDef = {
  key:   string
  label: string
  desc:  string
}

export type ScreenGroup = {
  key:     string
  label:   string
  color:   string
  screens: ScreenDef[]
}

// Uma tela por item do menu lateral — a chave é usada tanto na matriz de
// permissões (Configurações › Perfis de Acesso) quanto no enforcement real
// (lib/permissions-guard.ts, app/api/my-permissions, sidebar).
export const SCREEN_GROUPS: ScreenGroup[] = [
  {
    key:   "menu",
    label: "Telas do Sistema",
    color: "#7B2FBE",
    screens: [
      { key: "dashboard",      label: "Dashboard",             desc: "Visão geral do portfólio de projetos" },
      { key: "projects",       label: "Projetos",              desc: "Lista, abertura, cronograma interno, kick-off, go/no-go, apresentações e lições aprendidas de cada projeto" },
      { key: "priority",       label: "Priorização",           desc: "Ordenar e pontuar projetos por importância e urgência estratégica" },
      { key: "kanban",         label: "Kanban",                desc: "Visualizar tarefas no formato kanban e mover entre colunas" },
      { key: "status_report",  label: "Status Report",         desc: "Criar, visualizar e exportar relatórios de status periódicos" },
      { key: "analytics",      label: "Indicadores",           desc: "Dashboard com KPIs, métricas e indicadores do portfólio" },
      { key: "closure",        label: "Encerramento",          desc: "Conduzir o encerramento formal e gerar documento de closure" },
      { key: "knowledge_base", label: "Base de Conhecimento",  desc: "Acessar documentação técnica, funcional e manuais do sistema" },
      { key: "history",        label: "Consulta de Projetos",  desc: "Consultar e pesquisar o histórico completo de todos os projetos" },
      { key: "templates",      label: "Modelos de Cronograma", desc: "Usar, criar e editar templates padrão de cronograma para novos projetos" },
      { key: "benefits",       label: "Benefícios e Valor",    desc: "Registrar, medir e acompanhar os benefícios gerados pelo projeto" },
    ],
  },
]

export const ALL_SCREEN_KEYS = SCREEN_GROUPS.flatMap((g) => g.screens.map((s) => s.key))
