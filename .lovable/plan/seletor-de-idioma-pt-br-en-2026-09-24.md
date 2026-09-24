# Seletor de idioma PT-BR / EN

## Objetivo
Adicionar um seletor no canto superior direito e traduzir toda a experiência visível da plataforma entre Português (PT-BR) e Inglês (EN), preservando cálculos, filtros, acessos e dados.

## O que será entregue
- Seletor compacto de idioma com as opções **Português (PT-BR)** e **English (EN)** no topo do dashboard e da administração, além das telas públicas de acesso e recuperação.
- Idioma salvo no navegador e restaurado sem troca visual durante o carregamento; PT-BR será o padrão atual.
- Tradução de navegação, filtros, abas, cartões, gráficos, tabelas, legendas, estados vazios, avisos, diálogos, formulários, botões, mensagens de sucesso/erro e textos de acessibilidade.
- Tradução das telas de login, cadastro fechado, atualização de senha, consentimento, página não encontrada e erro geral.
- Datas, meses, números, percentuais e textos com plural formatados conforme o idioma selecionado.
- PDF de Engajamento gerado no idioma ativo, incluindo capa, filtros, data e rodapé.
- Metadados e idioma do documento atualizados para a seleção ativa quando a aplicação estiver aberta.

## Limites de tradução
- Nomes de pessoas, departamentos, cargos, marcas, integrações e demais valores vindos dos dados não serão alterados.
- Termos padronizados do negócio terão rótulos traduzidos quando exibidos, mas os valores internos usados em filtros e regras continuarão iguais.
- Mensagens técnicas internas e registros de servidor não serão traduzidos quando não aparecem para a pessoa usuária.

## Implementação técnica
- Criar uma camada central e tipada de internacionalização, com catálogos `pt-BR` e `en`, interpolação, pluralização e funções de formatação baseadas em `Intl`.
- Montar o provedor de idioma na raiz da aplicação, com persistência segura no cliente e atualização de `document.documentElement.lang`.
- Criar um único componente reutilizável de seleção de idioma e inseri-lo nas áreas superiores apropriadas, mantendo o layout atual em telas pequenas e grandes.
- Migrar os textos visíveis por domínio: estrutura global e autenticação; navegação e filtros; abas e gráficos; administração; diálogos, avisos e exportações.
- Manter chaves internas, permissões, cálculos e parâmetros de consulta independentes do idioma para evitar regressões funcionais.

## Validação
- Adicionar testes da camada de tradução, fallback, interpolação e formatação regional.
- Executar os testes relevantes existentes e a verificação de tipos.
- Percorrer em PT-BR e EN os fluxos principais de login, dashboard, filtros, administração e exportação, verificando desktop e largura reduzida.
- Fazer uma varredura final de textos visíveis fixos para impedir telas parcialmente traduzidas.
