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

## Pendências que só a comparação resolve (próxima sessão)

- Qual série vira oficial: congelada × reconstruída, lado a lado por mês.
- 18 duplicados Betfair (Talent Mobility × Workday): qual fonte prevalece.
- Satisfação jun/25 ambígua no deck de engajamento (8,9 ou 8,6): confirmar com a área.

## Ordem de execução

1. Agregador TypeScript (Talent_Mobility → monthly_metrics 'reconstruido') + tela de importação no admin
2. Comparação lado a lado e decisão da série oficial
3. Aba Experiência (clima + entrada)
4. Span real + CompRatio individual (com revisão de allowed_emails antes)
