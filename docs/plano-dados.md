# Plano de migração de dados — decisões fechadas em 24/07/2026

Revisão feita aba a aba com a área. Nada abaixo é sugestão: são decisões.

## Mapa

| Aba | Hoje | Destino |
|---|---|---|
| Overview, Trend, DEI, Salary, Location, Movement, Data | raw-data.ts congelado | monthly_metrics via agregador |
| Leavers, Unwanted | banco + log (pronto) | — |
| Engagement | valores fixos | vira **"Experiência"**: clima (engagement_*) + jornada de entrada (onboarding_survey_aggregates) |
| Span | organograma real congelado + span/depto fabricado | organograma calculado da cadeia real (Span_de_Controle); span/depto real |
| CompRatio | quartis fixos (0.18/0.28/0.32/0.22) | distribuição real do COMP_RATIO_base |

## Decisões da área

1. **Onboarding não ganha aba própria**: entra como segunda seção da aba Experiência.
   Critério para desmembrar no futuro: série de turmas > 1 ano e meta própria de TI.
2. **CompRatio: granularidade individual**, com o mesmo tratamento de leavers —
   tabela sem policy de leitura, server function com log obrigatório.
   ANTES de ir ao ar: revisar allowed_emails (expõe salário de 587 ativos a
   qualquer usuário autorizado).
3. **Organograma do Span fica**: é a estrutura real (validado contra dept_data
   de jun/2026: CTO 175 ≈ TECH 172, CMO 85 ≈ MKT 87, CFO 45 ≈ FIN 44, 6
   diretores = 6 pessoas em DIRETORIA). Passa a ser calculado da cadeia real
   para não envelhecer.
4. **Lideranca**: "Não informado" = não é líder. Campo completo.
5. **Exit survey**: só agregados (reason/count/pct/trend); comentários nunca.
6. **Onboarding**: supressão de célula n<3; comentários livres nunca no banco.
7. **Dezembro/2025 (NSX)** e **Porto (2026-05)**: quality_flag, fora de qualquer
   gráfico até a série reconstruída substituir.

## Decisões de 24/07 (tarde) — comparação executada e fontes resolvidas

8. **Série reconstruída validada** contra o Talent Mobility real (21/07): headcount
   converge (máx ±5 no início de 2025, **zero em jun/2026** nas três marcas: NSX
   581, Betfair 34, Flutter 22). A reconstruída ganha 2025 inteiro de Betfair e
   Flutter, conserta dez/2025 e faz a soma dos deptos bater com o headcount.
   Relatório: `comparacao-series-24-07-2026.md`. Falta só bater o martelo formal
   da série oficial no app.
9. **Betfair BR = Talent Mobility + Workday (86 distintas).** Regra da área: nos
   18 duplicados vence o Talent Mobility. O Workday inteiro (Brazil_FBe) é
   Betfair BR. Betfair distinta = 34 (TM) + 52 (só-Workday) = 86, confirmado em
   jun/2026. Implementado: adaptador `workday-adapter.ts`, upload opcional do
   FBe na tela de importação, dedup por nome no navegador. Testado (40 casos).
   **Refinamento (27/07): headcount = empregados diretos; contingent à parte.**
   Regra da área: conta quem está em centro de custo Betfair Brasil (qualquer
   variação de nome). Os contingent workers (contratados terceiros, Employee ID
   com prefixo "C") estão nesses centros de custo, mas ficam FORA do headcount —
   o número deles varia por export (9 no snapshot de maio, 43 em dez, 83 no de
   127 linhas: ruído de escopo, não crescimento). Betfair jun/2026 = 77 (era 86;
   saem os 9 contingent de maio). Contingent viram linha separada quando houver
   fonte consistente. Os snapshots históricos confirmam que os diretos são
   estáveis (~43 núcleo, overlap real por Employee ID) — o viés de sobrevivência
   deles é pequeno, então não exigem reconstrução por snapshot.
   Limitações estruturais declaradas (o Workday não conserta):
   - **Gênero**: o Workday não tem a coluna. Os 52 entram no headcount mas fora
     de fem/mas. Por isso `gender_female_pct` passou a ser sobre a **base com
     gênero conhecido** (`gender_base`), não sobre o headcount — senão diluiria
     ~3×. Isso também corrige (levemente) NSX e Flutter: o % de mulheres agora
     ignora "Não informado" no denominador. A comparação vai mostrar esse ajuste.
   - **Departamento**: o Workday só tem o cargo atual, em unidades nomeadas por
     gestor. Os 52 caem em SEM DEPTO (não poluem os deptos brasileiros).
   - **Viés de sobrevivência**: o FBe é retrato de maio/2026; quem saiu antes não
     aparece. Headcount de 2025 dessa parcela é subcontado; recente é sólido.
   - **Salário**: ausente no Workday → os 52 não entram em avg_salary.
