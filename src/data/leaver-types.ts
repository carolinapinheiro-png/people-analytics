/**
 * Tipo do registro individual de pessoa desligada.
 *
 * Antes vivia junto com os dados, em leavers-data.ts. O arquivo de dados foi
 * removido do repositorio -- ele carregava 152 pessoas com nome, raca e
 * salario para dentro do bundle do navegador. Os dados agora ficam na tabela
 * public.leavers, sem policy de leitura, acessivel apenas pela server function
 * listLeavers, que registra cada consulta.
 *
 * O tipo permanece porque as abas continuam trabalhando com dado individual.
 */
export interface LeaverRecord {
  id: string;
  nome: string;
  genero: string;
  raca: string;
  salario: number;
  vinculo: string;
  cargo: string;
  departamento: string;
  time: string;
  level: string;
  job_family: string;
  career_band: string;
  workday_level: string;
  data_desligamento_str: string;
  tipo_desligamento: string;
  motivo_desligamento: string;
  data_desligamento: string;
  data_admissao: string;
  tempo_casa_dias: number;
  faixa_salarial: string;
  tempo_casa_faixa: string;
  mes_desligamento: string;
  ano_desligamento: string;
  tipo_desligamento_agrupado: string;
}
