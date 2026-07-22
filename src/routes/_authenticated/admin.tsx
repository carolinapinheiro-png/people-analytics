import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useAuth } from '@/contexts/AuthContext';
import AdminPage from '@/pages/AdminPage';

export const Route = createFileRoute('/_authenticated/admin')({
  component: AdminRoute,
  head: () => ({
    meta: [
      { title: 'Admin · People Analytics' },
      { name: 'description', content: 'Manage access for People Analytics' },
      { property: 'og:title', content: 'Admin · People Analytics' },
      { property: 'og:description', content: 'Manage access for People Analytics' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
});

function AdminRoute() {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <AdminPage />;
}
