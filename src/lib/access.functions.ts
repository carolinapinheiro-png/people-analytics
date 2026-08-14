import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  AddAllowedEmailSchema,
  UpdateAllowedEmailUserSchema,
  RemoveAllowedEmailSchema,
  AddDepartmentSchema,
  SetDepartmentActiveSchema,
  GetAllowedEmailsSchema,
  UserHistorySchema,
  type AllowedEmailRow,
  isScopedProfileValue,
  roleForProfile,
  SCOPED_REQUIRES_SCOPE_MESSAGE,
  BulkUpdateSchema,
  ImportCsvSchema,
  type AccessProfileValue,
} from '@/lib/access-rules';

export const checkAccess = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userEmail = context.claims.email as string | undefined;
    if (!userEmail) {
      return {
        allowed: false,
        role: null,
        profile: null,
        departments: [] as string[],
        jobFamilies: [] as string[],
      };
    }

    // A policy de allowed_emails faz join com auth.users, que o papel
    // authenticated nao le — o subselect volta nulo e tudo seria negado.
    // O claims.email ja vem verificado pelo JWT, entao a consulta de
    // autorizacao usa o admin client.
    //
    // A resolucao passa por `resolverEscopo` -- o MESMO ponto que todas as
    // outras server functions usam. E o que garante que a tela e os dados
    // concordem sobre quem esta olhando. Se a UI se desenhasse pelo perfil
    // real enquanto os dados viessem pelo perfil simulado (ou o contrario), a
    // divergencia nao apareceria como erro: apareceria como um grafico vazio,
    // que qualquer um leria como "essa area nao tem dado".
    const { supabaseAdmin } = await import('./access-rules.server');
    const { resolverEscopo } = await import('./escopo.server');

    const negado = {
      allowed: false,
      role: null as 'admin' | 'viewer' | null,
      profile: null as string | null,
      departments: [] as string[],
      jobFamilies: [] as string[],
      verComo: null as { email: string; profile: string } | null,
      extraTabs: [] as string[],
      podeVerIndividual: false,
      expiraEm: null as string | null,
    };

    const logar = async (allowed: boolean) => {
      try {
        await supabaseAdmin.from('access_logs').insert({
          email: userEmail, user_id: context.userId, action: 'check_access', allowed,
        });
      } catch (logError) {
        console.error('Failed to log access attempt:', logError);
      }
    };

    let e: Awaited<ReturnType<typeof resolverEscopo>>;
    try {
      e = await resolverEscopo(userEmail);
    } catch (err) {
      // 'Forbidden' e a negacao autoritativa: o e-mail nao esta na lista.
      // Qualquer outra falha (banco fora do ar, alvo de simulacao inexistente)
      // NAO e negacao e nao pode derrubar uma sessao valida -- propaga como
      // erro, que o cliente trata como 'error' e permite tentar de novo.
      if ((err instanceof Error ? err.message : String(err)) !== 'Forbidden') throw err;
      await logar(false);
      return negado;
    }

    await logar(true);

    // "Ultimo acesso" existe para a lista de usuarios nao crescer so de um
    // lado: sem ele, uma conta criada para um projeto de tres meses fica ali
    // para sempre e ninguem sabe dizer se ainda e usada. Fire-and-forget --
    // falhar em anotar o acesso nao pode impedir o acesso.
    void supabaseAdmin
      .from('allowed_emails')
      .update({ last_login_at: new Date().toISOString() } as never)
      .ilike('email', userEmail)
      .then(({ error }) => {
        if (error) console.error('Falha ao anotar ultimo acesso:', error.message);
      });

    return {
      allowed: true,
      role: e.role,
      profile: e.profile as string | null,
      departments: e.departments,
      jobFamilies: e.jobFamilies,
      /** Abas concedidas alem das do perfil -- o menu precisa somar as duas. */
      extraTabs: e.extraTabs,
      podeVerIndividual: e.podeVerIndividual,
      expiraEm: e.expiraEm,
      /** Preenchido = a tela inteira esta desenhada pelos olhos de outra pessoa. */
      verComo: e.verComo as { email: string; profile: string } | null,
    };
  });

