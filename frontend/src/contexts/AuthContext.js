import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ensureCsrfToken, secureFetch } from '../services/api';

const AuthContext = createContext();
const normalizeRole = (role) => (role === 'owner' || role === 'admin' ? 'owner' : 'editor');

const clearLegacyAuthStorage = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  localStorage.removeItem('currentAccount');
  localStorage.removeItem('accounts');
};

const parseResponse = async (response, fallbackMessage) => {
  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    // Preserve a useful fallback when an upstream proxy returns a non-JSON error.
  }
  if (!response.ok) throw new Error(data.message || fallbackMessage);
  return data;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [currentAccount, setCurrentAccount] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState(null);
  const [twoFactorPendingUser, setTwoFactorPendingUser] = useState(null);
  const [twoFactorPendingAccounts, setTwoFactorPendingAccounts] = useState([]);
  const [twoFactorPendingAccount, setTwoFactorPendingAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ownerExists, setOwnerExists] = useState(true);
  const [sessionValidationWarning, setSessionValidationWarning] = useState('');

  const applyAuthenticatedResponse = useCallback((data) => {
    const normalizedUser = data?.user
      ? { ...data.user, role: normalizeRole(data.user.role) }
      : null;
    setUser(normalizedUser);
    setCurrentAccount(data?.currentAccount || null);
    setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
    setOwnerExists(true);
    setSessionValidationWarning('');
    clearLegacyAuthStorage();
  }, []);

  const clearSessionState = useCallback(() => {
    setUser(null);
    setCurrentAccount(null);
    setAccounts([]);
    setTwoFactorChallenge(null);
    setTwoFactorPendingUser(null);
    setTwoFactorPendingAccounts([]);
    setTwoFactorPendingAccount(null);
    setSessionValidationWarning('');
    clearLegacyAuthStorage();
  }, []);

  useEffect(() => {
    const handleExpiredSession = () => clearSessionState();
    const handleRefreshedSession = (event) => applyAuthenticatedResponse(event.detail || {});
    const handleSessionWarning = (event) => setSessionValidationWarning(
      event.detail || 'Unable to verify your session because the network is unavailable.'
    );
    window.addEventListener('auth:session-expired', handleExpiredSession);
    window.addEventListener('auth:session-refreshed', handleRefreshedSession);
    window.addEventListener('auth:session-warning', handleSessionWarning);
    return () => {
      window.removeEventListener('auth:session-expired', handleExpiredSession);
      window.removeEventListener('auth:session-refreshed', handleRefreshedSession);
      window.removeEventListener('auth:session-warning', handleSessionWarning);
    };
  }, [applyAuthenticatedResponse, clearSessionState]);

  useEffect(() => {
    const initAuth = async () => {
      clearLegacyAuthStorage();
      try {
        await ensureCsrfToken();
        const refreshResponse = await secureFetch('/auth/refresh', { method: 'POST' });
        if (refreshResponse.ok) {
          applyAuthenticatedResponse(await refreshResponse.json());
        } else if (refreshResponse.status !== 401) {
          setSessionValidationWarning('Unable to verify your session because the server is temporarily unavailable.');
        }
      } catch (error) {
        setSessionValidationWarning('Unable to verify your session because the network is unavailable.');
      }

      try {
        const response = await secureFetch('/auth/setup-status');
        if (response.ok) {
          const data = await response.json();
          setOwnerExists(Boolean(data.ownerExists));
        }
      } catch (error) {
        setOwnerExists(true);
      }
      setLoading(false);
    };

    initAuth();
  }, [applyAuthenticatedResponse]);

  const login = async (email, password) => {
    try {
      const response = await secureFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await parseResponse(response, 'Login failed');
      if (data.requiresTwoFactor) {
        setTwoFactorChallenge(data.challengeToken);
        setTwoFactorPendingUser({ ...data.user, role: normalizeRole(data.user?.role) });
        setTwoFactorPendingAccounts(data.accounts || []);
        setTwoFactorPendingAccount(data.currentAccount || null);
        return { success: false, requiresTwoFactor: true };
      }
      applyAuthenticatedResponse(data);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const verifyLoginTwoFactor = async (token) => {
    try {
      if (!twoFactorChallenge) throw new Error('Two-factor challenge has expired. Please login again.');
      const response = await secureFetch('/auth/2fa/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken: twoFactorChallenge, token })
      });
      const data = await parseResponse(response, 'Invalid two-factor code');
      applyAuthenticatedResponse(data);
      setTwoFactorChallenge(null);
      setTwoFactorPendingUser(null);
      setTwoFactorPendingAccounts([]);
      setTwoFactorPendingAccount(null);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const register = async (name, email, password, passwordConfirm, accountName) => {
    try {
      const response = await secureFetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, passwordConfirm, accountName })
      });
      const data = await parseResponse(response, 'Registration failed');
      applyAuthenticatedResponse(data);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const requestPasswordReset = async (email) => {
    try {
      const response = await secureFetch('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      return { success: true, data: await parseResponse(response, 'Failed to request password reset') };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const resetPassword = async (token, password, passwordConfirm) => {
    try {
      const response = await secureFetch('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, passwordConfirm })
      });
      const data = await parseResponse(response, 'Failed to reset password');
      clearSessionState();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const selectAccount = async (accountId) => {
    try {
      const response = await secureFetch('/auth/select-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId })
      });
      const data = await parseResponse(response, 'Failed to select account');
      applyAuthenticatedResponse(data);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const createAccount = async (accountName) => {
    try {
      const response = await secureFetch('/auth/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountName })
      });
      const data = await parseResponse(response, 'Failed to create account');
      setAccounts(data.accounts || []);
      return { success: true, account: data.account };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    const logoutRequest = secureFetch('/auth/logout', { method: 'POST' }).catch(() => null);
    clearSessionState();
    await logoutRequest;
  };

  const getTwoFactorStatus = async () => {
    try {
      const response = await secureFetch('/auth/2fa/status');
      return { success: true, data: await parseResponse(response, 'Failed to fetch 2FA status') };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const startTwoFactorSetup = async () => {
    try {
      const response = await secureFetch('/auth/2fa/setup', { method: 'POST' });
      return { success: true, data: await parseResponse(response, 'Failed to start 2FA setup') };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const verifyTwoFactorSetup = async (setupToken) => {
    try {
      const response = await secureFetch('/auth/2fa/verify-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: setupToken })
      });
      const data = await parseResponse(response, 'Failed to verify 2FA setup');
      applyAuthenticatedResponse(data);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const updateCurrentUser = (nextUser) => {
    setUser({ ...nextUser, role: normalizeRole(nextUser?.role) });
  };

  const value = {
    user,
    currentAccount,
    accounts,
    loading,
    ownerExists,
    sessionValidationWarning,
    twoFactorChallenge,
    twoFactorPendingUser,
    twoFactorPendingAccounts,
    twoFactorPendingAccount,
    login,
    verifyLoginTwoFactor,
    getTwoFactorStatus,
    startTwoFactorSetup,
    verifyTwoFactorSetup,
    register,
    requestPasswordReset,
    resetPassword,
    logout,
    selectAccount,
    createAccount,
    updateCurrentUser,
    isAuthenticated: Boolean(user)
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
