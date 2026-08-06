import { createFileRoute } from '@tanstack/react-router';
import LoginPage from '@/pages/LoginPage';

export const Route = createFileRoute('/login')({
  // `next` preserves an in-app destination (e.g. the OAuth consent screen)
  // across the sign-in flow. Validated as a same-origin relative path.
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next:
      typeof s.next === 'string' && s.next.startsWith('/') && !s.next.startsWith('//')
        ? s.next
        : undefined,
  }),
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