10. **"6 vínculos" era ruído de histórico.** No export oficial não há CPF
    duplicado na Worksheet; o caso é 1 pessoa com 5 registros `Motivo: Admissão`
    para um contrato contínuo (3 no mesmo dia, salários diferentes). O agregador
    (pessoa = linha da Worksheet) é imune. Para o DP: corrigir os Motivos e as 5
    admissões futuras.

## Decisão de 28/07 — reconstrução histórica (liderança + nível)

11. **A série passa a usar o valor DA ÉPOCA em liderança e nível**, não o snapshot
    atual aplicado para trás. Ancorado no quadro atual (exato no mês mais recente,
    Δ=0) e recuado só por eventos reais e datados. Prova offline fechada e
    reproduzida pelo pipeline real (adapter+aggregator).
    - **Liderança**: quem é líder hoje deixa de ser líder ANTES da sua transição
      real para um cargo de liderança (1º cargo de liderança no histórico, tendo
      havido cargo não-liderança antes). Sem transição detectada, mantém líder
      (não fabrica recuo). Efeito NSX: jan/2025 60→43 líderes; a diferença
      encolhe até 0 em jul/2026. Corrige a inflação de líderes no passado
      (empresa cresceu 266→587; muitos gestores são recentes).
    - **Nível**: nível atual −1 por promoção (Motivo="Promoção") posterior ao mês.
      Premissa única e documentada: 1 nível por promoção (66 pessoas, 73 eventos).
      Vira dimensão nova `level_base` (jsonb { "L0": n, ..., "NA": n }) + pirâmide
      de senioridade no tempo na aba DEI.
    - **Gênero**: NÃO é reconstruído — não muda no tempo, atual = histórico já é o
      valor certo. Os "Não informado" (7 no NSX) não têm fonte e não se inventa.
    - **Descartado**: mapa cargo→nível (ruído alto: L3 errava +40 já no mês
      atual, onde deveria ser exato). O método de âncora+promoção tem ruído zero
      na âncora.
    - **Limitações**: Betfair/Flutter (Workday) não têm histórico de cargo nem
      nível → liderança fica no atual e nível cai em "NA". Reconstrução real só
      no NSX. Histórico do TM tem registros duplicados → estimativa com ruído nos
      meses intermediários, exata na ponta.
    - Implementado: `leadershipStart`/`promotionDates`/`levelBucket` no núcleo;
      `level`/`cargo` no adapter; coluna `level_base` + RPC atualizada
      (migration 20260728120000, aplicada à mão no prod). 31/31 testes verdes.
      **Regravar a série**: reimportar pela tela do admin (recomputa tudo com o
      código novo; a RPC grava level_base e a liderança da época).

## Pendências que dependem da área (e-mails enviados/rascunhados)

- Satisfação jun/25 ambígua no deck (slide 4: 8,9 geral × 8,6 do recorte 6–12
  meses de casa): confirmar valor company-wide com quem montou o deck.
- Fonte original de `promotions` da série congelada (a reconstruída grava null).

## Ordem de execução

1. ~~Agregador TypeScript + tela de importação no admin~~ ✅ (mesclado 24/07)
1b. ~~Betfair BR = TM + Workday (adaptador + upload do FBe)~~ ✅ (branch feat/betfair-workday)
2. ~~Comparação lado a lado + decisão da série oficial~~ ✅ (reconstruída venceu)
2b. ~~Dashboard lê do banco~~ ✅ — reconstruída oficial + congelada nos 3 buracos
    (exit_survey, salary_band_attrition, promotions); filtra quality_flag.
    O mock raw-data.ts saiu do fluxo (array pode ser podado depois).
3. ~~Aba Experiência~~ ✅ — sub-abas Engajamento (deck CEO) / Onboarding (banco) /
   Inclusão & Pertencimento (Polly 2026 + Flutter Near You). Tabelas
   engagement_scores e experience_distributions (aplicadas no banco à mão).
4. ~~Span real + CompRatio individual~~ ✅
   - Span: cadeia real do Talent Mobility (span_snapshot). No ar.
   - CompRatio: 582 salários individuais em comp_ratio (sem policy de leitura,
     listCompRatio com log obrigatório). allowed_emails revisado: 3 autorizados
     (Carolina admin, Caio e Leticia viewers), todo acesso logado. No ar.

Span real: a cadeia de gestão está no próprio Talent Mobility (647 dos 649
ativos têm gestor, 120 gestores distintos). `Span de Controle.csv` é só guia de
definições (career bands), não organograma. CompRatio: `COMP RATIO base.csv` =
587 salários individuais; `COMP RATIO v2.csv` = bandas (já viraram colunas
geradas no banco).