export const getAllowedEmails = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => GetAllowedEmailsSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    const search = data.search.trim().toLowerCase();
    const hasSearch = search.length > 0;

    let countQuery = supabaseAdmin
      .from('allowed_emails')
      .select('*', { count: 'exact', head: true });

    let itemsQuery = supabaseAdmin
      .from('allowed_emails')
      .select('*')
      .order('created_at', { ascending: false });

    if (hasSearch) {
      const pattern = `%${search}%`;
      const filter = `email.ilike.${pattern},job_title.ilike.${pattern}`;
      countQuery = countQuery.or(filter);
      itemsQuery = itemsQuery.or(filter);
    }

    // Filtros da lista. Com 100+ linhas, buscar por e-mail so ajuda quem ja
    // sabe o e-mail -- e a pergunta comum e outra: "quem sao os dept leaders?",
    // "quem enxerga COMMERCIAL?".
    if (data.profile) {
      countQuery = countQuery.eq('profile', data.profile as never);
      itemsQuery = itemsQuery.eq('profile', data.profile as never);
    }
    if (data.department) {
      countQuery = countQuery.contains('departments', [data.department]);
      itemsQuery = itemsQuery.contains('departments', [data.department]);
    }

    const from = (data.page - 1) * data.limit;
    const to = from + data.limit - 1;

    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(countError.message);

    const { data: items, error } = await itemsQuery.range(from, to);
    if (error) throw new Error(error.message);

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / data.limit));

    // Contagem por perfil no topo, sempre da base INTEIRA -- nao do filtro.
    // Um contador que muda junto com o filtro nao responde "como esta a
    // distribuicao", que e para o que ele serve.
    const { data: todos } = await supabaseAdmin.from('allowed_emails').select('profile');
    const porPerfil: Record<string, number> = {};
    for (const r of (todos ?? []) as Array<{ profile: string }>) {
      porPerfil[r.profile] = (porPerfil[r.profile] ?? 0) + 1;
    }

    return {
      items: items as AllowedEmailRow[],
      count: total,
      page: data.page,
      limit: data.limit,
      totalPages,
      porPerfil,
    };
  });

/**
 * O que mudou na permissao de um usuario, e quem mudou.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO FALTAVA
 * ------------------------------------------------------------------
 * `access_logs` registrava ACESSOS -- quem entrou, quando, se foi permitido.
 * Nunca registrou CONCESSOES. Na pratica: dava para saber que o fulano abriu
 * a aba de salarios, e nao dava para saber quem tinha dado a ele o direito de
 * abrir, nem quando.
 *
 * "Quem deu esse acesso?" e a primeira pergunta de qualquer revisao, e ate
 * agora a resposta era "ninguem sabe".
 */
export const getUserHistory = createServerFn({ method: 'POST' })
  .inputValidator((data) => UserHistorySchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    const { data: rows, error } = await (supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (c: string, v: string[]) => {
            contains: (c: string, v: unknown) => {
              order: (c: string, o: { ascending: boolean }) => {
                limit: (n: number) => PromiseLike<{
                  data: HistoricoRow[] | null; error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    })
      .from('access_logs')
      .select('email, action, created_at, metadata')
      .in('action', ['permissao_criada', 'permissao_alterada', 'permissao_removida'])
      .contains('metadata', { alvo: data.email.toLowerCase() })
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);
    return (rows ?? []) as HistoricoRow[];
  });

/**
 * Foto da permissao num instante. Campos explicitos, e nao um mapa livre,
 * porque isto atravessa a fronteira servidor->cliente: um `Record<string,
 * unknown>` nao e serializavel pelo TanStack, e listar os campos tem um ganho
 * extra -- o diff na tela sabe o nome de cada um.
 */
export interface PermissaoSnapshot {
  profile?: string | null;
  departments?: string[];
  jobFamilies?: string[];
  extraTabs?: string[];
  canSeeIndividual?: boolean | null;
  expiresAt?: string | null;
}

export interface HistoricoRow {
  /** Quem FEZ a mudanca (o admin), nao quem a sofreu. */
  email: string;
  action: string;
  created_at: string;
  metadata: {
    alvo?: string;
    de?: PermissaoSnapshot;
    para?: PermissaoSnapshot;
  } | null;
}

export const getAccessLogs = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    const { data, error } = await supabaseAdmin
      .from('access_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    return data || [];
  });


