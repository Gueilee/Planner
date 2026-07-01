export type FeatureDef = {
  key:     string
  label:   string
  desc:    string
  hasEdit: boolean
}

export type FeatureGroup = {
  key:      string
  label:    string
  color:    string
  features: FeatureDef[]
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    key:   "projects",
    label: "Projetos",
    color: "#2463FF",
    features: [
      { key: "project_view",   label: "Visualizar Projetos",    desc: "Ver lista, detalhes e dados dos projetos do portfólio",              hasEdit: false },
      { key: "project_create", label: "Criar Projetos",         desc: "Abrir novos projetos e preencher o formulário de abertura",           hasEdit: true  },
      { key: "project_edit",   label: "Editar Projetos",        desc: "Alterar campos, datas, escopo e informações gerais do projeto",        hasEdit: true  },
      { key: "project_delete", label: "Excluir Projetos",       desc: "Remover projetos permanentemente do sistema",                          hasEdit: true  },
    ],
  },
  {
    key:   "lifecycle",
    label: "Ciclo de Vida",
    color: "#7B2FBE",
    features: [
      { key: "gonogo",        label: "Go / No-Go",    desc: "Registrar e visualizar decisões de aprovação ou reprovação do projeto", hasEdit: true },
      { key: "kickoff",       label: "Kick-Off",      desc: "Conduzir a cerimônia de início e registrar ata de kick-off",            hasEdit: true },
      { key: "status_report", label: "Status Report", desc: "Criar, visualizar e exportar relatórios de status periódicos",           hasEdit: true },
    ],
  },
  {
    key:   "execution",
    label: "Execução",
    color: "#0891B2",
    features: [
      { key: "schedule",      label: "Cronograma",           desc: "Acessar, criar e editar atividades no cronograma do projeto", hasEdit: true },
      { key: "kanban",        label: "Kanban",               desc: "Visualizar tarefas no formato kanban e mover entre colunas",   hasEdit: true },
      { key: "presentations", label: "Apresentação Técnica", desc: "Criar e visualizar apresentações técnicas do projeto",          hasEdit: true },
    ],
  },
  {
    key:   "analysis",
    label: "Análise e Decisão",
    color: "#D97706",
    features: [
      { key: "priority",  label: "Priorização", desc: "Ordenar e pontuar projetos por importância e urgência estratégica", hasEdit: true  },
      { key: "analytics", label: "Indicadores", desc: "Dashboard com KPIs, métricas e indicadores do portfólio",            hasEdit: false },
    ],
  },
  {
    key:   "closure",
    label: "Encerramento",
    color: "#059669",
    features: [
      { key: "closure",  label: "Encerramento de Projetos", desc: "Conduzir o encerramento formal e gerar documento de closure",           hasEdit: true },
      { key: "benefits", label: "Benefícios e Valor",       desc: "Registrar, medir e acompanhar os benefícios gerados pelo projeto",       hasEdit: true },
      { key: "lessons",  label: "Lições Aprendidas",        desc: "Documentar aprendizados, boas práticas e pontos de melhoria contínua",   hasEdit: true },
    ],
  },
  {
    key:   "knowledge",
    label: "Conhecimento",
    color: "#EA580C",
    features: [
      { key: "knowledge_base", label: "Base de Conhecimento",  desc: "Acessar documentação técnica, funcional e manuais do sistema",           hasEdit: false },
      { key: "history",        label: "Consulta de Projetos",  desc: "Consultar e pesquisar o histórico completo de todos os projetos",         hasEdit: false },
      { key: "templates",      label: "Modelos de Cronograma", desc: "Usar, criar e editar templates padrão de cronograma para novos projetos", hasEdit: true  },
    ],
  },
  {
    key:   "admin",
    label: "Administração",
    color: "#DC2626",
    features: [
      { key: "settings",        label: "Configurações do Sistema", desc: "Acessar e modificar as configurações gerais da plataforma",                hasEdit: true },
      { key: "users_manage",    label: "Gestão de Usuários",       desc: "Criar, editar, ativar/desativar e excluir usuários do sistema",            hasEdit: true },
      { key: "profiles_manage", label: "Perfis de Acesso",         desc: "Criar e gerenciar perfis de permissão para os grupos de usuários",         hasEdit: true },
      { key: "orgs_manage",     label: "Filiais e Organizações",   desc: "Gerenciar filiais, organizações e acessos multi-filial de usuários",       hasEdit: true },
    ],
  },
]

export const ALL_FEATURE_KEYS = FEATURE_GROUPS.flatMap((g) => g.features.map((f) => f.key))
