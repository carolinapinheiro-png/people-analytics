import { createFileRoute } from '@tanstack/react-router';
import LoginPage from '@/pages/LoginPage';

export const Route = createFileRoute('/login')({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: 'Entrar · People Analytics' },
      { name: 'description', content: 'Acesso restrito ao People Analytics da Flutter Brazil.' },
      { property: 'og:title', content: 'Entrar · People Analytics' },
      {
        property: 'og:description',
        content: 'Acesso restrito ao People Analytics da Flutter Brazil.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
});
