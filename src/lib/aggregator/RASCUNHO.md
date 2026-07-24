# Agregador mensal — RASCUNHO NÃO REVISADO (24/07/2026)

Escrito ao fim de uma sessão longa, por decisão consciente da área e contra a
recomendação de aguardar. **Não mesclar na main antes de revisão linha a linha.**

## Verificação já executada

O núcleo TypeScript rodou contra os MESMOS dados do protótipo Python
(18 meses NSX BR, implementações independentes). Resultado: **25 divergências,
todas explicadas por uma única causa** — um CPF com **6 vínculos** na base
(admissões 2023-06, 2024-11, 2025-07, 2025-10 e DUAS FUTURAS: 2026-08 e
2026-09; só 2 desligamentos), chegando a **3 vínculos ativos simultâneos**
em out/2025. O Python conta departamento por CPF; o TS, por vínculo. Ambos
inflam o headcount. Nenhuma regra de dedup foi aplicada de propósito: a regra
não existe e é decisão da área.

Fora essa pessoa, os 18 meses batem campo a campo (9 escalares + estados +
departamentos, tolerância 0,11 para arredondamento Python×JS).

## Pendências da revisão (amanhã)

1. Regra para múltiplos vínculos do mesmo CPF (e corrigir na origem as
   admissões futuras — provável erro de cadastro).
2. Testes sintéticos (monthly-aggregator.test.ts) — ainda não escritos.
3. Marcadores REVIEW no código: denominador de attrition; corte de admissão
   no dia; ativos sem registro vigente fora de dept_data; promotions.
4. Estender a Betfair/Flutter Intl após a decisão dos 18 duplicados Workday.
5. Limitação estrutural a registrar na UI: gênero, liderança e estado são
   valores atuais aplicados retroativamente (a base não tem histórico deles).
