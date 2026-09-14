'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, getUser, isAuthenticated as checkAuth } from './auth';
import api from './api';

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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(0);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.getMe();
      if (res.success && res.data) {
        setUser(res.data);
        localStorage.setItem('user', JSON.stringify(res.data));
      } else {
        setUser(null);
        api.clearTokens();
      }
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      if (checkAuth()) {
        const storedUser = getUser();
        if (storedUser) setUser(storedUser);
        await refreshUser();
      }
      setLoading(false);
    };
    init();
  }, [refreshUser]);

  const login = async (identifier: string, password: string) => {
    try {
const res = await api.login(identifier, password);
      if (res.success && res.data) {
        setUser(res.data.user);
        return { success: true, user: res.data.user };
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
        setUser(res.data.user);
        return { success: true, user: res.data.user };
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
        // Do NOT auto-login after registration.
        // The user is redirected to the login page to sign in manually.
        return { success: true };
      }
      return { success: false, error: res.error || 'Registration failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setShowIdleWarning(false);
  }, []);

  useEffect(() => {
    const clearIdleTimers = () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      warningTimerRef.current = null;
      logoutTimerRef.current = null;
    };

    if (!user) {
      clearIdleTimers();
      setShowIdleWarning(false);
      return;
    }

    const resetIdleTimer = () => {
      const now = Date.now();
      if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return;
      lastActivityRef.current = now;
      clearIdleTimers();
      setShowIdleWarning(false);

      warningTimerRef.current = setTimeout(() => {
        setShowIdleWarning(true);
      }, IDLE_WARNING_MS);

      logoutTimerRef.current = setTimeout(() => {
        api.clearTokens();
        setUser(null);
        setShowIdleWarning(false);
        window.location.replace('/login?reason=inactivity');
      }, IDLE_TIMEOUT_MS);
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
      window.addEventListener(eventName, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();

    return () => {
      clearIdleTimers();
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetIdleTimer);
      });
    };
  }, [user]);

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
                onClick={() => window.dispatchEvent(new Event('mousemove'))}
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

