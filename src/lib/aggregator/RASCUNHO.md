# Agregador mensal — revisado em leitura fria (24/07/2026)

Rascunho escrito ao fim da sessão de 24/07 e revisado no mesmo dia em sessão
independente: leitura fria linha a linha, expectativas derivadas de
`docs/plano-dados.md`, decisões tomadas por Carolina.
**Não mesclar na main antes dos testes sintéticos.**

## Verificação executada (sessão de escrita)

O núcleo TypeScript rodou contra os MESMOS dados do protótipo Python
(18 meses NSX BR, implementações independentes). Resultado: **25 divergências,
todas explicadas por uma única causa** — um CPF com **6 vínculos** na base
(admissões 2023-06, 2024-11, 2025-07, 2025-10 e DUAS FUTURAS: 2026-08 e
2026-09; só 2 desligamentos), chegando a **3 vínculos ativos simultâneos**
em out/2025. Fora essa pessoa, os 18 meses batem campo a campo (9 escalares +
estados + departamentos, tolerância 0,11 para arredondamento Python×JS).
Cadastro reportado ao DP para correção na origem.

## Decisões da revisão fria (24/07/2026)

1. **Múltiplos vínculos: regra híbrida.** Foto por pessoa (headcount, gênero,
   liderança, estados, deptos deduplicam por CPF; vínculo ativo de admissão
   mais recente representa a pessoa). Fluxo por evento (joiners/leavers contam
   cada admissão/desligamento; recontratação é entrada real).
2. **Attrition: denominador = headcount de fim de mês**, mantido até a
   comparação com a série congelada. Reabrir (headcount médio?) quando a
   série oficial for escolhida.
3. **Cortes de dia exato: mantidos e medidos.** Admissão no dia do corte conta
   como ativo; desligamento no dia do corte já exclui. Os ±1 contra a série
   congelada na comparação lado a lado revelam a convenção da origem.
4. **Ativo sem registro vigente entra como SEM DEPTO** — soma dos
   departamentos bate com o headcount (corrige o defeito da série congelada).
5. **Promotions: null.** Não reconstruível de Talent_Mobility (não distingue
   promoção de mérito). Fonte original da congelada a descobrir com a área.

## Achados da leitura fria ainda abertos

- `parseBrNumber("1.234")` → 1,234 (mil vezes menor). Só ocorre se algum
  salário vier sem centavos. Cravar em teste sintético.
- Empresa fora de `COMPANY_TO_BU` é descartada em silêncio pelo filter do
  pool. O adaptador (XLSX/CSV) deve acusar empresas não mapeadas.
- `mean1` de lista vazia retorna 0, não null — média salarial 0 em depto sem
  líderes parece dado real. Decidir na fase de UI/comparação.
- Empates resolvem pela ordem de entrada (admissão igual no dedup; `from`
  igual em `departmentAt`): determinístico só com entrada estável.

## Pendências

1. **Testes sintéticos** (`monthly-aggregator.test.ts`) — condição para o merge.
2. Estender a Betfair/Flutter Intl após a decisão dos 18 duplicados Workday.
3. Tela de importação no admin; gravar série `reconstruido` e comparar.
4. Limitação estrutural a registrar na UI: gênero, liderança e estado são
   valores atuais aplicados retroativamente (a base não tem histórico deles).
