# Diagnóstico: lógica de cálculo do template Excel (GES Project Report) vs. Kronex

Documento de análise, sem nenhuma alteração de código. Objetivo: entender como o template `Template - GES Project report V1 2.xlsx` calcula progresso, baseline e datas, e comparar com o que o Kronex já faz hoje (após os ajustes de `computeProjectProgress` e `computeExpectedPct` desta mesma sessão), para decidir o que vale adotar.

## 1. Arquitetura da planilha

Abas, na ordem de uso recomendada pelo próprio arquivo (aba "Orientações (PT)"):

```
Home  →  Canva  →  Baseline  →  Schedule  →  Status Report
                                    ↑
                              Auxiliar (oculta, não editar)
```

- **Home / Canva**: dados de intake do projeto (nome, liderança, iniciativa) — equivalente grosseiro ao cadastro de projeto no Kronex.
- **Baseline**: o plano **aprovado**. Datas de início/término planejadas (`P`/`Q`) e nomes de entregáveis/tarefas são digitados **aqui**, uma única vez, e depois a aba deve ser bloqueada/protegida por senha após aprovação do sponsor. É a fonte da verdade das datas planejadas.
- **Schedule**: aba operacional de acompanhamento mensal. Os campos `M` (nome), `O` (responsável), `P`/`Q` (início/término planejado) são **100% fórmulas** do tipo `=Baseline!P12` — ou seja, o Schedule não tem data própria, ele só espelha o Baseline. O único dado manual mensal em Schedule é a coluna `S` ("Completion Progress") por tarefa, mais a seleção do `N2` ("Report Date").
- **Status Report**: resumo executivo, quase tudo puxado de `Schedule` (progresso) e `Baseline` (nomes/datas), com exceção do Capex, que é manual.

Isso já é uma diferença estrutural importante em relação ao Kronex: no template, **existe uma separação física entre "plano aprovado" (Baseline) e "acompanhamento" (Schedule)** — no Kronex hoje só existe o cronograma vivo (`ScheduleV2Item`), e a entidade `ProjectBaseline`/"Linha de Base" existe no schema mas está subutilizada pelas telas de progresso.

## 2. Como o template calcula progresso

### 2.1 Nível tarefa (linha-folha)

Cada linha-folha tem estas colunas-chave (ex.: linha 13, tarefa "Envio do Link de Pesquisa"):

| Coluna | Fórmula | Significado |
|---|---|---|
| `J` | `=$N$2-P13` | dias decorridos desde o início planejado até o "Report Date" (pode ser negativo, se ainda não começou) |
| `K` | `=Q13-P13` | duração planejada total, em dias |
| `I` (Estimated completion %) | `=IF(K13>0, clamp(J13/K13, 0, 1), 0)` | **% esperado** — elapsed/total, limitado entre 0% e 100% |
| `R` (Completion Target) | `=I13` | apenas replica `I` |
| `S` (Completion Progress) | valor digitado manualmente | **% real** |
| `H` (Target vs Progress) | `=S13-R13` | variância = real − esperado |
| `T` (Status) | `On track` / `Delayed` / `At risk` conforme `H` | classificação de status |

A fórmula de `I` é, na essência, **exatamente a mesma ideia** do nosso `computeExpectedPct` (`lib/utils/schedule-status.ts`): `elapsed/total`, limitado a `[0,1]`. A diferença não está na fórmula, está em **qual "hoje" se usa** (ver §4).

**Achado relevante**: para linhas-folha, a fórmula tem a guarda `IF(K13>0, ..., 0)`. Ou seja, se a tarefa tem duração zero (início == término, um marco de 1 dia "achatado"), o template **sempre retorna 0% esperado**, não importa a data. Isso é pior do que a correção que já fizemos no Kronex nesta sessão (`totalDays === 0` → função degrau 0%/100% conforme a data do marco já passou ou não) — vale como confirmação de que a nossa correção está certa, não como algo a copiar.

### 2.2 Nível entregável / "atividade mãe" (linha de grupo)

