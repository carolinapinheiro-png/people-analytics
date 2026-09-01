-- "Não está preenchido no Convenia" era uma afirmação que ninguém tinha medido.
--
-- A tela de cadastro dizia, em amarelo, para quem digitasse um e-mail:
--
--   "Camada e departamento vieram do Convenia; o cargo não está preenchido
--    lá, então digite à mão."
--
-- Chegou como "o cargo sempre está preenchido no Convenia, é mandatório...
-- como assim não está?" -- e a resposta é que ele está. A frase foi escrita
-- quando `job_title` vinha nulo, e ela transformou "o meu lado não trouxe" em
-- "o lado de lá não tem". Um null vira fato sobre o mundo, e o fato sai na
-- tela em amarelo, com cara de diagnóstico.
--
-- É a mesma troca que este painel passou a semana desfazendo: "não existe"
-- usado no lugar de "não foi calculado".
--
-- O QUE FALTAVA PARA A FRASE PODER SER HONESTA
--
-- `job_title` nulo em `convenia_pessoas` é ambíguo por construção: pode ser
-- "ainda não perguntei" ou "perguntei e voltou vazio". As 805 linhas de lá
-- foram gravadas pelo laço de GÊNERO, que nunca leu cargo -- então hoje todas
-- as 805 são do primeiro caso, e nenhuma do segundo.
--
-- Esta coluna é a marca da pergunta, não da resposta. Preenchida = o detalhe
-- individual daquela pessoa já foi lido com o código que lê cargo. Só com ela
-- a tela pode separar as duas frases, e só a segunda fala do Convenia.
alter table public.convenia_pessoas add column if not exists job_title_em timestamptz;

comment on column public.convenia_pessoas.job_title_em is
  'Quando o detalhe individual foi lido POR CÓDIGO QUE LÊ CARGO. Nulo = a pergunta ainda não foi feita, e nada se pode afirmar sobre o cargo no Convenia. Preenchida com job_title nulo = perguntamos e voltou vazio.';
