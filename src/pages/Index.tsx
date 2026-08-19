import React from 'react';
import { DashboardProvider, useDashboard } from '@/data/DashboardContext';
import { basesSemDado } from '@/lib/cobertura';
import { Button } from '@/components/ui/button';
import TopBar from '@/components/layout/TopBar';
import FilterBar from '@/components/layout/FilterBar';
import TabNavigation from '@/components/layout/TabNavigation';
import SideNav from '@/components/layout/SideNav';
import Breadcrumbs from '@/components/layout/Breadcrumbs';

import OverviewTab from '@/components/tabs/OverviewTab';
import TeamTab from '@/components/tabs/TeamTab';
import CompensationTab from '@/components/tabs/CompensationTab';
import ProfileTab from '@/components/tabs/ProfileTab';
import DataTab from '@/components/tabs/DataTab';
import LeaversGate from '@/components/dashboard/LeaversGate';
import DEITab from '@/components/tabs/DEITab';
import DemographicsTab from '@/components/tabs/DemographicsTab';
import EngagementTab from '@/components/tabs/EngagementTab';
import SpanTab from '@/components/tabs/SpanTab';
import AttritionTab from '@/components/tabs/AttritionTab';
import RecruitmentTab from '@/components/tabs/RecruitmentTab';


/**
 * A queda para a série congelada deixa de ser muda.
 *
 * O painel prefere série velha a tela vazia -- isso está certo. O que estava
 * errado era não dizer. Em agosto/2026 a série do Convenia inteira nasceu
 * marcada como 'parcial', sumiu no filtro de leitura, e o painel passou a
 * exibir a cópia congelada, que termina em jun/26. Ficou assim até alguém
 * reparar que o seletor de mês não avançava.
 *
 * A faixa aparece SÓ quando a queda acontece. Aviso que fica sempre na tela
 * deixa de ser lido em uma semana.
 */
function AvisoSerie() {
  const { serie } = useDashboard();
  if (!serie || serie.fonte !== 'congelada') return null;
  return (
    <div className="mx-4 md:mx-6 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
      <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
        <strong>Série de reserva no ar.</strong> A série oficial (Convenia) não
        retornou nenhuma linha, então o painel está mostrando a cópia congelada,
        que vai até {serie.ultimoMes ?? '—'}. Os números continuam válidos até
        essa data — mas não incluem os meses seguintes. Rode a sincronização do
        Convenia; se o problema persistir, é filtro de qualidade descartando a
        série inteira.
      </p>
    </div>
  );
}

/**
 * Ano escolhido que não alcança todas as bases.
 *
 * O rótulo da lista já avisa antes do clique ("2017 · só quadro"). Isto é o
 * lembrete depois: quem chega por link, por atalho ou volta à sessão de ontem
 * não passou pela lista, e encontraria três abas vazias sem explicação.
 *
 * Vazio por não ter sido coletado e vazio por não ter acontecido são a mesma
 * tela e pedem reações opostas -- a primeira é buscar o dado, a segunda é
 * comemorar. É o terceiro lugar deste painel onde essa distinção precisou
 * virar texto.
 */
function AvisoAno() {
  const { activeYear, cobertura } = useDashboard();
  const faltando = basesSemDado(activeYear, cobertura);
  if (!faltando.length) return null;
  const abas = [...new Set(faltando.flatMap((c) => c.abas))];
  return (
    <div className="mx-4 md:mx-6 mt-3 rounded-lg border border-border bg-secondary/40 px-3 py-2">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Em <strong className="text-foreground">{activeYear}</strong> só existe a
        série de quadro. {abas.length === 1 ? 'A aba' : 'As abas'}{' '}
        <strong className="text-foreground">{abas.join(', ')}</strong>{' '}
        {abas.length === 1 ? 'aparece vazia' : 'aparecem vazias'} — a coleta
        começou depois ({faltando.map((c) => `${c.label.toLowerCase()} em ${c.primeiroAno ?? '—'}`).join('; ')}).
        Vazio aqui é dado que não existe, não ausência de acontecimento.
      </p>
    </div>
  );
}

function DashboardContent() {
  const { activeTab, dataLoading, dataError } = useDashboard();

  // A serie mensal agora vem do banco. Ate carregar, nao renderiza as abas --
  // elas assumem que ha dados e quebrariam com lista vazia.
  if (dataLoading) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="flex items-center justify-center py-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="max-w-md mx-auto text-center py-32 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Não foi possível carregar os indicadores
          </h2>
          <p className="text-sm text-muted-foreground">{dataError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <div className="hidden md:block">
        <SideNav />
      </div>
      <div className="min-w-0 flex-1">
        <TopBar />
        <AvisoSerie />
        <AvisoAno />
        <Breadcrumbs />
        <FilterBar />
        <div className="md:hidden">
          <TabNavigation />
        </div>
        <main className="p-4 md:p-6 max-w-[1600px] mx-auto">
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'team' && <TeamTab />}
          {activeTab === 'recruitment' && <RecruitmentTab />}
          {activeTab === 'dei' && <DEITab />}
          {activeTab === 'comp' && <CompensationTab />}
          {activeTab === 'demographics' && <DemographicsTab />}
          {activeTab === 'engagement' && <EngagementTab />}
          {activeTab === 'span' && <SpanTab />}
          {activeTab === 'attrition' && <LeaversGate><AttritionTab /></LeaversGate>}
          {activeTab === 'individual' && <ProfileTab />}
          {activeTab === 'data' && <DataTab />}
        </main>
      </div>
    </div>
  );
}


export default function Index() {
  return (
    <DashboardProvider>
      <DashboardContent />
    </DashboardProvider>
  );
}
