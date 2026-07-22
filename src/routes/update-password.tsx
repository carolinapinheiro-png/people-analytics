import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import UpdatePasswordPage from '@/pages/UpdatePasswordPage';

export const Route = createFileRoute('/update-password')({
  component: UpdatePasswordPage,
  validateSearch: z.object({
    token: z.string().optional(),
    code: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: 'Atualizar Senha · People Analytics' },
      { name: 'description', content: 'Update your password for People Analytics' },
      { property: 'og:title', content: 'Atualizar Senha · People Analytics' },
      { property: 'og:description', content: 'Update your password for People Analytics' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
});
