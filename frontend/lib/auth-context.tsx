'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, getUser, isAuthenticated as checkAuth } from './auth';
import api from './api';
import { clearOfflineData } from './offline-db';
import { syncNow } from './offline-sync';

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const IDLE_WARNING_MS = IDLE_TIMEOUT_MS - 60 * 1000;
const ACTIVITY_THROTTLE_MS = 1000;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  googleLogin: (credential: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  firstName: string;
  lastName: string;
  libraryId: string;
  email: string;
  password: string;
  role?: string;
  department?: string;
  yearSection?: string;
  phone?: string;
}

const LAST_ACTIVITY_STORAGE_KEY = 'lastActivityAt';

const getStoredLastActivity = (): number => {
  if (typeof window === 'undefined') return Date.now();
  const stored = Number(localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY) || Date.now());
  return Number.isFinite(stored) ? stored : Date.now();
};

const setStoredLastActivity = (timestamp = Date.now()) => {
  if (typeof window === 'undefined') return;
  lastActivityRefValue = timestamp;
  localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(timestamp));
};

let lastActivityRefValue = Date.now();

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(getStoredLastActivity());

  const clearIdleTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    warningTimerRef.current = null;
    logoutTimerRef.current = null;
  }, []);

  const handleAuthExpired = useCallback(() => {
    if (!navigator.onLine) {
      // Offline sessions should not be hard-cleared while the device is disconnected.
      return;
    }

    api.clearTokens();
    localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    lastActivityRef.current = Date.now();
    setUser(null);
    setShowIdleWarning(false);
    window.location.replace('/login?reason=inactivity');
  }, []);

  const refreshUser = useCallback(async () => {
    const storedUser = getUser();

    if (!checkAuth()) {
      if (storedUser) {
        setUser(storedUser);
      } else {
        setUser(null);
      }
      return;
    }

    try {
      const res = await api.getMe();

      if (res.success && res.data) {
        setUser(res.data);
        localStorage.setItem('user', JSON.stringify(res.data));
        void syncNow();
        return;
      }

      const authFailure = typeof res.error === 'string' && /401|unauthorized|forbidden|token/i.test(res.error);
      if (authFailure) {
        api.clearTokens();
        localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
        lastActivityRef.current = Date.now();
        setUser(null);
        return;
      }

      // Offline or transient network failures should not wipe the user session.
      // Keep the valid stored user and tokens until the user is back online and the
      // auth check succeeds or a real auth error occurs.
      if (storedUser) {
        setUser(storedUser);
      }
    } catch {
      if (storedUser) {
        setUser(storedUser);
      }
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      if (checkAuth()) {
        const storedUser = getUser();
        if (storedUser) {
          setUser(storedUser);
          lastActivityRef.current = getStoredLastActivity();
        }
        await refreshUser();
      } else {
        setUser(null);
        localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
      }
      setLoading(false);
    };

    init();
  }, [refreshUser]);

  const login = async (identifier: string, password: string) => {
    try {
      const res = await api.login(identifier, password);
      if (res.success && res.data) {
        const nextUser = res.data.user;
        setUser(nextUser);
        void syncNow();
        lastActivityRef.current = Date.now();
        setStoredLastActivity(lastActivityRef.current);
        return { success: true, user: nextUser };
      }
      return { success: false, error: res.error || 'Login failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  const googleLogin = async (credential: string) => {
    try {
      const res = await api.googleLogin(credential);
      if (res.success && res.data) {
        const nextUser = res.data.user;
        setUser(nextUser);
        void syncNow();
        lastActivityRef.current = Date.now();
        setStoredLastActivity(lastActivityRef.current);
        return { success: true, user: nextUser };
      }
      return { success: false, error: res.error || 'Google login failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Google login failed' };
    }
  };

  const register = async (data: RegisterData) => {
    try {
      const res = await api.register(data);
      if (res.success) {
        return { success: true };
      }
      return { success: false, error: res.error || 'Registration failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  const logout = useCallback(async () => {
    await api.logout();
    await clearOfflineData();
    clearIdleTimers();
    setUser(null);
    setShowIdleWarning(false);
    localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    lastActivityRef.current = Date.now();
  }, [clearIdleTimers]);

  const isIdleWindowActive = useCallback(() => {
    return navigator.onLine && document.visibilityState === 'visible';
  }, []);

  const scheduleIdleTimers = useCallback(() => {
    clearIdleTimers();

    if (!user || !isIdleWindowActive()) {
      // Idle timers must pause while offline or hidden because the user is not actively
      // engaging with the app and we should not hard-logout a stale session in that state.
      setShowIdleWarning(false);
      return;
    }

    const now = Date.now();
    const lastActivityAt = getStoredLastActivity();
    const elapsed = now - lastActivityAt;

    if (elapsed >= IDLE_TIMEOUT_MS) {
      // If the app resumes after the timeout while still online, expire the session.
      handleAuthExpired();
      return;
    }

    const warningDelay = Math.max(0, IDLE_WARNING_MS - elapsed);
    const logoutDelay = Math.max(0, IDLE_TIMEOUT_MS - elapsed);

    warningTimerRef.current = setTimeout(() => {
      if (isIdleWindowActive()) {
        setShowIdleWarning(true);
      }
    }, warningDelay);

    logoutTimerRef.current = setTimeout(() => {
      if (!isIdleWindowActive()) {
        scheduleIdleTimers();
        return;
      }
      handleAuthExpired();
    }, logoutDelay);
  }, [clearIdleTimers, handleAuthExpired, isIdleWindowActive, user]);

  useEffect(() => {
    if (!user) {
      clearIdleTimers();
      setShowIdleWarning(false);
      return;
    }

    const handleActivity = () => {
      if (!isIdleWindowActive()) {
        // We still keep the last known activity timestamp, but do not advance the timer
        // while the app is offline or hidden.
        return;
      }

      const now = Date.now();
      if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return;

      lastActivityRef.current = now;
      setStoredLastActivity(now);
      scheduleIdleTimers();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearIdleTimers();
        setShowIdleWarning(false);
        return;
      }

      // When visibility returns, resume based on the remembered last activity and current online state.
      scheduleIdleTimers();
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'keydown',
      'click',
      'scroll',
      'touchstart',
      'touchmove',
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    window.addEventListener('online', scheduleIdleTimers);
    window.addEventListener('offline', () => {
      clearIdleTimers();
      setShowIdleWarning(false);
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    scheduleIdleTimers();

    return () => {
      clearIdleTimers();
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      window.removeEventListener('online', scheduleIdleTimers);
      window.removeEventListener('offline', () => {
        clearIdleTimers();
        setShowIdleWarning(false);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clearIdleTimers, isIdleWindowActive, scheduleIdleTimers, user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        googleLogin,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
      {user && showIdleWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="idle-warning-title"
            className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-center shadow-2xl"
          >
            <h2 id="idle-warning-title" className="text-lg font-semibold text-white">
              Still there?
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              You will be logged out in 1 minute due to inactivity.
            </p>
            <button
              type="button"
              onClick={() => {
                const now = Date.now();
                lastActivityRef.current = now;
                setStoredLastActivity(now);
                setShowIdleWarning(false);
                scheduleIdleTimers();
              }}
              className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Continue session
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

