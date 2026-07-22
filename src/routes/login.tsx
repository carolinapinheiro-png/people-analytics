import { createFileRoute } from '@tanstack/react-router';
import LoginPage from '@/pages/LoginPage';

export const Route = createFileRoute('/login')({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: 'Login · People Analytics' },
      { name: 'description', content: 'Sign in to People Analytics' },
      { property: 'og:title', content: 'Login · People Analytics' },
      { property: 'og:description', content: 'Sign in to People Analytics' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
});
