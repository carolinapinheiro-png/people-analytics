import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { checkAccess } from '@/lib/access.functions';
import { useServerFn } from '@tanstack/react-start';
import type { AccessProfile } from '@/lib/permissions';

/**
 * 'unknown' — not checked yet (no session, or check in flight)
 * 'allowed' — server confirmed the email is authorized
 * 'denied'  — server confirmed the email is NOT authorized (session destroyed)
 * 'error'   — the check itself failed (network/5xx). Access is blocked, but the
 *             session is intentionally preserved so a retry can recover.
 */
export type AccessStatus = 'unknown' | 'allowed' | 'denied' | 'error';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Kept for backwards compatibility. Derived from accessStatus. */
  isAllowed: boolean | null;
  accessStatus: AccessStatus;
  role: 'admin' | 'viewer' | null;
  /** Perfil de acesso segmentado (abas, escopo e campos sensiveis). */
  profile: AccessProfile | null;
  /** Departamentos atendidos; vazio para perfis globais. */
  departments: string[];
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  googleSignIn: () => Promise<void>;
  retryAccessCheck: () => Promise<AccessStatus>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const ACCESS_DENIED_MESSAGE =
  'Acesso negado: seu email não está na lista de usuários autorizados.';
export const ACCESS_CHECK_FAILED_MESSAGE =
  'Não foi possível verificar seu acesso no momento. Verifique sua conexão e tente novamente.';
export const ACCESS_DENIED_STORAGE_KEY = 'auth:access-denied';

const VERIFY_ATTEMPTS = 2;
const VERIFY_RETRY_DELAY_MS = 800;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('unknown');
  const [role, setRole] = useState<'admin' | 'viewer' | null>(null);
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const checkAccessFn = useServerFn(checkAccess);

  /**
   * Authorization gate. Distinguishes three outcomes:
   *
   *   allowed → proceed.
   *   denied  → authoritative "no". Destroy the Supabase session immediately so
   *             no valid JWT lingers, regardless of password vs OAuth login.
   *   error   → we could not reach a verdict. Block access, but DO NOT sign out:
   *             a network blip must not evict an authorized user.
   */
  const verifyAccess = useCallback(async (): Promise<AccessStatus> => {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(VERIFY_RETRY_DELAY_MS);

      try {
        const result = await checkAccessFn();

        if (result.allowed) {
          setAccessStatus('allowed');
          setRole(result.role);
          setProfile((result.profile as AccessProfile | null) ?? null);
          setDepartments(result.departments ?? []);
          return 'allowed';
        }

        // Authoritative denial — tear the session down.
        setAccessStatus('denied');
        setRole(null);
        setProfile(null);
        setDepartments([]);
        setUser(null);
        setSession(null);

        try {
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(ACCESS_DENIED_STORAGE_KEY, ACCESS_DENIED_MESSAGE);
          }
        } catch {
          // sessionStorage may be unavailable; the message is best-effort.
        }

        try {
          await supabase.auth.signOut();
        } catch (error) {
          console.error('Sign-out after denied access failed:', error);
        }

        return 'denied';
      } catch (error) {
        lastError = error;
      }
    }

    // Verification failed, not denied. Session stays alive on purpose.
    console.error('Access check failed:', lastError);
    setAccessStatus('error');
    setRole(null);
    setProfile(null);
    setDepartments([]);
    return 'error';
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
          setAccessStatus('unknown');
          setRole(null);
          setProfile(null);
          setDepartments([]);
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
    const status = await verifyAccess();
    if (status === 'denied') throw new Error(ACCESS_DENIED_MESSAGE);
    if (status === 'error') throw new Error(ACCESS_CHECK_FAILED_MESSAGE);
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    const status = await verifyAccess();
    if (status === 'denied') throw new Error(ACCESS_DENIED_MESSAGE);
    if (status === 'error') throw new Error(ACCESS_CHECK_FAILED_MESSAGE);
  };

  const googleSignIn = async () => {
    const result = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin,
    });
    if (result.error) throw result.error;
    if (!result.redirected) {
      const status = await verifyAccess();
      if (status === 'denied') throw new Error(ACCESS_DENIED_MESSAGE);
      if (status === 'error') throw new Error(ACCESS_CHECK_FAILED_MESSAGE);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setAccessStatus('unknown');
    setRole(null);
    setProfile(null);
    setDepartments([]);
  };

  const retryAccessCheck = useCallback(() => verifyAccess(), [verifyAccess]);

  const isAllowed =
    accessStatus === 'allowed' ? true : accessStatus === 'denied' ? false : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAllowed,
        accessStatus,
        role,
        profile,
        departments,
        signIn,
        signUp,
        signOut,
        googleSignIn,
        retryAccessCheck,
        isAdmin: profile === 'admin',
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
