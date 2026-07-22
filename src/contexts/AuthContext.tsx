import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { checkAccess } from '@/lib/access.functions';
import { useServerFn } from '@tanstack/react-start';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAllowed: boolean | null;
  role: 'admin' | 'viewer' | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  googleSignIn: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
  const [role, setRole] = useState<'admin' | 'viewer' | null>(null);
  const checkAccessFn = useServerFn(checkAccess);

  const verifyAccess = useCallback(async () => {
    try {
      const result = await checkAccessFn();
      setIsAllowed(result.allowed);
      setRole(result.role);
      return result.allowed;
    } catch (error) {
      console.error('Access check failed:', error);
      setIsAllowed(false);
      setRole(null);
      return false;
    }
  }, [checkAccessFn]);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await verifyAccess();
        } else {
          setIsAllowed(null);
          setRole(null);
        }
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [verifyAccess]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const allowed = await verifyAccess();
    if (!allowed) {
      await supabase.auth.signOut();
      throw new Error('Acesso negado: seu email não está na lista de usuários autorizados.');
    }
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    const allowed = await verifyAccess();
    if (!allowed) {
      await supabase.auth.signOut();
      throw new Error('Acesso negado: seu email não está na lista de usuários autorizados.');
    }
  };

  const googleSignIn = async () => {
    const result = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin,
    });
    if (result.error) throw result.error;
    if (!result.redirected) {
      await verifyAccess();
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setIsAllowed(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAllowed,
        role,
        signIn,
        signUp,
        signOut,
        googleSignIn,
        isAdmin: role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
