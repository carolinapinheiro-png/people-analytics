-- Drivers de engajamento (deck do CEO, jan/2026): 8 drivers, ~31 perguntas,
-- com nota atual (jan/26) e anterior (jun/25) quando existe. So agregados.

CREATE TABLE IF NOT EXISTS public.engagement_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave text NOT NULL, driver text NOT NULL, driver_desc text,
  question text NOT NULL, score_current numeric, score_prev numeric,
  evaluation text, driver_pos integer DEFAULT 0, q_pos integer DEFAULT 0,
  loaded_at timestamptz DEFAULT now()
);
ALTER TABLE public.engagement_drivers ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.engagement_drivers TO authenticated;
GRANT ALL ON public.engagement_drivers TO service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='engagement_drivers' AND policyname='auth read eng drivers') THEN
    CREATE POLICY "auth read eng drivers" ON public.engagement_drivers FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

INSERT INTO public.engagement_drivers (wave,driver,driver_desc,question,score_current,score_prev,evaluation,driver_pos,q_pos) VALUES
('jan_2026','Propósito, clareza de papel e alinhamento','Alinhamento estratégico, clareza de expectativas e entendimento da contribuição.','Sei o que se espera que eu entregue.',4.3,4.5,'Queda relevante',0,0),
('jan_2026','Propósito, clareza de papel e alinhamento',NULL,'Entendo como meu trabalho apoia as metas do time.',4.8,4.8,'Estável',0,1),
('jan_2026','Propósito, clareza de papel e alinhamento',NULL,'O trabalho que faço é significativo para mim.',4.6,4.7,'Estável',0,2),
('jan_2026','Propósito, clareza de papel e alinhamento',NULL,'Entendo os valores culturais e como aplicá-los no dia a dia.',4.6,NULL,NULL,0,3),
('jan_2026','Diversidade, inclusão e pertencimento','Segurança psicológica, percepção de justiça e respeito.','Pessoas de todas as origens têm as mesmas oportunidades.',4.3,4.5,'Estável',1,0),
('jan_2026','Diversidade, inclusão e pertencimento',NULL,'Acredito que a Flutter Brazil responderia bem a casos de discriminação.',4.4,NULL,NULL,1,1),
('jan_2026','Diversidade, inclusão e pertencimento',NULL,'Sinto que pertenço à Flutter Brazil.',4.5,NULL,NULL,1,2),
('jan_2026','Comunicação e fluxo de informação','Transparência organizacional e clareza da cascata de informação.','Recebo comunicação oportuna sobre decisões que me afetam.',4.0,NULL,NULL,2,0),
('jan_2026','Comunicação e fluxo de informação',NULL,'Me sinto bem informado sobre o que acontece na Flutter Brazil.',4.1,NULL,NULL,2,1),
('jan_2026','Comunicação e fluxo de informação',NULL,'Sei onde encontrar as informações de que preciso.',4.1,NULL,NULL,2,2),
('jan_2026','Comunicação e fluxo de informação',NULL,'As comunicações internas são claras e fáceis de entender.',4.4,NULL,NULL,2,3),
('jan_2026','Comunicação e fluxo de informação',NULL,'O volume de informação que recebo é gerenciável.',4.2,NULL,NULL,2,4),
('jan_2026','Comunicação e fluxo de informação',NULL,'A organização comunica bem metas e estratégias da liderança.',4.0,NULL,NULL,2,5),
('jan_2026','Gestor e colaboração de time','Qualidade da dinâmica de time e comportamento da liderança direta.','Meu gestor se importa com minhas opiniões.',4.7,4.5,'Estável',3,0),
('jan_2026','Gestor e colaboração de time',NULL,'Meu gestor se comunica de forma aberta e honesta.',4.8,NULL,NULL,3,1),
('jan_2026','Gestor e colaboração de time',NULL,'Meu gestor traduz a estratégia em metas claras.',4.4,NULL,NULL,3,2),
('jan_2026','Gestor e colaboração de time',NULL,'Meu gestor incentiva e apoia meu desenvolvimento.',4.6,NULL,NULL,3,3),
('jan_2026','Gestor e colaboração de time',NULL,'Recebo feedback suficiente para saber se vou bem.',4.2,4.0,'Melhora relevante',3,4),
('jan_2026','Gestor e colaboração de time',NULL,'Posso contar com colegas quando preciso.',4.7,4.8,'Estável',3,5),
('jan_2026','Reconhecimento e desenvolvimento de carreira','Percepção de crescimento, clareza de avanço e reconhecimento.','Vejo um caminho para avançar na carreira aqui.',4.1,4.3,'Estável',4,0),
('jan_2026','Reconhecimento e desenvolvimento de carreira',NULL,'Consigo conversas construtivas com meu gestor sobre remuneração.',3.8,NULL,NULL,4,1),
('jan_2026','Reconhecimento e desenvolvimento de carreira',NULL,'Sou recompensado de forma justa pelas minhas contribuições.',3.9,4.1,'Estável',4,2),
('jan_2026','Reconhecimento e desenvolvimento de carreira',NULL,'Os benefícios são justos e alinhados ao meu papel e nível.',3.8,NULL,NULL,4,3),
('jan_2026','Reconhecimento e desenvolvimento de carreira',NULL,'Os processos de definição de remuneração parecem justos.',3.7,NULL,NULL,4,4),
('jan_2026','Desempenho, responsabilização e autonomia','Critérios de desempenho, autonomia e gestão de consequências.','Tenho critérios claros de como meu desempenho é medido.',4.0,NULL,NULL,5,0),
('jan_2026','Desempenho, responsabilização e autonomia',NULL,'Me sinto autônomo para tomar decisões importantes.',4.3,NULL,NULL,5,1),
('jan_2026','Desempenho, responsabilização e autonomia',NULL,'Baixo desempenho recorrente é tratado, não justificado.',3.8,NULL,NULL,5,2),
('jan_2026','Desempenho, responsabilização e autonomia',NULL,'Há pouca duplicação de trabalho entre times.',3.8,NULL,NULL,5,3),
('jan_2026','Carga de trabalho e sustentabilidade','Se a carga permite desempenho sustentável e equilíbrio.','Minha carga permite equilíbrio sustentável entre trabalho e vida.',4.3,NULL,NULL,6,0),
('jan_2026','Processos de pessoas e suporte de RH','Acessibilidade, clareza e eficácia do suporte de RH.','Recebo orientação clara do RH para decisões de pessoas.',4.4,NULL,NULL,7,0),
('jan_2026','Processos de pessoas e suporte de RH',NULL,'Entendo como o RH se organiza e quem procurar.',4.3,NULL,NULL,7,1);

COMMENT ON TABLE public.engagement_drivers IS
  'Drivers e perguntas da pesquisa de engajamento (deck do CEO). So agregados.';
