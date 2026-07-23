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

const ACCESS_DENIED_MESSAGE =
  'Acesso negado: seu email não está na lista de usuários autorizados.';
export const ACCESS_DENIED_STORAGE_KEY = 'auth:access-denied';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
  const [role, setRole] = useState<'admin' | 'viewer' | null>(null);
  const checkAccessFn = useServerFn(checkAccess);

  // Enforces authorization: if the check returns allowed=false, immediately
  // terminate the Supabase session so no valid JWT lingers in memory/storage
  // regardless of whether the login came from the password form or OAuth.
  const verifyAccess = useCallback(async () => {
    let allowed = false;
    try {
      const result = await checkAccessFn();
      allowed = !!result.allowed;
      if (allowed) {
        setIsAllowed(true);
        setRole(result.role);
        return true;
      }
    } catch (error) {
      console.error('Access check failed:', error);
    }
    // Denied path: clear local state first, then sign out. The SIGNED_OUT
    // event that follows sees session=null and skips verifyAccess (no loop).
    setIsAllowed(false);
    setRole(null);
    setUser(null);
    setSession(null);
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(ACCESS_DENIED_STORAGE_KEY, ACCESS_DENIED_MESSAGE);
      }
    } catch {
      // sessionStorage may be unavailable; message is best-effort.
    }
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Sign-out after denied access failed:', error);
    }
    return false;
  }, [checkAccessFn]);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        if (!session?.user) {
          // Covers SIGNED_OUT and initial no-session — never re-verify here,
          // which prevents a loop after verifyAccess triggers a signOut.
          setSession(null);
          setUser(null);
          setIsAllowed(null);
          setRole(null);
          setLoading(false);
          return;
        }
        if (
          event !== 'SIGNED_IN' &&
          event !== 'USER_UPDATED' &&
          event !== 'INITIAL_SESSION'
        ) {
          // Ignore TOKEN_REFRESHED and similar — no identity change.
          setSession(session);
          setUser(session.user);
          setLoading(false);
          return;
        }
        setSession(session);
        setUser(session.user);
        await verifyAccess();
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
      throw new Error(ACCESS_DENIED_MESSAGE);
    }
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    const allowed = await verifyAccess();
    if (!allowed) {
      throw new Error(ACCESS_DENIED_MESSAGE);
    }
  };

  const googleSignIn = async () => {
    const result = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin,
    });
    if (result.error) throw result.error;
    if (!result.redirected) {
      const allowed = await verifyAccess();
      if (!allowed) {
        throw new Error(ACCESS_DENIED_MESSAGE);
      }
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