/**
 * Registra uma mudanca de permissao.
 *
 * Fica em `access_logs` com `action` proprio, e nao numa tabela nova, porque a
 * pergunta que isto responde ("quem deu esse acesso, e quando?") sempre vem
 * junto da outra ("e o que essa pessoa andou vendo?"). Duas tabelas fariam a
 * resposta exigir duas consultas e uma juncao mental.
 *
 * `alvo` no metadata e o e-mail de QUEM SOFREU a mudanca; a coluna `email` e
 * de quem a FEZ. Confundir os dois inverteria o sentido do registro.
 */
async function registrarMudanca(
  autor: string,
  acao: 'permissao_criada' | 'permissao_alterada' | 'permissao_removida',
  alvo: string,
  de: PermissaoSnapshot | null,
  para: PermissaoSnapshot | null,
): Promise<void> {
  const { supabaseAdmin } = await import('./access-rules.server');
  try {
    await (supabaseAdmin as unknown as {
      from: (t: string) => { insert: (v: unknown) => PromiseLike<{ error: unknown }> };
    }).from('access_logs').insert({
      email: autor,
      action: acao,
      allowed: true,
      metadata: { alvo: alvo.toLowerCase(), ...(de ? { de } : {}), ...(para ? { para } : {}) },
    });
  } catch (e) {
    // Falhar em registrar NAO pode impedir a mudanca: o admin ficaria sem
    // conseguir corrigir um acesso errado por causa do log.
    console.error('Falha ao registrar mudanca de permissao:', e);
  }
}

/** Le a linha atual para o "de" do diff. Sem ela o historico so teria o depois. */
async function fotoAtual(id: string): Promise<{ email: string; foto: PermissaoSnapshot } | null> {
  const { supabaseAdmin } = await import('./access-rules.server');
  const { data } = await supabaseAdmin
    .from('allowed_emails')
    .select('email, profile, departments, job_families, extra_tabs, can_see_individual, expires_at')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as {
    email: string; profile: string; departments: string[]; job_families: string[];
    extra_tabs: string[]; can_see_individual: boolean | null; expires_at: string | null;
  };
  return {
    email: r.email,
    foto: {
      profile: r.profile,
      departments: r.departments ?? [],
      jobFamilies: r.job_families ?? [],
      extraTabs: r.extra_tabs ?? [],
      canSeeIndividual: r.can_see_individual ?? null,
      expiresAt: r.expires_at ?? null,
    },
  };
}