Ex.: linha 12, "Maturity Map" (soma das linhas 13-17):

- `R12 = AVERAGE(R13:R17)` — média **simples**, não ponderada, do "esperado" das tarefas-filhas.
- `S12 = AVERAGE(S13:S17)` — média simples do "real".
- `P12 = MIN(P13:P17)`, `Q12 = MAX(Q13:Q17)` — datas do grupo por min/max dos filhos (igual à regra 7 do nosso CLAUDE.md de domínio, aliás).

Isso confirma um ponto: **o template pondera por número de tarefas, não por duração.** Uma tarefa de 1 dia e uma tarefa de 18 dias contam igual dentro do mesmo entregável. É exatamente o viés de mascaramento que o comentário do nosso próprio `project-progress.ts` já identificava e que motivou a mudança desta sessão para ponderação por duração — então aqui o Kronex (pós-fix) já está estruturalmente **melhor** que a referência do Excel.

### 2.3 Nível projeto

- `N7` (Planned) `= AVERAGE(R12, R18, R30, R72)` — média simples dos **4 entregáveis de topo** (não de todas as tarefas-folha, e não ponderada por tamanho de cada entregável).
- `N8` (Actual) `= AVERAGE(S12, S18, S30, S72)`.
- `N9` (Variation) `= N8 - N7`.
- `O7` (Status do projeto) `= IF(N9>=0,"On track", IF(N9<-0.1,"At risk","Delayed"))`.

Ou seja: dois níveis de média simples empilhados (folha→entregável, entregável→projeto), nenhum dos dois ponderado. Um entregável com 2 tarefas pesa igual a um com 40 (o entregável 3, linha 30, agrega as linhas 31-71 — quarenta e uma tarefas — e conta como 1/4 do projeto, igual ao entregável 1 que tem 5 tarefas).

**Achado extra (bug no próprio template)**: a fórmula de status no nível de **grupo/projeto** tem os rótulos trocados em relação ao nível de tarefa:

- Linha-folha (ex. `T13`): `IF(H<0 → "On track"?não... IF(H<-0.1,"Delayed","At risk"))` — variância grande e negativa (< -10 p.p.) = **"Delayed"**, variância pequena = "At risk". Lógica correta (severidade crescente).
- Grupo e projeto (`T12`, `O7`): `IF(H<-0.1,"At risk","Delayed")` — **os mesmos dois rótulos invertidos**: variância grande e negativa vira "At risk" (deveria ser o caso mais grave) e variância pequena vira "Delayed". Isso é um bug de cópia/colagem dentro do próprio template — nada que devêssemos reproduzir. É um bom lembrete do valor de ter uma função única (`computeScheduleStatus`) usada em todo lugar no Kronex, em vez de fórmula duplicada célula a célula: erro deste tipo não pode acontecer "em um lugar só" no nosso sistema.

O limiar de 10 pontos percentuais para separar "At risk" de "Delayed", aliás, é o mesmo valor (`riskThresholdPct = 10`) que já usamos por padrão em `computeScheduleStatus` — coincidência que reforça que o threshold atual é razoável.

## 3. Baseline vs Schedule — quem manda no quê

- **Datas planejadas** (`P`/`Q`, início/término): **Baseline manda**. Schedule só lê (`=Baseline!P12`). Uma vez aprovado, a aba Baseline é travada/protegida — mudar o plano exige um processo consciente (reabrir, editar, re-bloquear), não uma edição casual.
- **Progresso real** (`S`, Completion Progress): só existe em **Schedule**, mensal, manual, por tarefa.
- **"Esperado"** (`I`/`R`): calculado em **Schedule**, usando as datas herdadas do Baseline + o `Report Date` (`N2`) do Schedule.
- Curiosidade: a aba **Baseline também tem** as mesmas colunas `I`/`J`/`K`/`R`/`S`/`T` que o Schedule, com a mesma lógica de fórmula — e também tem seu próprio `N2` (Report Date), hoje com o mesmo valor `27/04/2026` do Schedule. Tudo indica que Baseline foi construída como uma cópia da estrutura do Schedule (antes de travar as datas) e esses campos de progresso ali dentro ficaram como resíduo, não usados por mais nada (nem o Status Report lê `R`/`S`/`T` do Baseline, só `P`/`Q`/`M`/`N`/`O`). **Não é uma segunda fonte de verdade viva, é sobra de estrutura.**

