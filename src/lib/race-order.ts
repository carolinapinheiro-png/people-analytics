/**
 * A régua de raça, na ordem em que a tabela e o seletor a mostram.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM ARQUIVO SÓ PRA UMA CONSTANTE
 * ---------------------------------------------------------------------------
 * Vivia dentro do DEITab. O seletor de raça passou a morar na barra global
 * (mesmo lugar do filtro de departamento -- ver FilterBar.tsx), e a barra
 * carrega em toda aba, não só em DEI. Importar a constante direto do
 * componente da aba arrastaria o módulo inteiro do DEITab -- recharts,
 * gráficos, tudo -- para dentro do bundle da barra.
 *
 * Um arquivo à parte custa uma linha de import nos dois lados e evita o
 * acoplamento. Mesma lógica de FAIXAS_TEMPO_DE_CASA em pessoas.ts: a régua é
 * dado, e vive num lugar que qualquer um pode importar sem trazer o resto.
 */
export const RACE_ORDER = ['Branca', 'Parda', 'Preta', 'Amarela', 'Indígena', 'Não informado'];