export const addAllowedEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => AddAllowedEmailSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    if (
      isScopedProfileValue(data.profile) &&
      data.departments.length === 0 &&
      data.jobFamilies.length === 0
    ) {
      throw new Error(SCOPED_REQUIRES_SCOPE_MESSAGE);
    }

    const scoped = isScopedProfileValue(data.profile);
    const { error } = await supabaseAdmin.from('allowed_emails').insert({
      email: data.email.toLowerCase(),
      role: roleForProfile(data.profile),
      // `profile` e text no banco. Os tipos gerados do Supabase ainda listam a
      // uniao antiga de perfis -- somem na proxima geracao. O valor ja foi
      // validado por ProfileSchema no inputValidator.
      profile: data.profile as unknown as never,
      departments: scoped ? data.departments : [],
      job_families: scoped ? data.jobFamilies : [],
      job_title: data.jobTitle || null,
      job_level: data.jobLevel || null,
      responsibilities: data.responsibilities,
      extra_tabs: data.extraTabs,
      can_see_individual: data.canSeeIndividual,
      expires_at: data.expiresAt,
    } as never);

    if (error) throw new Error(error.message);

    await registrarMudanca(
      (context.claims.email as string) ?? '?', 'permissao_criada', data.email, null,
      {
        profile: data.profile,
        departments: scoped ? data.departments : [],
        jobFamilies: scoped ? data.jobFamilies : [],
        extraTabs: data.extraTabs,
        canSeeIndividual: data.canSeeIndividual,
        expiresAt: data.expiresAt,
      },
    );
    return { success: true };
  });

/** Atualiza perfil, escopo, cargo, level e responsabilidades de um usuario. */
export const updateAllowedEmailUser = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => UpdateAllowedEmailUserSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    if (
      isScopedProfileValue(data.profile) &&
      data.departments.length === 0 &&
      data.jobFamilies.length === 0
    ) {
      throw new Error(SCOPED_REQUIRES_SCOPE_MESSAGE);
    }

    // Le ANTES de escrever: sem o "de", o historico so contaria metade e a
    // pergunta "o que essa pessoa tinha antes?" continuaria sem resposta.
    const antes = await fotoAtual(data.id);

    const scoped = isScopedProfileValue(data.profile);
    const { error } = await supabaseAdmin
      .from('allowed_emails')
      .update({
        role: roleForProfile(data.profile),
        // Ver nota em addAllowedEmail: tipos gerados desatualizados.
        profile: data.profile as unknown as never,
        departments: scoped ? data.departments : [],
        job_families: scoped ? data.jobFamilies : [],
        job_title: data.jobTitle || null,
        job_level: data.jobLevel || null,
        responsibilities: data.responsibilities,
        extra_tabs: data.extraTabs,
        can_see_individual: data.canSeeIndividual,
        expires_at: data.expiresAt,
      } as never)
      .eq('id', data.id);

    if (error) throw new Error(error.message);

    if (antes) {
      await registrarMudanca(
        (context.claims.email as string) ?? '?', 'permissao_alterada', antes.email,
        antes.foto,
        {
          profile: data.profile,
          departments: scoped ? data.departments : [],
          jobFamilies: scoped ? data.jobFamilies : [],
          extraTabs: data.extraTabs,
          canSeeIndividual: data.canSeeIndividual,
          expiresAt: data.expiresAt,
        },
      );
    }
    return { success: true };
  });

export const removeAllowedEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => RemoveAllowedEmailSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    // Guarda o que a pessoa tinha antes de sumir. Sem isto, uma remocao
    // acidental deixaria o registro "fulano foi removido" e nenhuma pista de
    // como recriar o acesso que ele tinha.
    const antes = await fotoAtual(data.id);

    const { error } = await supabaseAdmin.from('allowed_emails').delete().eq('id', data.id);

    if (error) throw new Error(error.message);

    if (antes) {
      await registrarMudanca(
        (context.claims.email as string) ?? '?', 'permissao_removida', antes.email,
        antes.foto, null,
      );
    }
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Lote
// ---------------------------------------------------------------------------

/**
 * Aplica a mesma mudança a vários usuários.
 *
 * ===========================================================================
 * POR QUE ISTO GRAVA UM POR UM, E NÃO NUM UPDATE SÓ
 * ===========================================================================
 * Um `update ... in (ids)` seria uma linha de código e uma consulta. Mas cada
 * pessoa tem um escopo DIFERENTE: somar TECHNOLOGY a quarenta usuários não é
 * a mesma escrita quarenta vezes, é quarenta escritas distintas.
 *
 * E, principalmente: o histórico "de → para" que acabamos de criar precisa de
 * um registro POR PESSOA. Um lote que gravasse de uma vez deixaria no log uma
 * única linha dizendo "quarenta pessoas mudaram", e a pergunta que o log
 * existe para responder -- "o que ESTE usuário tinha antes?" -- voltaria a
 * não ter resposta. O lote seria o buraco na auditoria que o resto fechou.
 */
