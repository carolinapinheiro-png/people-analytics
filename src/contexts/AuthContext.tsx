import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAllowed: boolean | null;
  role: 'admin' | 'viewer' | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  checkAccess: () => Promise<boolean>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
  const [role, setRole] = useState<'admin' | 'viewer' | null>(null);

  const checkAccess = async (): Promise<boolean> => {
    const currentSession = await supabase.auth.getSession();
    const accessToken = currentSession.data.session?.access_token;
    if (!accessToken) {
      setIsAllowed(false);
      setRole(null);
      return false;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-access`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      const allowed = response.ok && result.allowed === true;
      setIsAllowed(allowed);
      setRole(allowed && result.role === 'admin' ? 'admin' : allowed ? 'viewer' : null);
      return allowed;
    } catch (error) {
      console.error('Error checking access:', error);
      setIsAllowed(false);
      setRole(null);
      return false;
    }
  };

  useEffect(() => {
    // 1. ALWAYS register the auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await checkAccess();
        } else {
          setIsAllowed(null);
        }
        setLoading(false);
      }
    );

    // 2. Listen for OAuth tokens from popup via postMessage
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'supabase-auth') return;

      const { access_token, refresh_token } = event.data;
      if (access_token && refresh_token) {
        supabase.auth.setSession({ access_token, refresh_token });
      }
    };
    window.addEventListener('message', handleMessage);

    // 3. Check for OAuth tokens stored in localStorage (fallback when popup
    //    was opened as a new tab due to popup blockers)
    const storedTokens = localStorage.getItem('supabase-oauth-tokens');
    if (storedTokens) {
      localStorage.removeItem('supabase-oauth-tokens');
      try {
        const { access_token, refresh_token } = JSON.parse(storedTokens);
        if (access_token && refresh_token) {
          supabase.auth.setSession({ access_token, refresh_token });
        }
      } catch {}
    }

    // 4. Normal flow — check existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await checkAccess();
      }
      setLoading(false);
    });

    // 5. Periodic access re-check (every 60s) to revoke access in real-time
    const interval = setInterval(() => {
      if (user) {
        checkAccess();
      }
    }, 60000);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('message', handleMessage);
      clearInterval(interval);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const allowed = await checkAccess();
    if (!allowed) {
      await supabase.auth.signOut();
      throw new Error('Acesso negado: seu email não está na lista de usuários autorizados.');
    }
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setIsAllowed(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAllowed, signIn, signUp, signOut, checkAccess }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
