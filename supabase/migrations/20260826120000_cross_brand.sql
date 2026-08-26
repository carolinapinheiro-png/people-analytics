-- "Ambas" -> "Cross Brand"
--
-- O questionário sempre chamou a alternativa de "Ambas / Função cross-brand".
-- O normalizador do aggregator cortava a segunda metade e gravava só "Ambas"
-- -- e a metade que sobrava é justamente a que não explica nada.
--
-- Isto renomeia o que já está gravado. O código novo já grava "Cross Brand" na
-- importação; sem esta migração, uma onda antiga e uma nova apareceriam como
-- dois grupos diferentes de gente que respondeu a mesma coisa.
--
-- Alcança os recortes simples ('marca') e os cruzados ('area+marca'), onde o
-- valor vem composto como "Commercial || Ambas".

update survey_cut_scores
   set cut_value = 'Cross Brand'
 where cut_type = 'marca'
   and cut_value = 'Ambas';

update survey_cut_scores
   set cut_value = split_part(cut_value, ' || ', 1) || ' || Cross Brand'
 where cut_type = 'area+marca'
   and split_part(cut_value, ' || ', 2) = 'Ambas';