export const bulkUpdateAllowedEmails = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => BulkUpdateSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);
    const autor = (context.claims.email as string) ?? '?';

    const { data: linhas, error: eLer } = await supabaseAdmin
      .from('allowed_emails')
      .select('id, email, profile, departments, job_families, extra_tabs, can_see_individual, expires_at')
      .in('id', data.ids);
    if (eLer) throw new Error(eLer.message);

    const somar = data.addDepartments.map((d) => d.trim().toUpperCase());
    const tirar = new Set(data.removeDepartments.map((d) => d.trim().toUpperCase()));

    const aplicados: string[] = [];
    const recusados: Array<{ email: string; motivo: string }> = [];

    for (const bruta of (linhas ?? []) as unknown as Array<{
      id: string; email: string; profile: string; departments: string[] | null;
      job_families: string[] | null; extra_tabs: string[] | null;
      can_see_individual: boolean | null; expires_at: string | null;
    }>) {
      const perfilNovo = (data.profile ?? bruta.profile) as AccessProfileValue;
      const depts = [...new Set([...(bruta.departments ?? []), ...somar])]
        .filter((d) => !tirar.has(d));
      const familias = bruta.job_families ?? [];

      // A mesma regra do cadastro individual: perfil escopado sem escopo é
      // cadastro pela metade. Em lote isso apareceria como "salvou" e a
      // pessoa ficaria sem ver nada, sem ninguem entender por que.
      if (isScopedProfileValue(perfilNovo) && depts.length === 0 && familias.length === 0) {
        recusados.push({ email: bruta.email, motivo: SCOPED_REQUIRES_SCOPE_MESSAGE });
        continue;
      }

      const escopado = isScopedProfileValue(perfilNovo);
      const expira = data.expiresAt === undefined ? bruta.expires_at : data.expiresAt;

      const { error } = await supabaseAdmin
        .from('allowed_emails')
        .update({
          role: roleForProfile(perfilNovo),
          profile: perfilNovo as unknown as never,
          departments: escopado ? depts : [],
          job_families: escopado ? familias : [],
          expires_at: expira,
        } as never)
        .eq('id', bruta.id);

      if (error) { recusados.push({ email: bruta.email, motivo: error.message }); continue; }

      await registrarMudanca(autor, 'permissao_alterada', bruta.email,
        {
          profile: bruta.profile, departments: bruta.departments ?? [],
          jobFamilies: familias, extraTabs: bruta.extra_tabs ?? [],
          canSeeIndividual: bruta.can_see_individual, expiresAt: bruta.expires_at,
        },
        {
          profile: perfilNovo, departments: escopado ? depts : [],
          jobFamilies: escopado ? familias : [], extraTabs: bruta.extra_tabs ?? [],
          canSeeIndividual: bruta.can_see_individual, expiresAt: expira,
        },
      );
      aplicados.push(bruta.email);
    }

    return { aplicados, recusados };
  });

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Exporta a base inteira no MESMO formato que a importação lê. */
export const exportAllowedEmailsCsv = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);
    const { gerarCsv } = await import('./access-csv');

    const { data, error } = await supabaseAdmin
      .from('allowed_emails')
      .select('email, profile, departments, job_families, extra_tabs, job_title, job_level, expires_at, can_see_individual, last_login_at')
      .order('email');
    if (error) throw new Error(error.message);

    // A exportação é uma leitura de TODA a base de permissões. Fica no mesmo
    // log que o resto -- quem exportou levou a lista inteira para fora do
    // sistema, e isso é exatamente o tipo de coisa que se quer reconstruir.
    await registrarMudanca(
      (context.claims.email as string) ?? '?', 'permissao_alterada', 'exportacao-csv',
      null, { profile: `${(data ?? []).length} usuários exportados` },
    );

    return { csv: gerarCsv((data ?? []) as never), linhas: (data ?? []).length };
  });

