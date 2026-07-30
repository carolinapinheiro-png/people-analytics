-- Perfil individual do colaborador (pergunta da Marilia).
-- Data da ultima promocao por pessoa. Fonte: aba de historico (Motivo="Promoção"),
-- a MESMA que alimentou a reconstrucao de nivel/lideranca. Fica nullable: enquanto
-- nao carregarmos o historico por pessoa, o perfil mostra "sem registro na base".
-- Nao expoe salario nominal (decisao 30/07); o perfil usa faixa + comp-ratio.
ALTER TABLE public.comp_ratio ADD COLUMN IF NOT EXISTS last_promotion date;
