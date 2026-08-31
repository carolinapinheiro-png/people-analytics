import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Eye, X } from 'lucide-react';
import { definirVerComo, inscreverVerComo, lerVerComo } from '@/lib/ver-como/estado';
import { useAuth } from '@/contexts/AuthContext';
import { PROFILE_LABELS, type AccessProfile } from '@/lib/permissions';

/**
 * A faixa que avisa que o painel está sendo visto pelos olhos de outra pessoa.
 *
 * ===========================================================================
 * POR QUE ELA É FEIA DE PROPÓSITO
 * ===========================================================================
 * O risco desta funcionalidade não é vazamento -- é esquecimento. Os números
 * mostrados durante uma simulação são TODOS verdadeiros; só estão recortados
 * pelo escopo de outra pessoa. Quem esquece que está simulando lê "atrição de
 * 4%" e conta isso numa reunião achando que é da empresa, quando é de uma
 * área. Esse erro não deixa rastro: nada quebra, nada fica vazio.
 *
 * Por isso a faixa fica no topo, colorida, em toda tela, sem poder ser
 * fechada a não ser saindo da simulação. É o único aviso que existe.
 *
 * ===========================================================================
 * POR QUE ELA LÊ O sessionStorage, E NÃO O SERVIDOR
 * ===========================================================================
 * Se dependesse da resposta do servidor, uma falha de rede -- ou um alvo
 * removido do cadastro no meio da conferência -- deixaria a pessoa presa: em
 * simulação, sem faixa, e sem botão de sair. Lendo o estado local, o botão de
 * sair funciona sempre, inclusive na tela de erro.
 */
export default function FaixaVerComo() {
  const [alvo, setAlvo] = useState<string | null>(null);
  const { accessStatus, verComo } = useAuth();
  const faixaRef = useRef<HTMLDivElement | null>(null);

  // ======================================================================
  // A FAIXA E O CABEÇALHO DISPUTAVAM O MESMO topo
  // ======================================================================
  // Os dois são `sticky top-0`. A faixa tem z-index maior, então ela ficava
  // POR CIMA do cabeçalho: "Flutter Brazil · People Analytics" e o aviso de
  // simulação escritos um sobre o outro, ilegíveis.
  //
  // Apareceu no primeiro uso real do "ver como" -- ninguém tinha simulado
  // ninguém desde que a faixa existe.
  //
  // A altura vai para uma variável de CSS e o cabeçalho gruda ABAIXO dela.
  // Medida em vez de fixada porque a faixa quebra em duas linhas em tela
  // estreita, e um valor cravado deixaria uma fresta ou uma sobreposição
  // menor -- que é pior, porque ninguém nota e ela fica.
  useEffect(() => {
    const raiz = document.documentElement;
    const el = faixaRef.current;
    if (!el) {
      raiz.style.setProperty('--faixa-ver-como', '0px');
      return;
    }
    const medir = () => {
      raiz.style.setProperty('--faixa-ver-como', `${el.offsetHeight}px`);
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => {
      obs.disconnect();
      // Zerar ao sair da simulação: sem isto o cabeçalho ficaria grudado
      // quarenta pixels abaixo do topo para sempre.
      raiz.style.setProperty('--faixa-ver-como', '0px');
    };
  }, [alvo, accessStatus, verComo]);

  // O estado nasce no cliente: ler no primeiro render quebraria a hidratacao
  // (servidor nao tem sessionStorage e renderizaria sem a faixa).
  useEffect(() => {
    setAlvo(lerVerComo());
    return inscreverVerComo(() => setAlvo(lerVerComo()));
  }, []);

  if (!alvo) return null;

  // ======================================================================
  // O ESTADO PERIGOSO: O NAVEGADOR ACHA QUE SIMULA, O SERVIDOR NAO SABE
  // ======================================================================
  // Acontece se o middleware global parar de anexar o cabecalho -- por um
  // erro de registro em start.ts, por um proxy que remove cabecalhos
  // desconhecidos, por uma versao antiga em cache. A tela mostraria os dados
  // do ADMIN com a faixa dizendo que sao de outra pessoa: o inverso exato do
  // que a conferencia quer provar, e do jeito mais convincente possivel.
  //
  // Como nada quebra sozinho nesse cenario, o alarme precisa ser explicito.
  const naoChegou = accessStatus === 'allowed' && verComo?.email !== alvo;

  if (naoChegou) {
    return (
      <div
        ref={faixaRef}
        role="alert"
        className="sticky top-0 z-[60] flex items-center justify-center gap-3 border-b border-red-500/50 bg-red-500/20 px-4 py-2 text-red-900 dark:text-red-200"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-sm">
          O pedido para ver como <strong>{alvo}</strong> não chegou ao servidor. O que
          está na tela é a <strong>sua</strong> visão, não a dessa pessoa — não use
          isto para conferir acesso.
        </span>
        <button
          onClick={sairVerComo}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-600/50 px-2 py-1 text-xs font-semibold hover:bg-red-500/25"
        >
          <X className="h-3 w-3" /> Sair
        </button>
      </div>
    );
  }

  const perfil = verComo?.profile
    ? PROFILE_LABELS[verComo.profile as AccessProfile] ?? verComo.profile
    : null;

  return (
    <div
      role="status"
      ref={faixaRef}
      className="sticky top-0 z-[60] flex items-center justify-center gap-3 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-amber-900 dark:text-amber-200"
    >
      <Eye className="h-4 w-4 shrink-0" />
      <span className="text-sm">
        Você está vendo o painel <strong>como {alvo}</strong>
        {perfil ? ` (${perfil})` : ''}. Os números na tela são os que essa pessoa
        enxerga — não os da empresa inteira.
      </span>
      <button
        onClick={sairVerComo}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-600/50 px-2 py-1 text-xs font-semibold hover:bg-amber-500/25"
      >
        <X className="h-3 w-3" /> Sair
      </button>
    </div>
  );
}

/**
 * Entrar e sair recarregam a página inteira.
 *
 * Não é preguiça de invalidar cache: é a garantia. O painel guarda dado em
 * vários lugares (contexto do dashboard, estado de cada aba, react-query).
 * Trocar de identidade sem recarregar deixaria qualquer um deles servindo o
 * resultado da identidade anterior -- e o modo como isso apareceria na tela é
 * exatamente o que se está tentando conferir. Recarregar não deixa dúvida.
 */
export function entrarVerComo(email: string): void {
  definirVerComo(email);
  if (typeof window !== 'undefined') window.location.assign('/');
}

export function sairVerComo(): void {
  definirVerComo(null);
  if (typeof window !== 'undefined') window.location.reload();
}
