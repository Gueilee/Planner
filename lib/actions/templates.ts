"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { addDays } from "date-fns"

// ─── Types ────────────────────────────────────────────────────────────────────

export type TemplateTask = {
  id: string
  templateId: string
  wbsCode: string
  parentCode: string | null
  title: string
  estimatedEffort: number | null
  isMilestone: boolean
  predecessorCodes: string[]
  durationDays: number
  order: number
}

export type Template = {
  id: string
  name: string
  description: string | null
  projectType: string
  color: string | null
  isBuiltIn: boolean
  createdById: string
  createdAt: string
  tasks: TemplateTask[]
}

// ─── Default templates data ───────────────────────────────────────────────────

const DEFAULT_TEMPLATES: Omit<Template, "id" | "createdById" | "createdAt">[] = [
  {
    name: "Automação / Tecnologia",
    description: "Modelo completo para projetos de automação, desenvolvimento e implantação de sistemas",
    projectType: "AUTOMACAO",
    color: "#7B2FBE",
    isBuiltIn: true,
    tasks: [
      { id:"", templateId:"", wbsCode:"1",     parentCode:null,  title:"1 - Iniciação",                                           estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:1 },
      { id:"", templateId:"", wbsCode:"1.1",   parentCode:"1",   title:"Solicitação Novo Projeto - Planner",                       estimatedEffort:0.5,  isMilestone:false, predecessorCodes:[], durationDays:1, order:2 },
      { id:"", templateId:"", wbsCode:"1.2",   parentCode:"1",   title:"Análise de viabilidade",                                   estimatedEffort:null, isMilestone:false, predecessorCodes:["1.1"], durationDays:2, order:3 },
      { id:"", templateId:"", wbsCode:"1.3",   parentCode:"1",   title:"Agenda Go / No Go",                                        estimatedEffort:0.5,  isMilestone:true,  predecessorCodes:["1.2"], durationDays:1, order:4 },
      { id:"", templateId:"", wbsCode:"1.4",   parentCode:"1",   title:"Termo de Abertura",                                        estimatedEffort:0.1,  isMilestone:false, predecessorCodes:["1.3"], durationDays:1, order:5 },
      { id:"", templateId:"", wbsCode:"1.5",   parentCode:"1",   title:"Aprovação do Termo de Abertura",                           estimatedEffort:0.1,  isMilestone:false, predecessorCodes:["1.4"], durationDays:1, order:6 },
      { id:"", templateId:"", wbsCode:"1.6",   parentCode:"1",   title:"Apresentação Técnica",                                     estimatedEffort:0.5,  isMilestone:false, predecessorCodes:["1.5"], durationDays:1, order:7 },
      { id:"", templateId:"", wbsCode:"2",     parentCode:null,  title:"2 - Planejamento",                                         estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:8 },
      { id:"", templateId:"", wbsCode:"2.1",   parentCode:"2",   title:"Construção do Cronograma",                                  estimatedEffort:1,    isMilestone:false, predecessorCodes:["1.5"], durationDays:2, order:9 },
      { id:"", templateId:"", wbsCode:"2.2",   parentCode:"2",   title:"Validação do Cronograma - Stakeholders",                    estimatedEffort:0.5,  isMilestone:false, predecessorCodes:["2.1"], durationDays:1, order:10 },
      { id:"", templateId:"", wbsCode:"2.3",   parentCode:"2",   title:"Kick Off",                                                  estimatedEffort:1,    isMilestone:true,  predecessorCodes:["2.2"], durationDays:1, order:11 },
      { id:"", templateId:"", wbsCode:"3",     parentCode:null,  title:"3 - Execução",                                              estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:12 },
      { id:"", templateId:"", wbsCode:"3.1",   parentCode:"3",   title:"Mapeamento de Processo",                                    estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:13 },
      { id:"", templateId:"", wbsCode:"3.1.1", parentCode:"3.1", title:"Mapeamento e Validação de Requisitos",                      estimatedEffort:null, isMilestone:false, predecessorCodes:["2.3"], durationDays:5, order:14 },
      { id:"", templateId:"", wbsCode:"3.1.2", parentCode:"3.1", title:"Documentação de Especificação Funcional",                   estimatedEffort:null, isMilestone:false, predecessorCodes:["3.1.1"], durationDays:3, order:15 },
      { id:"", templateId:"", wbsCode:"3.1.3", parentCode:"3.1", title:"Documentação de Especificação Técnica",                     estimatedEffort:null, isMilestone:false, predecessorCodes:["3.1.1"], durationDays:3, order:16 },
      { id:"", templateId:"", wbsCode:"3.2",   parentCode:"3",   title:"Desenvolvimento e Construção",                              estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:17 },
      { id:"", templateId:"", wbsCode:"3.2.1", parentCode:"3.2", title:"Construção do Workflow",                                    estimatedEffort:null, isMilestone:false, predecessorCodes:["3.1.3","3.1.2"], durationDays:5, order:18 },
      { id:"", templateId:"", wbsCode:"3.2.2", parentCode:"3.2", title:"Apresentação do Processo + Consideração Inicial",           estimatedEffort:null, isMilestone:false, predecessorCodes:["3.2.1"], durationDays:1, order:19 },
      { id:"", templateId:"", wbsCode:"3.2.3", parentCode:"3.2", title:"Ajuste Incremental",                                        estimatedEffort:null, isMilestone:false, predecessorCodes:["3.2.2"], durationDays:3, order:20 },
      { id:"", templateId:"", wbsCode:"3.3",   parentCode:"3",   title:"Teste e Treinamento",                                       estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:21 },
      { id:"", templateId:"", wbsCode:"3.3.1", parentCode:"3.3", title:"Teste Unitário - Tecnologia",                               estimatedEffort:null, isMilestone:false, predecessorCodes:["3.2.3"], durationDays:1, order:22 },
      { id:"", templateId:"", wbsCode:"3.3.2", parentCode:"3.3", title:"Teste Unitário - Key User e ou Product Owner",              estimatedEffort:null, isMilestone:false, predecessorCodes:["3.3.1"], durationDays:1, order:23 },
      { id:"", templateId:"", wbsCode:"3.3.3", parentCode:"3.3", title:"Treinamento",                                               estimatedEffort:null, isMilestone:false, predecessorCodes:["3.3.2"], durationDays:1, order:24 },
      { id:"", templateId:"", wbsCode:"3.3.4", parentCode:"3.3", title:"Teste Integrado - Área",                                    estimatedEffort:null, isMilestone:false, predecessorCodes:["3.3.3"], durationDays:1, order:25 },
      { id:"", templateId:"", wbsCode:"3.3.5", parentCode:"3.3", title:"Aceite e Homologação",                                      estimatedEffort:null, isMilestone:true,  predecessorCodes:["3.3.4"], durationDays:1, order:26 },
      { id:"", templateId:"", wbsCode:"3.4",   parentCode:"3",   title:"Cutover",                                                   estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:27 },
      { id:"", templateId:"", wbsCode:"3.4.1", parentCode:"3.4", title:"Plano de Cutover",                                          estimatedEffort:1,    isMilestone:false, predecessorCodes:["3.3.4"], durationDays:1, order:28 },
      { id:"", templateId:"", wbsCode:"3.4.2", parentCode:"3.4", title:"Plano de GMUD",                                             estimatedEffort:1,    isMilestone:false, predecessorCodes:["3.3.4"], durationDays:1, order:29 },
      { id:"", templateId:"", wbsCode:"3.4.3", parentCode:"3.4", title:"Comunicação Interna",                                       estimatedEffort:1,    isMilestone:false, predecessorCodes:["3.4.2"], durationDays:1, order:30 },
      { id:"", templateId:"", wbsCode:"3.5",   parentCode:"3",   title:"Entrada em Produção",                                       estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:31 },
      { id:"", templateId:"", wbsCode:"3.5.1", parentCode:"3.5", title:"Smoke Teste",                                               estimatedEffort:2,    isMilestone:false, predecessorCodes:["3.4.2"], durationDays:1, order:32 },
      { id:"", templateId:"", wbsCode:"3.5.2", parentCode:"3.5", title:"Go Live",                                                   estimatedEffort:1,    isMilestone:true,  predecessorCodes:["3.5.1"], durationDays:1, order:33 },
      { id:"", templateId:"", wbsCode:"3.5.3", parentCode:"3.5", title:"Hypercare",                                                 estimatedEffort:null, isMilestone:false, predecessorCodes:["3.5.2"], durationDays:14, order:34 },
      { id:"", templateId:"", wbsCode:"3.5.4", parentCode:"3.5", title:"Passagem de Bastão - Time de Projeto e Time de Sustentação", estimatedEffort:1,   isMilestone:false, predecessorCodes:["3.5.3"], durationDays:1, order:35 },
      { id:"", templateId:"", wbsCode:"4",     parentCode:null,  title:"4 - Encerramento",                                          estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:36 },
      { id:"", templateId:"", wbsCode:"4.1",   parentCode:"4",   title:"Agenda de Encerramento do Projeto",                         estimatedEffort:1,    isMilestone:true,  predecessorCodes:["3.5.4"], durationDays:1, order:37 },
      { id:"", templateId:"", wbsCode:"4.2",   parentCode:"4",   title:"Termo de Encerramento do Projeto",                          estimatedEffort:0.1,  isMilestone:false, predecessorCodes:["4.1"], durationDays:1, order:38 },
      { id:"", templateId:"", wbsCode:"4.3",   parentCode:"4",   title:"Assinatura do Termo de Encerramento",                       estimatedEffort:0.1,  isMilestone:false, predecessorCodes:["4.2"], durationDays:1, order:39 },
      { id:"", templateId:"", wbsCode:"4.4",   parentCode:"4",   title:"Conclusão do Projeto",                                      estimatedEffort:0.1,  isMilestone:false, predecessorCodes:["4.3"], durationDays:1, order:40 },
    ],
  },
  {
    name: "Qualidade / Processos",
    description: "Modelo para projetos de qualidade, reestruturação de processos e atualização de documentação",
    projectType: "QUALIDADE",
    color: "#10B981",
    isBuiltIn: true,
    tasks: [
      { id:"", templateId:"", wbsCode:"1",   parentCode:null, title:"1 - Iniciação",                           estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:1 },
      { id:"", templateId:"", wbsCode:"1.1", parentCode:"1",  title:"Solicitação Novo Projeto - Planner",       estimatedEffort:0.5,  isMilestone:false, predecessorCodes:[], durationDays:1, order:2 },
      { id:"", templateId:"", wbsCode:"1.2", parentCode:"1",  title:"Agenda Go / No Go",                        estimatedEffort:0.5,  isMilestone:true,  predecessorCodes:["1.1"], durationDays:1, order:3 },
      { id:"", templateId:"", wbsCode:"1.3", parentCode:"1",  title:"Termo de Abertura",                        estimatedEffort:0.1,  isMilestone:false, predecessorCodes:["1.2"], durationDays:1, order:4 },
      { id:"", templateId:"", wbsCode:"1.4", parentCode:"1",  title:"Aprovação do Termo de Abertura",           estimatedEffort:0.1,  isMilestone:false, predecessorCodes:["1.3"], durationDays:1, order:5 },
      { id:"", templateId:"", wbsCode:"1.5", parentCode:"1",  title:"Apresentação Técnica",                     estimatedEffort:0.5,  isMilestone:false, predecessorCodes:["1.4"], durationDays:1, order:6 },
      { id:"", templateId:"", wbsCode:"2",   parentCode:null, title:"2 - Planejamento",                         estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:7 },
      { id:"", templateId:"", wbsCode:"2.1", parentCode:"2",  title:"Construção do Cronograma",                  estimatedEffort:1,    isMilestone:true,  predecessorCodes:["1.5"], durationDays:2, order:8 },
      { id:"", templateId:"", wbsCode:"2.2", parentCode:"2",  title:"Validação do Cronograma - Stakeholders",    estimatedEffort:0.5,  isMilestone:false, predecessorCodes:["2.1"], durationDays:1, order:9 },
      { id:"", templateId:"", wbsCode:"2.3", parentCode:"2",  title:"Kick Off",                                  estimatedEffort:1,    isMilestone:true,  predecessorCodes:["2.2"], durationDays:1, order:10 },
      { id:"", templateId:"", wbsCode:"3",   parentCode:null, title:"3 - Execução",                              estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:11 },
      { id:"", templateId:"", wbsCode:"3.1", parentCode:"3",  title:"Reestruturar a Instrução de Trabalho",      estimatedEffort:null, isMilestone:false, predecessorCodes:["2.3"], durationDays:5, order:12 },
      { id:"", templateId:"", wbsCode:"3.2", parentCode:"3",  title:"Completar e Atualizar Matriz RACI",         estimatedEffort:null, isMilestone:false, predecessorCodes:["3.1"], durationDays:3, order:13 },
      { id:"", templateId:"", wbsCode:"3.3", parentCode:"3",  title:"Revalidação dos Formulários / SGQ",         estimatedEffort:null, isMilestone:false, predecessorCodes:["3.2"], durationDays:3, order:14 },
      { id:"", templateId:"", wbsCode:"4",   parentCode:null, title:"4 - Encerramento",                          estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:15 },
      { id:"", templateId:"", wbsCode:"4.1", parentCode:"4",  title:"Termo de Encerramento",                     estimatedEffort:null, isMilestone:true,  predecessorCodes:["3.3"], durationDays:1, order:16 },
      { id:"", templateId:"", wbsCode:"4.2", parentCode:"4",  title:"Assinatura do Termo de Encerramento",       estimatedEffort:null, isMilestone:false, predecessorCodes:["4.1"], durationDays:1, order:17 },
      { id:"", templateId:"", wbsCode:"4.3", parentCode:"4",  title:"Conclusão do Projeto",                      estimatedEffort:null, isMilestone:false, predecessorCodes:["4.2"], durationDays:1, order:18 },
    ],
  },
  {
    name: "Certificações",
    description: "Modelo para projetos de obtenção e manutenção de certificações (ISO, etc.)",
    projectType: "CERTIFICACAO",
    color: "#F59E0B",
    isBuiltIn: true,
    tasks: [
      { id:"", templateId:"", wbsCode:"1",    parentCode:null, title:"1 - Iniciação",                               estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:1 },
      { id:"", templateId:"", wbsCode:"1.1",  parentCode:"1",  title:"Solicitação Novo Projeto - Planner",           estimatedEffort:0.5,  isMilestone:false, predecessorCodes:[], durationDays:1, order:2 },
      { id:"", templateId:"", wbsCode:"1.2",  parentCode:"1",  title:"Agenda Go / No Go",                            estimatedEffort:0.5,  isMilestone:true,  predecessorCodes:["1.1"], durationDays:1, order:3 },
      { id:"", templateId:"", wbsCode:"1.3",  parentCode:"1",  title:"Termo de Abertura",                            estimatedEffort:0.1,  isMilestone:false, predecessorCodes:["1.2"], durationDays:1, order:4 },
      { id:"", templateId:"", wbsCode:"1.4",  parentCode:"1",  title:"Aprovação do Termo de Abertura",               estimatedEffort:0.1,  isMilestone:false, predecessorCodes:["1.3"], durationDays:1, order:5 },
      { id:"", templateId:"", wbsCode:"1.5",  parentCode:"1",  title:"Apresentação Técnica",                         estimatedEffort:0.5,  isMilestone:false, predecessorCodes:["1.4"], durationDays:1, order:6 },
      { id:"", templateId:"", wbsCode:"2",    parentCode:null, title:"2 - Planejamento",                             estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:7 },
      { id:"", templateId:"", wbsCode:"2.1",  parentCode:"2",  title:"Construção do Cronograma",                      estimatedEffort:1,    isMilestone:false, predecessorCodes:["1.5"], durationDays:2, order:8 },
      { id:"", templateId:"", wbsCode:"2.2",  parentCode:"2",  title:"Validação do Cronograma - Stakeholders",        estimatedEffort:0.5,  isMilestone:false, predecessorCodes:["2.1"], durationDays:1, order:9 },
      { id:"", templateId:"", wbsCode:"2.3",  parentCode:"2",  title:"Kick Off",                                      estimatedEffort:1,    isMilestone:true,  predecessorCodes:["2.2"], durationDays:1, order:10 },
      { id:"", templateId:"", wbsCode:"3",    parentCode:null, title:"3 - Execução",                                  estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:11 },
      { id:"", templateId:"", wbsCode:"3.1",  parentCode:"3",  title:"Avaliar Requisitos da Norma",                   estimatedEffort:null, isMilestone:false, predecessorCodes:["2.3"], durationDays:5, order:12 },
      { id:"", templateId:"", wbsCode:"3.2",  parentCode:"3",  title:"Orçamento Auditoria Interna e Externa",         estimatedEffort:null, isMilestone:false, predecessorCodes:["3.1"], durationDays:3, order:13 },
      { id:"", templateId:"", wbsCode:"3.3",  parentCode:"3",  title:"Aprovação do Orçamento - Diretoria",           estimatedEffort:null, isMilestone:false, predecessorCodes:["3.2"], durationDays:2, order:14 },
      { id:"", templateId:"", wbsCode:"3.4",  parentCode:"3",  title:"Estruturação dos Procedimentos",               estimatedEffort:null, isMilestone:false, predecessorCodes:["3.3"], durationDays:5, order:15 },
      { id:"", templateId:"", wbsCode:"3.5",  parentCode:"3",  title:"Estruturação de Formulários",                  estimatedEffort:null, isMilestone:false, predecessorCodes:["3.4"], durationDays:3, order:16 },
      { id:"", templateId:"", wbsCode:"3.6",  parentCode:"3",  title:"Treinamento - Liderança",                      estimatedEffort:null, isMilestone:false, predecessorCodes:["3.5"], durationDays:2, order:17 },
      { id:"", templateId:"", wbsCode:"3.7",  parentCode:"3",  title:"Treinamento - Operacional",                    estimatedEffort:null, isMilestone:false, predecessorCodes:["3.6"], durationDays:2, order:18 },
      { id:"", templateId:"", wbsCode:"3.8",  parentCode:"3",  title:"Treinamento - Auditoria",                      estimatedEffort:null, isMilestone:false, predecessorCodes:["3.7"], durationDays:1, order:19 },
      { id:"", templateId:"", wbsCode:"3.9",  parentCode:"3",  title:"Auditoria Interna",                            estimatedEffort:null, isMilestone:false, predecessorCodes:["3.8"], durationDays:3, order:20 },
      { id:"", templateId:"", wbsCode:"3.10", parentCode:"3",  title:"Revisão de NCs e Relatório",                   estimatedEffort:null, isMilestone:false, predecessorCodes:["3.9"], durationDays:5, order:21 },
      { id:"", templateId:"", wbsCode:"3.11", parentCode:"3",  title:"Auditoria Externa (Certificação)",             estimatedEffort:null, isMilestone:false, predecessorCodes:["3.10"], durationDays:3, order:22 },
      { id:"", templateId:"", wbsCode:"4",    parentCode:null, title:"4 - Encerramento",                             estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:23 },
      { id:"", templateId:"", wbsCode:"4.1",  parentCode:"4",  title:"Termo de Encerramento",                        estimatedEffort:null, isMilestone:true,  predecessorCodes:["3.11"], durationDays:1, order:24 },
      { id:"", templateId:"", wbsCode:"4.2",  parentCode:"4",  title:"Assinatura do Termo de Encerramento",          estimatedEffort:null, isMilestone:false, predecessorCodes:["4.1"], durationDays:1, order:25 },
      { id:"", templateId:"", wbsCode:"4.3",  parentCode:"4",  title:"Conclusão do Projeto",                         estimatedEffort:null, isMilestone:false, predecessorCodes:["4.2"], durationDays:1, order:26 },
    ],
  },
  {
    name: "Projeto Externo / Cliente",
    description: "Modelo para projetos com clientes externos — inclui etapas comerciais, piloto, RAMP UP e operação assistida",
    projectType: "EXTERNO",
    color: "#2463FF",
    isBuiltIn: true,
    tasks: [
      { id:"", templateId:"", wbsCode:"1",     parentCode:null,  title:"1 - Iniciação",                                                          estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:1 },
      { id:"", templateId:"", wbsCode:"1.1",   parentCode:"1",   title:"Solicitação Novo Projeto - Planner",                                      estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:2 },
      { id:"", templateId:"", wbsCode:"1.2",   parentCode:"1",   title:"Estudo de Viabilidade",                                                   estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:3 },
      { id:"", templateId:"", wbsCode:"1.2.1", parentCode:"1.2", title:"Entendimento da Solicitação",                                             estimatedEffort:null, isMilestone:false, predecessorCodes:["1.1"], durationDays:2, order:4 },
      { id:"", templateId:"", wbsCode:"1.2.2", parentCode:"1.2", title:"Visita Técnica",                                                          estimatedEffort:null, isMilestone:false, predecessorCodes:["1.2.1"], durationDays:1, order:5 },
      { id:"", templateId:"", wbsCode:"1.2.3", parentCode:"1.2", title:"Análise de Viabilidade - Técnica / Esforço / Financeira",                 estimatedEffort:null, isMilestone:false, predecessorCodes:["1.2.2"], durationDays:3, order:6 },
      { id:"", templateId:"", wbsCode:"1.2.4", parentCode:"1.2", title:"Apresentação do Estudo de Viabilidade - Interno",                         estimatedEffort:null, isMilestone:false, predecessorCodes:["1.2.3"], durationDays:1, order:7 },
      { id:"", templateId:"", wbsCode:"1.2.5", parentCode:"1.2", title:"Reunião de Go / No Go",                                                   estimatedEffort:null, isMilestone:true,  predecessorCodes:["1.2.4"], durationDays:1, order:8 },
      { id:"", templateId:"", wbsCode:"1.3",   parentCode:"1",   title:"Apresentação Técnica - Cliente",                                          estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:9 },
      { id:"", templateId:"", wbsCode:"1.3.1", parentCode:"1.3", title:"Agenda de Apresentação Técnica",                                          estimatedEffort:null, isMilestone:false, predecessorCodes:["1.2.5"], durationDays:1, order:10 },
      { id:"", templateId:"", wbsCode:"1.3.2", parentCode:"1.3", title:"Revisão da Proposta Técnica",                                             estimatedEffort:null, isMilestone:false, predecessorCodes:["1.3.1"], durationDays:2, order:11 },
      { id:"", templateId:"", wbsCode:"1.3.3", parentCode:"1.3", title:"Aprovação da Proposta Técnica e Viabilidade",                             estimatedEffort:null, isMilestone:false, predecessorCodes:["1.3.2"], durationDays:1, order:12 },
      { id:"", templateId:"", wbsCode:"1.4",   parentCode:"1",   title:"Apresentação Comercial - Cliente",                                        estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:13 },
      { id:"", templateId:"", wbsCode:"1.4.1", parentCode:"1.4", title:"Elaboração da Proposta Comercial",                                        estimatedEffort:null, isMilestone:false, predecessorCodes:["1.3.3"], durationDays:3, order:14 },
      { id:"", templateId:"", wbsCode:"1.4.2", parentCode:"1.4", title:"Aprovação da Proposta Comercial",                                         estimatedEffort:null, isMilestone:false, predecessorCodes:["1.4.1"], durationDays:2, order:15 },
      { id:"", templateId:"", wbsCode:"1.4.3", parentCode:"1.4", title:"Assinatura do Contrato - PO",                                             estimatedEffort:null, isMilestone:false, predecessorCodes:["1.4.2"], durationDays:1, order:16 },
      { id:"", templateId:"", wbsCode:"1.5",   parentCode:"1",   title:"Termo de Abertura",                                                       estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:17 },
      { id:"", templateId:"", wbsCode:"1.5.1", parentCode:"1.5", title:"Envio do Termo de Abertura",                                              estimatedEffort:null, isMilestone:false, predecessorCodes:["1.4.3"], durationDays:1, order:18 },
      { id:"", templateId:"", wbsCode:"1.5.2", parentCode:"1.5", title:"Assinatura do Termo de Abertura",                                         estimatedEffort:null, isMilestone:false, predecessorCodes:["1.5.1"], durationDays:1, order:19 },
      { id:"", templateId:"", wbsCode:"2",     parentCode:null,  title:"2 - Planejamento",                                                        estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:20 },
      { id:"", templateId:"", wbsCode:"2.1",   parentCode:"2",   title:"Construção do Cronograma",                                                 estimatedEffort:null, isMilestone:false, predecessorCodes:["1.5.2"], durationDays:2, order:21 },
      { id:"", templateId:"", wbsCode:"2.2",   parentCode:"2",   title:"Validação do Cronograma - Stakeholders",                                   estimatedEffort:null, isMilestone:false, predecessorCodes:["2.1"], durationDays:1, order:22 },
      { id:"", templateId:"", wbsCode:"2.3",   parentCode:"2",   title:"Kick Off - Interno",                                                      estimatedEffort:null, isMilestone:true,  predecessorCodes:["2.2"], durationDays:1, order:23 },
      { id:"", templateId:"", wbsCode:"2.4",   parentCode:"2",   title:"Kick Off - Externo",                                                      estimatedEffort:null, isMilestone:true,  predecessorCodes:["2.3"], durationDays:1, order:24 },
      { id:"", templateId:"", wbsCode:"3",     parentCode:null,  title:"3 - Execução",                                                            estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:25 },
      { id:"", templateId:"", wbsCode:"3.1",   parentCode:"3",   title:"Projeto Piloto",                                                          estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:26 },
      { id:"", templateId:"", wbsCode:"3.1.1", parentCode:"3.1", title:"Acompanhar o Piloto (90 dias)",                                           estimatedEffort:null, isMilestone:false, predecessorCodes:["2.4"], durationDays:90, order:27 },
      { id:"", templateId:"", wbsCode:"3.2",   parentCode:"3",   title:"Revisão da Sprint (Piloto)",                                              estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:28 },
      { id:"", templateId:"", wbsCode:"3.2.1", parentCode:"3.2", title:"Agenda para Revisão da Sprint (Piloto)",                                  estimatedEffort:null, isMilestone:false, predecessorCodes:["3.1.1"], durationDays:1, order:29 },
      { id:"", templateId:"", wbsCode:"3.2.2", parentCode:"3.2", title:"Adequação do Processo",                                                   estimatedEffort:null, isMilestone:false, predecessorCodes:["3.2.1"], durationDays:5, order:30 },
      { id:"", templateId:"", wbsCode:"3.2.3", parentCode:"3.2", title:"Elaboração do Plano de RAMP UP",                                         estimatedEffort:null, isMilestone:false, predecessorCodes:["3.2.2"], durationDays:3, order:31 },
      { id:"", templateId:"", wbsCode:"3.2.4", parentCode:"3.2", title:"Desenvolvimento do Planejamento das Rotas Semanais",                      estimatedEffort:null, isMilestone:false, predecessorCodes:["3.2.3"], durationDays:5, order:32 },
      { id:"", templateId:"", wbsCode:"3.2.5", parentCode:"3.2", title:"Ajuste de Contrato e Cobrança - Fornecedores",                            estimatedEffort:null, isMilestone:false, predecessorCodes:["3.2.4"], durationDays:3, order:33 },
      { id:"", templateId:"", wbsCode:"3.2.6", parentCode:"3.2", title:"Aprovação para Entrada na RAMP UP",                                      estimatedEffort:null, isMilestone:true,  predecessorCodes:["3.2.5"], durationDays:1, order:34 },
      { id:"", templateId:"", wbsCode:"3.3",   parentCode:"3",   title:"Entrada em Operação (RAMP UP)",                                           estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:35 },
      { id:"", templateId:"", wbsCode:"3.3.1", parentCode:"3.3", title:"Início do Processo (RAMP UP)",                                            estimatedEffort:null, isMilestone:false, predecessorCodes:["3.2.6"], durationDays:30, order:36 },
      { id:"", templateId:"", wbsCode:"3.3.2", parentCode:"3.3", title:"Operação Assistida",                                                      estimatedEffort:null, isMilestone:false, predecessorCodes:["3.3.1"], durationDays:14, order:37 },
      { id:"", templateId:"", wbsCode:"4",     parentCode:null,  title:"4 - Encerramento do Projeto",                                             estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:38 },
      { id:"", templateId:"", wbsCode:"4.1",   parentCode:"4",   title:"Reunião de Encerramento do Projeto",                                      estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:39 },
      { id:"", templateId:"", wbsCode:"4.1.1", parentCode:"4.1", title:"Apresentação dos Resultados e Indicadores",                               estimatedEffort:null, isMilestone:false, predecessorCodes:["3.3.2"], durationDays:1, order:40 },
      { id:"", templateId:"", wbsCode:"4.1.2", parentCode:"4.1", title:"Passagem de Bastão - Time de Projeto x Time de Sustentação",              estimatedEffort:null, isMilestone:false, predecessorCodes:["4.1.1"], durationDays:1, order:41 },
      { id:"", templateId:"", wbsCode:"4.2",   parentCode:"4",   title:"Termo de Encerramento",                                                   estimatedEffort:null, isMilestone:false, predecessorCodes:[], durationDays:1, order:42 },
      { id:"", templateId:"", wbsCode:"4.2.1", parentCode:"4.2", title:"Envio do Termo de Encerramento",                                          estimatedEffort:null, isMilestone:false, predecessorCodes:["4.1.2"], durationDays:1, order:43 },
      { id:"", templateId:"", wbsCode:"4.2.2", parentCode:"4.2", title:"Aprovação do Termo",                                                     estimatedEffort:null, isMilestone:false, predecessorCodes:["4.2.1"], durationDays:1, order:44 },
      { id:"", templateId:"", wbsCode:"4.2.3", parentCode:"4.2", title:"Conclusão do Projeto",                                                    estimatedEffort:null, isMilestone:false, predecessorCodes:["4.2.2"], durationDays:1, order:45 },
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serializeTemplate(t: {
  id: string; name: string; description: string | null; projectType: string
  color: string | null; isBuiltIn: boolean; createdById: string; createdAt: Date
  tasks: {
    id: string; templateId: string; wbsCode: string; parentCode: string | null
    title: string; estimatedEffort: number | null; isMilestone: boolean
    predecessorCodes: string | null; durationDays: number; order: number
  }[]
}): Template {
  return {
    id: t.id, name: t.name, description: t.description, projectType: t.projectType,
    color: t.color, isBuiltIn: t.isBuiltIn, createdById: t.createdById,
    createdAt: t.createdAt.toISOString(),
    tasks: t.tasks.map((tk) => ({
      id: tk.id, templateId: tk.templateId, wbsCode: tk.wbsCode, parentCode: tk.parentCode,
      title: tk.title, estimatedEffort: tk.estimatedEffort, isMilestone: tk.isMilestone,
      predecessorCodes: tk.predecessorCodes ? (JSON.parse(tk.predecessorCodes) as string[]) : [],
      durationDays: tk.durationDays, order: tk.order,
    })),
  }
}

// ─── Seed (called once on first page load) ────────────────────────────────────

export async function seedDefaultTemplates() {
  const session = await auth()
  if (!session?.user?.id) return

  const existing = await db.scheduleTemplate.count({ where: { isBuiltIn: true } })
  if (existing >= 4) return

  for (const tpl of DEFAULT_TEMPLATES) {
    const created = await db.scheduleTemplate.create({
      data: {
        name:        tpl.name,
        description: tpl.description,
        projectType: tpl.projectType,
        color:       tpl.color,
        isBuiltIn:   true,
        createdById: session.user.id,
        tasks: {
          create: tpl.tasks.map((tk) => ({
            wbsCode:          tk.wbsCode,
            parentCode:       tk.parentCode,
            title:            tk.title,
            estimatedEffort:  tk.estimatedEffort,
            isMilestone:      tk.isMilestone,
            predecessorCodes: tk.predecessorCodes.length > 0 ? JSON.stringify(tk.predecessorCodes) : null,
            durationDays:     tk.durationDays,
            order:            tk.order,
          })),
        },
      },
    })
    console.log("Seeded template:", created.name)
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getTemplates(): Promise<Template[]> {
  const templates = await db.scheduleTemplate.findMany({
    include: { tasks: { orderBy: { order: "asc" } } },
    orderBy: [{ isBuiltIn: "desc" }, { createdAt: "asc" }],
  })
  return templates.map(serializeTemplate)
}

export async function getTemplate(id: string): Promise<Template | null> {
  const t = await db.scheduleTemplate.findUnique({
    where: { id },
    include: { tasks: { orderBy: { order: "asc" } } },
  })
  return t ? serializeTemplate(t) : null
}

// ─── Create / Update / Delete ─────────────────────────────────────────────────

export async function createTemplate(data: {
  name: string; description?: string; projectType: string; color?: string
}): Promise<Template> {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Não autenticado")

  const t = await db.scheduleTemplate.create({
    data: {
      name:        data.name,
      description: data.description ?? null,
      projectType: data.projectType,
      color:       data.color ?? "#7B2FBE",
      isBuiltIn:   false,
      createdById: session.user.id,
    },
    include: { tasks: { orderBy: { order: "asc" } } },
  })
  revalidatePath("/templates")
  return serializeTemplate(t)
}

export async function updateTemplate(id: string, data: {
  name?: string; description?: string; projectType?: string; color?: string
}): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Não autenticado")

  await db.scheduleTemplate.update({ where: { id }, data })
  revalidatePath("/templates")
}

export async function deleteTemplate(id: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Não autenticado")

  await db.scheduleTemplate.delete({ where: { id } })
  revalidatePath("/templates")
}

// ─── Template Tasks ───────────────────────────────────────────────────────────

export async function addTemplateTask(templateId: string, data: {
  wbsCode: string; parentCode?: string | null; title: string
  estimatedEffort?: number | null; isMilestone?: boolean
  predecessorCodes?: string[]; durationDays?: number
}): Promise<TemplateTask> {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Não autenticado")

  const count = await db.scheduleTemplateTask.count({ where: { templateId } })
  const t = await db.scheduleTemplateTask.create({
    data: {
      templateId,
      wbsCode:          data.wbsCode,
      parentCode:       data.parentCode ?? null,
      title:            data.title,
      estimatedEffort:  data.estimatedEffort ?? null,
      isMilestone:      data.isMilestone ?? false,
      predecessorCodes: data.predecessorCodes?.length ? JSON.stringify(data.predecessorCodes) : null,
      durationDays:     data.durationDays ?? 1,
      order:            count + 1,
    },
  })
  revalidatePath("/templates")
  return {
    id: t.id, templateId: t.templateId, wbsCode: t.wbsCode, parentCode: t.parentCode,
    title: t.title, estimatedEffort: t.estimatedEffort, isMilestone: t.isMilestone,
    predecessorCodes: t.predecessorCodes ? JSON.parse(t.predecessorCodes) : [],
    durationDays: t.durationDays, order: t.order,
  }
}

export async function updateTemplateTask(id: string, data: {
  title?: string; estimatedEffort?: number | null; isMilestone?: boolean
  predecessorCodes?: string[]; durationDays?: number; wbsCode?: string; parentCode?: string | null
}): Promise<void> {
  await db.scheduleTemplateTask.update({
    where: { id },
    data: {
      ...data,
      predecessorCodes: data.predecessorCodes !== undefined
        ? (data.predecessorCodes.length ? JSON.stringify(data.predecessorCodes) : null)
        : undefined,
    },
  })
  revalidatePath("/templates")
}

export async function deleteTemplateTask(id: string): Promise<void> {
  await db.scheduleTemplateTask.delete({ where: { id } })
  revalidatePath("/templates")
}

// ─── Apply template to project ────────────────────────────────────────────────

export async function applyTemplate(projectId: string, templateId: string, startDate: Date): Promise<{ count: number }> {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Não autenticado")

  const template = await db.scheduleTemplate.findUnique({
    where: { id: templateId },
    include: { tasks: { orderBy: { order: "asc" } } },
  })
  if (!template) throw new Error("Modelo não encontrado")

  const tasks = template.tasks
  const allCodes = new Set(tasks.map((t) => t.wbsCode))
  const parentCodes = new Set(tasks.map((t) => t.parentCode).filter(Boolean) as string[])
  const leafTasks = tasks.filter((t) => !parentCodes.has(t.wbsCode))

  // ── Calculate dates for leaf tasks using FS predecessor rule ─────
  const leafByCode = new Map(leafTasks.map((t) => [t.wbsCode, t]))
  const computed = new Map<string, { start: Date; end: Date }>()
  const visiting = new Set<string>()

  function calcDate(code: string): { start: Date; end: Date } {
    if (computed.has(code)) return computed.get(code)!
    if (visiting.has(code)) return { start: startDate, end: startDate }
    visiting.add(code)

    const task = leafByCode.get(code)
    if (!task) return { start: startDate, end: startDate }

    const preds: string[] = task.predecessorCodes ? (JSON.parse(task.predecessorCodes) as string[]) : []
    const validPreds = preds.filter((p) => allCodes.has(p))

    let taskStart = startDate
    if (validPreds.length > 0) {
      const predDates = validPreds.map((p) => calcDate(p))
      const maxEnd = predDates.reduce((a, b) => (a.end > b.end ? a : b)).end
      taskStart = addDays(maxEnd, 1)
    }

    const taskEnd = addDays(taskStart, Math.max(0, task.durationDays - 1))
    const result = { start: taskStart, end: taskEnd }
    computed.set(code, result)
    return result
  }

  for (const t of leafTasks) calcDate(t.wbsCode)

  // ── Create tasks in order (parents first) ────────────────────────
  const codeToId = new Map<string, string>()

  for (const task of tasks) {
    const dates = computed.get(task.wbsCode)
    const parentId = task.parentCode ? (codeToId.get(task.parentCode) ?? null) : null

    const created = await db.scheduleTask.create({
      data: {
        projectId,
        parentId,
        title:           task.title,
        estimatedEffort: task.estimatedEffort,
        startDate:       dates?.start ?? null,
        endDate:         dates?.end   ?? null,
        status:          "PLANNING",
        progress:        0,
        order:           task.order,
      },
    })
    codeToId.set(task.wbsCode, created.id)
  }

  // Set dependencies (by mapping wbsCode predecessors to task IDs)
  for (const task of leafTasks) {
    const taskId = codeToId.get(task.wbsCode)
    if (!taskId) continue
    const preds: string[] = task.predecessorCodes ? JSON.parse(task.predecessorCodes) : []
    const depIds = preds.map((p) => codeToId.get(p)).filter(Boolean) as string[]
    if (depIds.length > 0) {
      await db.scheduleTask.update({
        where: { id: taskId },
        data: { dependencies: JSON.stringify(depIds) },
      })
    }
  }

  revalidatePath(`/projects/${projectId}/schedule`)
  return { count: tasks.length }
}