export interface PreviaImportacaoLinha {
  email: string;
  acao: 'criar' | 'atualizar' | 'sem mudanca';
  /** Resumo do que muda, em português, para conferir sem ler JSON. */
  mudancas: string[];
}

/**
 * Importa usuários de um CSV. Sem `confirm`, só diz o que FARIA.
 *
 * ===========================================================================
 * PRÉVIA OBRIGATÓRIA
 * ===========================================================================
 * É o mesmo padrão dos outros importadores do painel (Convenia, inHire,
 * Polly), e aqui ele pesa mais: os outros importam NÚMEROS, este importa
 * PERMISSÃO. Um arquivo com a coluna trocada não quebra nada -- concede
 * acesso a quem não devia, em silêncio, para várias pessoas de uma vez.
 *
 * A prévia mostra linha a linha o que muda. Só depois disso grava.
 */
export const importAllowedEmailsCsv = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => ImportCsvSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);
    const autor = (context.claims.email as string) ?? '?';

    const { lerCsv } = await import('./access-csv');
    const { ALL_TABS } = await import('./permissions');
    const leitura = lerCsv(data.texto, ALL_TABS);

    const { data: existentes } = await supabaseAdmin
      .from('allowed_emails')
      .select('id, email, profile, departments, job_families, extra_tabs, can_see_individual, expires_at');

    const porEmail = new Map<string, {
      id: string; email: string; profile: string; departments: string[] | null;
      job_families: string[] | null; extra_tabs: string[] | null;
      can_see_individual: boolean | null; expires_at: string | null;
    }>();
    for (const r of (existentes ?? []) as never[]) {
      const x = r as unknown as { email: string };
      porEmail.set(x.email.toLowerCase(), r as never);
    }

    const problemas = [...leitura.problemas];
    const previa: PreviaImportacaoLinha[] = [];

    // Departamentos ativos: o trigger recusa inativo, e descobrir isso só na
    // hora de gravar deixaria metade do arquivo dentro e metade fora.
    const { data: deps } = await supabaseAdmin.from('departments').select('name, active');
    const ativos = new Set(
      ((deps ?? []) as Array<{ name: string; active: boolean }>)
        .filter((d) => d.active).map((d) => d.name),
    );

    const aplicaveis: Array<{ linha: (typeof leitura.linhas)[number]; atual: ReturnType<typeof porEmail.get> }> = [];

    for (const l of leitura.linhas) {
      const inativo = l.departments.filter((d) => !ativos.has(d));
      if (inativo.length) {
        problemas.push({
          linha: 0, email: l.email,
          motivo: `Departamento não existe ou está inativo no catálogo: ${inativo.join(', ')}.`,
        });
        continue;
      }
      const perfil = l.profile as AccessProfileValue;
      if (isScopedProfileValue(perfil) && !l.departments.length && !l.jobFamilies.length) {
        problemas.push({ linha: 0, email: l.email, motivo: SCOPED_REQUIRES_SCOPE_MESSAGE });
        continue;
      }

      const atual = porEmail.get(l.email);
      const mudancas: string[] = [];
      if (!atual) {
        mudancas.push(`novo acesso como ${l.profile}`);
        if (l.departments.length) mudancas.push(`áreas: ${l.departments.join(', ')}`);
      } else {
        if (atual.profile !== l.profile) mudancas.push(`perfil ${atual.profile} → ${l.profile}`);
        const de = (atual.departments ?? []).join(',');
        const para = l.departments.join(',');
        if (de !== para) mudancas.push(`áreas ${de || '—'} → ${para || '—'}`);
        const deTabs = (atual.extra_tabs ?? []).join(',');
        if (deTabs !== l.extraTabs.join(',')) {
          mudancas.push(`abas ${deTabs || '—'} → ${l.extraTabs.join(',') || '—'}`);
        }
        const indNovo = l.canSeeIndividual === '' ? null : l.canSeeIndividual === 'sim';
        if ((atual.can_see_individual ?? null) !== indNovo) {
          mudancas.push(`dado individual → ${indNovo == null ? 'padrão do perfil' : indNovo ? 'sim' : 'não'}`);
        }
        const expNovo = l.expiresAt ? new Date(l.expiresAt).toISOString() : null;
        if ((atual.expires_at ?? null) !== expNovo) {
          mudancas.push(`validade → ${expNovo ? expNovo.slice(0, 10) : 'sem prazo'}`);
        }
      }

      previa.push({
        email: l.email,
        acao: !atual ? 'criar' : mudancas.length ? 'atualizar' : 'sem mudanca',
        mudancas,
      });
      if (!atual || mudancas.length) aplicaveis.push({ linha: l, atual });
    }

    const resumo = {
      criar: previa.filter((p) => p.acao === 'criar').length,
      atualizar: previa.filter((p) => p.acao === 'atualizar').length,
      semMudanca: previa.filter((p) => p.acao === 'sem mudanca').length,
      problemas,
      ignorados: leitura.ignorados,
      previa,
      gravado: false,
    };

    if (!data.confirm) return resumo;

    for (const { linha: l, atual } of aplicaveis) {
      const perfil = l.profile as AccessProfileValue;
      const escopado = isScopedProfileValue(perfil);
      const campos = {
        role: roleForProfile(perfil),
        profile: perfil as unknown as never,
        departments: escopado ? l.departments : [],
        job_families: escopado ? l.jobFamilies : [],
        job_title: l.jobTitle || null,
        job_level: l.jobLevel || null,
        extra_tabs: l.extraTabs,
        can_see_individual: l.canSeeIndividual === '' ? null : l.canSeeIndividual === 'sim',
        expires_at: l.expiresAt ? new Date(l.expiresAt).toISOString() : null,
      };

      const depois = {
        profile: l.profile, departments: campos.departments, jobFamilies: campos.job_families,
        extraTabs: l.extraTabs, canSeeIndividual: campos.can_see_individual,
        expiresAt: campos.expires_at,
      };

      if (atual) {
        const { error } = await supabaseAdmin.from('allowed_emails')
          .update(campos as never).eq('id', atual.id);
        if (error) { problemas.push({ linha: 0, email: l.email, motivo: error.message }); continue; }
        await registrarMudanca(autor, 'permissao_alterada', l.email, {
          profile: atual.profile, departments: atual.departments ?? [],
          jobFamilies: atual.job_families ?? [], extraTabs: atual.extra_tabs ?? [],
          canSeeIndividual: atual.can_see_individual, expiresAt: atual.expires_at,
        }, depois);
      } else {
        const { error } = await supabaseAdmin.from('allowed_emails')
          .insert({ email: l.email, responsibilities: [], ...campos } as never);
        if (error) { problemas.push({ linha: 0, email: l.email, motivo: error.message }); continue; }
        await registrarMudanca(autor, 'permissao_criada', l.email, null, depois);
      }
    }

    return { ...resumo, problemas, gravado: true };
  });

/** Catalogo de departamentos — leitura para qualquer usuario autenticado. */
export const getDepartments = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('departments')
      .select('id, name, aliases, active')
      .order('name');

    if (error) throw new Error(error.message);
    return data || [];
  });

export const addDepartment = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => AddDepartmentSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    const { error } = await supabaseAdmin.from('departments').insert({
      name: data.name.toUpperCase(),
      aliases: data.aliases,
    });

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const setDepartmentActive = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => SetDepartmentActiveSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    const { error } = await supabaseAdmin
      .from('departments')
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq('id', data.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });
