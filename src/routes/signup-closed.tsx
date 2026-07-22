import { createFileRoute } from '@tanstack/react-router';
import SignupClosedPage from '@/pages/SignupClosedPage';

export const Route = createFileRoute('/signup-closed')({
  component: SignupClosedPage,
  head: () => ({
    meta: [
      { title: 'Cadastros Fechados · People Analytics' },
      { name: 'description', content: 'Sign-ups are closed for People Analytics' },
      { property: 'og:title', content: 'Cadastros Fechados · People Analytics' },
      { property: 'og:description', content: 'Sign-ups are closed for People Analytics' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
});
