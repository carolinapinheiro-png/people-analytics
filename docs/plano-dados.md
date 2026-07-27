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
9. **Betfair BR = Talent Mobility, sem merge com o Workday.** Regra da área: nos
   18 duplicados, vence o Talent Mobility. Os 18 são todos "Brazil Remote" e já
   estão nos 34 do Talent Mobility — sem dupla contagem. Dos 52 que só existem no
   Workday, 38 estão no exterior (Romênia 34, UK 3, Malta 1) e 14 são "Brazil
   Remote" ausentes do Talent Mobility. Nenhum é Betfair BR para o dashboard
   brasileiro: o Workday (Brazil_FBe) é população à parte (Betfair International).
   Consequência: **a extensão Betfair não precisa de código** — o agregador já
   produz Betfair de 34 do Talent Mobility, como NSX e Flutter.
   Ponta solta (não bloqueia o dashboard): confirmar com o dono do FBe se os 14
   "Brazil Remote" do Workday deveriam estar no Talent Mobility.
10. **"6 vínculos" era ruído de histórico.** No export oficial não há CPF
    duplicado na Worksheet; o caso é 1 pessoa com 5 registros `Motivo: Admissão`
    para um contrato contínuo (3 no mesmo dia, salários diferentes). O agregador
    (pessoa = linha da Worksheet) é imune. Para o DP: corrigir os Motivos e as 5
    admissões futuras.

## Pendências que dependem da área (e-mails enviados/rascunhados)

- Satisfação jun/25 ambígua no deck (slide 4: 8,9 geral × 8,6 do recorte 6–12
  meses de casa): confirmar valor company-wide com quem montou o deck.
- Fonte original de `promotions` da série congelada (a reconstruída grava null).

## Ordem de execução

1. ~~Agregador TypeScript + tela de importação no admin~~ ✅ (mesclado 24/07)
2. ~~Comparação lado a lado~~ ✅ — falta o martelo formal da série oficial no app
3. Aba Experiência (clima + entrada)
4. Span real + CompRatio individual (com revisão de allowed_emails antes)

Span real: a cadeia de gestão está no próprio Talent Mobility (647 dos 649
ativos têm gestor, 120 gestores distintos). `Span de Controle.csv` é só guia de
definições (career bands), não organograma. CompRatio: `COMP RATIO base.csv` =
587 salários individuais; `COMP RATIO v2.csv` = bandas (já viraram colunas
geradas no banco).
