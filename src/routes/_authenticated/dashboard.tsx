import { createFileRoute } from '@tanstack/react-router';
import Dashboard from '@/pages/Index';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: 'Dashboard · People Analytics' },
      { name: 'description', content: 'People Analytics dashboard for Flutter Brazil' },
      { property: 'og:title', content: 'Dashboard · People Analytics' },
      { property: 'og:description', content: 'People Analytics dashboard for Flutter Brazil' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
});
