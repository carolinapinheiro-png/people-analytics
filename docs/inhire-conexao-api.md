# InHire — conexão por API

Como ligar o painel de recrutamento direto na API do InHire, sem depender de
ninguém rodar o conector MCP à mão.

---

## O que você precisa fazer (5 minutos)

Precisa ser **owner** da conta, e a conta precisa estar no **plano Advanced**.

1. No InHire, abra **Configurações** (engrenagem) → **Gestão de usuários e
   Acesso** → **Usuários de API**.
2. **Adicionar conta**. Dê o nome **`Dashboard People Analytics`**.
3. Aceite os termos e crie.
4. A tela mostra **e-mail** e **senha**. **A senha aparece uma única vez.**
   Copie as duas coisas antes de fechar.
5. No Lovable, em Secrets, crie três variáveis:

   | Variável | Valor |
   |---|---|
   | `INHIRE_API_EMAIL` | o e-mail que apareceu na tela |
   | `INHIRE_API_PASSWORD` | a senha que apareceu na tela |
   | `INHIRE_TENANT` | `flutterbrazil` |

6. No painel, vá em **Admin → Dados → Recrutamento** e clique em
   **Simular sem gravar**. Confira os números. Se estiverem certos, **Gravar**.

O `INHIRE_TENANT` é o subdomínio que vocês usam para entrar
(`https://flutterbrazil.inhire.app` → `flutterbrazil`).

> **Não mande a senha por chat, e-mail ou Slack.** Ela vai direto dos secrets
> para o servidor. Nem eu nem ninguém precisa vê-la para o painel funcionar.

---

## Um usuário separado, de propósito

Já existe o conector MCP apontando para a mesma conta. Mesmo assim, o dashboard
usa uma credencial própria. Três razões:

- **Dá para desligar um sem derrubar o outro.** Se a sincronização começar a se
  comportar mal, você desativa o usuário do dashboard e o time continua usando
  o MCP normalmente.
- **O log fica legível.** No InHire dá para ver o que veio de qual integração.
- **Rotação de senha não é evento coletivo.** Trocar a senha de um não afeta o
  outro.

---

## O que a integração faz, e o que ela não faz

**Faz:** baixa a lista de vagas, calcula por área e mês quantas fecharam, em
quanto tempo, e quantas estão abertas agora. Grava só isso.

**Não faz:** não toca em candidato. A lista de caminhos que o código pode chamar
está em `src/lib/inhire/paths.ts` e é fechada — qualquer chamada fora dela falha
antes de sair da máquina.

Isso importa porque a documentação do InHire é explícita:

> O usuário de API tem acesso integral a todos os dados da aplicação.

Não existe escopo do lado deles. A credencial que lê a contagem de vagas lê
currículo, CPF e telefone de qualquer candidato. O que limita o alcance é o
nosso código, em três camadas:

1. `paths.ts` — lista fechada de caminhos, toda de vaga.
2. `jobs.ts` — agrega em contagem por área e mês antes de qualquer gravação.
3. `jobs.test.ts` — um teste quebra se um campo pessoal aparecer no agregado.

Ampliar a lista continua possível, e vira uma linha de diff revisável em vez de
um efeito colateral.

---

## O limite é compartilhado com o MCP

20 requisições por segundo sustentadas, com um balde de 400 fichas para picos —
e o limite é **por conta**, não por credencial. O MCP que o time usa bebe do
mesmo balde.

Por isso a sincronização anda devagar de propósito: pausa entre páginas, recuo
ao primeiro `429`, e desaceleração preventiva quando o saldo cai abaixo de 80
fichas. Se ela corresse, derrubaria a ferramenta de quem está recrutando naquele
momento — e ninguém entenderia por quê.

A tela de admin mostra o **menor saldo** atingido em cada execução. Se aparecer
abaixo de 100 com frequência, vale espaçar mais a sincronização.

---

## Quando algo parar de funcionar

**"Integração não configurada"** — falta alguma das três variáveis. A tela diz
qual.

**HTTP 400 no login** — é requisição malformada, **não** senha errada. O InHire
valida o e-mail com formato de e-mail e a senha entre 6 e 64 caracteres; um
espaço ou quebra de linha colado junto reprova as duas coisas. O código agora
limpa espaços e aspas antes de usar, e checa formato e tamanho **antes** de
chamar a API — o erro passa a dizer qual campo está errado em vez de devolver um
400 mudo. Se ainda assim aparecer, a mensagem agora traz a resposta do próprio
InHire (com a senha apagada).

**HTTP 401 no login** — aí sim é credencial recusada: usuário desativado, ou
senha rotacionada sem atualizar o secret.

**"Verifique se o usuário de API está ativo e se a senha nos secrets é a
atual"** — três causas possíveis, nesta ordem de probabilidade: alguém
rotacionou a senha no InHire e não atualizou o secret; o usuário foi desativado;
o usuário foi excluído. Todas se resolvem em Configurações → Usuários de API.

**A integração parou sozinha depois de um período parado** — não deveria. O
token de acesso vale 1 hora e o de renovação vale 30 dias; se os dois vencerem,
o código faz login completo de novo com e-mail e senha. É exatamente por isso
que a senha fica nos secrets, e não só o token de renovação: sem ela, uma pausa
maior que 30 dias mataria a integração em silêncio.

**Os números não batem com o InHire** — o suspeito mais provável é o de-para de
departamento. Se alguém renomeou uma área lá dentro, ela aparece aqui como uma
linha nova em caixa alta, com o volume partido. O de-para vive em
`src/lib/inhire/jobs.ts`, na constante `DEPT_CANON`.

O segundo suspeito é o tempo de fechamento. O campo `sla` do InHire — que traria
o número já calculado por eles — vem vazio em 156 de 156 vagas, então o cálculo
é nosso, a partir do histórico de status, descontando congelamento. Se um dia o
`sla` passar a vir preenchido, prefira ele: dois painéis com tempos diferentes
para a mesma vaga é o pior desfecho possível.

---

## O contrato real da API (conferido em 10/08/2026)

Quatro coisas que eu tinha suposto errado antes de ler a referência. Ficam
registradas porque as quatro falhariam, e uma delas de um jeito enganoso.

| | Suposição | Real |
|---|---|---|
| Listagem | `GET /jobs?limit=100` | **`POST /jobs/paginated/lean`** |
| Paginação | `cursor` / `nextCursor` | **`startKey` → `exclusiveStartKey`** |
| Autorização | token puro no header | **`Authorization: Bearer <token>`** |
| Login | só `Content-Type` | **`X-Tenant` também é obrigatório** |

O `Bearer` é o pior dos quatro: sem ele a API devolve **401**, que se parece
exatamente com senha errada — e manda quem for investigar procurar no lugar
errado, mexendo em credencial que estava certa.

A paginação usa *pagination token* porque o banco por trás é NoSQL: não existe
pedir "página 3", só caminhar. O critério de parada é **lista vazia**, como
manda a documentação, e não a ausência de chave — o código checa os dois.

### Sobre o sufixo "lean"

O endpoint de listagem tem `lean` no nome, o que sugere payload reduzido. Se
ele não trouxer `customFields_map` (de onde sai o departamento) ou
`statusHistory` (de onde sai o tempo de fechamento), os números saem plausíveis
e errados: tudo em "SEM DEPTO", nenhum tempo calculado.

A prévia avisa explicitamente se isso acontecer. Se acontecer, o caminho é
buscar cada vaga em `GET /jobs/{id}` — são ~150 chamadas, o que cabe no burst
de 400, mas precisa de ritmo.

---

## Depois: webhook em vez de varredura

Hoje a sincronização varre a lista inteira a cada execução. Funciona, é
idempotente e cabe folgada no limite — mas é desperdício quando quase nada mudou.

O InHire oferece webhook. O desenho seguinte é: carga completa uma vez, e depois
só o que mudou, disparado por evento. Vale fazer quando a frequência de
sincronização subir, não antes — a varredura atual é mais simples de auditar e
o custo dela é irrelevante nesse volume.
