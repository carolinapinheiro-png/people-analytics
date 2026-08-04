# InHire — regras de negócio dos dashboards

Fonte: aba **Diretrizes** dos dashboards do InHire (`flutterbrazil.inhire.app/data`),
repassada pelo time de Talent Acquisition.

Este documento existe por um motivo específico: a API do InHire devolve **entidades
cruas** (vagas, posições, candidaturas), não os KPIs. Qualquer indicador de
recrutamento no nosso dashboard é **calculado por nós**. Se as definições abaixo não
forem seguidas à risca, teremos dois painéis mostrando TTHs diferentes para o mesmo
mês — e ninguém saberá qual está certo. Estas regras são o contrato.

## 1. Hierarquia de entidades

| Entidade | O que é |
|---|---|
| **Requisição** | Solicitação formal de abertura. Representa a aprovação (ou não) de uma ou mais posições. |
| **Posição** | Unidade efetiva de contratação — a cadeira que a pessoa vai ocupar. **É a unidade de contagem.** |
| **Vaga** | Guarda-chuva que concentra as posições associadas e o escopo do processo seletivo. |

Consequência prática: "quantas vagas abrimos" quase sempre significa **quantas
posições**, não quantos registros de vaga. Contar vaga em vez de posição subconta.

## 2. Governança de exibição

- Entram na análise **tanto** posições vinculadas a requisições aprovadas **quanto**
  posições criadas manualmente. Não filtrar por origem.
- Posições **arquivadas são excluídas** automaticamente. Todo cálculo precisa aplicar
  esse filtro — esquecer disso infla contagem e distorce SLA.

## 3. Tempos (TTF, TTH e derivados)

- Contados em **dias corridos** (não dias úteis).
- **Descontam os períodos de inatividade**: dias em que a posição esteve **cancelada
  ou congelada** não contam. O SLA reflete só o tempo de trabalho ativo do time de
  Recrutamento.

> **Risco técnico conhecido.** Para descontar inatividade é preciso o **histórico de
> status da posição com data de entrada e saída de cada estado** — o status atual não
> basta. Se a API não expuser esse histórico, nosso TTH ficará sistematicamente MAIOR
> que o do InHire (por incluir os períodos congelados). Antes de publicar qualquer
> número de tempo, confirmar que essa série existe; se não existir, o indicador deve
> ser rotulado como "sem desconto de inatividade" em vez de fingir equivalência.

## 4. Leitura de gráficos e tabelas

| Rótulo | Significado |
|---|---|
| **"Vazio"** | O campo não foi preenchido na vaga, posição ou requisição. É lacuna de cadastro, não zero. |
| **"No Data"** | Não há dados para os filtros aplicados. |
| **"Other"** | Agrupamento automático de valores pouco representativos, para leitura. |

"Vazio" merece atenção: é o equivalente ao nosso "SEM DEPTO" — mede qualidade de
cadastro e deve aparecer, não ser escondido.

## 5. Atualização e filtros

- Dashboards do InHire são **tempo real com atraso de até 5 minutos**.
- Cada aba tem filtros independentes; dentro da aba, o filtro é global.

Consequência para nós: como sincronizamos para o Supabase, nosso painel **não** é
tempo real — é a foto da última sincronização. O carimbo de "atualizado em" precisa
estar visível na tela, senão alguém compara os dois painéis num intervalo de
sincronização e acha que há erro.

## Fontes de dados de TA (contexto)

| # | Fonte | Plataforma | Automatizável? |
|---|---|---|---|
| 1 | Qualidade da Contratação (gestor, 60 dias após D1) | Appsmith | **Não hoje** — dado está num banco atrás do app; exige identificar a fonte com quem construiu, ou CSV. |
| 2 | Satisfação de TA (gestor contratante) | Google Forms | Sim — Sheets API ou CSV publicado. |
| 3 | Pesquisa do Candidato (V2.1–V2.4) | InHire Pesquisas | Sim — mesma API. V1.1 e V1.2 estão inativas e **não devem entrar**. |
| 4 | Dados Gerais de Recrutamento (funil) | InHire Dados | Sim — mesma API. |

A fonte 1 é a mais valiosa (é a única que mede se a contratação **deu certo**, e é o
que permite cruzar com atrição precoce) e a única sem caminho automático. Vale
priorizar a descoberta do banco por trás do Appsmith.

## Acesso técnico à API

- Service account: Configurações → Usuários de API → Adicionar Usuário (owner, plano Advanced).
- `POST https://auth.inhire.app/login` → `accessToken` (1 h) + `refreshToken` (30 d).
- Demais chamadas em `https://api.inhire.app`, com headers `Authorization` e
  `X-Tenant: flutterbrazil`.
- Candidaturas e posições são paginadas **por vaga** — varrer tudo é N+1. Existe
  **webhook**: carga inicial completa uma vez, depois incremental por evento.
- Credenciais vivem em variável de ambiente. Nunca no repositório, nunca em chat.