## 4. O mecanismo do "Report Date" (célula `N2`)

Ponto central da dúvida original: `N2` **não é uma fórmula `=HOJE()`/`=TODAY()`** — é um valor de data **digitado manualmente**, hoje `27/04/2026`. É esse valor que cascade por toda a aba: `J = N2 - P` (tarefa) → `I` (% esperado) → `R`/`S` (rollup) → `H` (variância) → `T`/`O` (status) → Status Report inteiro.

Isso bate com o que a aba "Orientações (PT)" descreve como processo mensal: a analista **escolhe** o Report Date do mês de referência e recalcula tudo a partir dali — não é o relógio do sistema, é um "as-of" controlado por quem preenche o relatório. Isso permite, por exemplo, fechar o relatório de um mês mesmo preenchendo com atraso, ou reabrir uma data passada para auditoria, sem que o "hoje real" contamine o cálculo.

**Ponto de atenção**: `N2` existe duplicado em Baseline e Schedule, sem link entre as duas células — teoricamente dá pra desincronizar (alguém muda um e esquece o outro). Como vimos no §3, isso não chega a importar na prática porque só o `N2` do Schedule é realmente consumido a jusante — mas é uma fragilidade de planilha (dependência de disciplina humana) que uma tabela normalizada no Postgres não teria.

**Kronex hoje**: `computeExpectedPct`/`computeScheduleCascade` usam `today = new Date()` (relógio real do servidor) em todo lugar. Não existe hoje no Kronex um "Report Date" selecionável — o "esperado" é sempre calculado em relação ao dia real, sempre.

## 5. A tensão metodológica central (decisão em aberto, não código)

Duas perguntas do usuário — "ainda estou com dúvida sobre o baseline" e "de como é tudo calculado" — convergem numa única questão de produto:

**O "% esperado" deve ser calculado a partir de uma baseline congelada e aprovada, ou a partir do cronograma vivo (que pode ter sido replanejado)?**

- **Modo Excel (baseline congelada)**: `% esperado` de uma tarefa é sempre em relação às datas do plano ORIGINAL aprovado. Se o cronograma real escorregou (replanejou-se uma tarefa para depois), o "esperado" continua ancorado no compromisso original — isso é o que permite dizer "estamos X% atrás do que prometemos", e é o padrão clássico de EVM/PMBOK (baseline como referência de desvio).
- **Modo Kronex atual (cronograma vivo)**: as correções feitas nesta mesma sessão (`scheduleDates`, `effectivePlannedStart/End`) foram desenhadas para resolver o problema oposto — projetos cujo `Project.expectedStart/expectedEnd` (uma estimativa de intake, de quando o projeto foi só solicitado, antes de ter cronograma detalhado) ficava velho e travava "Esperado" em 100%/atrasado para sempre. A solução adotada foi: usar as datas do **cronograma atual** (min início / max término das tarefas de hoje) em vez da estimativa de intake congelada.

Essas duas soluções não são a mesma coisa, e o Kronex hoje **mistura os dois conceitos sem nomear a diferença**:

- Achamos e corrigimos o bug de "estimativa de intake desatualizada" (bom, precisava ser corrigido de qualquer forma — aquele campo nunca foi uma baseline de verdade, era só um placeholder da fase de solicitação).
- Mas isso não resolve — e não deveria ser confundido com — a pergunta "se eu troquei o cronograma no meio do projeto, o % esperado deve continuar cobrando a data prometida original, ou a data replanejada?" Hoje o Kronex responde sempre "a replanejada", porque não existe nenhum congelamento formal do cronograma para comparação — `ProjectBaseline` existe no schema, mas nenhuma tela usa ela para calcular `computeExpectedPct`.

Isso não é um bug a corrigir — é uma decisão de produto que precisa ser tomada conscientemente, porque muda o significado do número "% esperado" no sistema inteiro. Duas opções, sem viés de qual é "certa":

1. **Manter como está** (esperado = função do cronograma vivo): mais simples, sempre reflete o compromisso atual, mas "perdoa" replanejamentos silenciosamente — um projeto que empurrou tudo para trás nunca aparece como "atrasado em relação ao que foi prometido no início", só em relação ao que foi prometido agora.
2. **Ativar a `ProjectBaseline`** como o Excel faz: ao aprovar o cronograma (ex., no Kickoff ou Go/No-Go), tirar um "snapshot" congelado das datas planejadas de cada tarefa; `% esperado` e "atraso" passam a ser calculados contra esse snapshot, não contra o cronograma vivo; replanejamentos ficam visíveis como "baseline vs. atual" (a própria feature de EVM que já existe parcialmente no projeto, à luz do `plannedValue`/EVM mencionado no código). Isso é mais fiel ao PMBOK e ao que o template Excel faz, mas exige decidir: quando a baseline é tirada, se pode ser re-baselineada, e quem aprova.

Recomendo decidir isso antes de investir mais tempo em ajustes finos de "% esperado" — do contrário corremos o risco de continuar corrigindo sintomas (como fizemos com PAUTA DISTRIBUIDORA-CD1) de uma pergunta de fundo ainda não respondida.

## 6. Resumo comparativo

| Aspecto | Template Excel | Kronex (hoje, pós-fix desta sessão) |
|---|---|---|
| Fórmula de % esperado (tarefa) | elapsed/total, clamp 0-100% | igual (`computeExpectedPct`), + tratamento explícito de marco (duração 0) que o Excel não tem |
| Rollup entregável → tarefa | média simples (não ponderada) | ponderado por duração (`taskWeight`) — melhor |
| Rollup projeto → entregável | média simples de só 4 entregáveis de topo | achatado direto a nível de tarefa-folha, ponderado — melhor |
| "Hoje" de referência | `Report Date` manual, por mês, em célula (`N2`) | relógio real do servidor, sempre — sem seleção manual |
| Baseline | aba própria, travada após aprovação, fonte única das datas planejadas | `ProjectBaseline` existe no schema, mas não alimenta o cálculo de esperado/atraso hoje |
| Consistência da fórmula de status | duplicada célula a célula — e **tem bug** (rótulos invertidos em grupo/projeto) | uma função única (`computeScheduleStatus`) — imune a esse tipo de bug |

## 7. O que vale considerar adotar (opções, não decisão)

1. **Seletor de "Report Date" por Status Report** — permitir fechar um status report "como se fosse" uma data passada (ex.: reabrir o relatório de fim de mês mesmo preenchendo com atraso), em vez de sempre usar `new Date()`. Baixo risco, funcionalidade nova e isolada — não mexe no cálculo padrão do dia a dia, só oferece essa opção quando gerando/revisando um Status Report específico.
2. **Decidir a questão do §5** (baseline congelada vs. cronograma vivo) — a mais importante, porque baliza qualquer trabalho futuro no motor de "esperado"/atraso. Se optar por ativar a baseline, o `ProjectBaseline` já existente no schema é o lugar certo para guardar o snapshot; precisaria de: (a) uma ação de "congelar baseline" (provavelmente no Kickoff ou Go/No-Go), (b) `computeExpectedPct` passando a aceitar datas de baseline como parâmetro alternativo às datas vivas, (c) UI mostrando as duas linhas (planejado-baseline vs. atual) lado a lado — que é exatamente o que a Curva S already tenta fazer, mas hoje comparando "esperado" com base no cronograma vivo, não numa baseline congelada.
3. Nada a "consertar" no rollup de ponderação — o Kronex já está mais correto que a planilha de referência aqui; não recomendo regredir para média simples só por paridade com o Excel.

Nenhuma dessas três opções foi implementada — este documento é só a análise solicitada.
