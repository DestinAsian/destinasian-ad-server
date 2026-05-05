import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();
const normalizeRole = (role) => {
  if (role === 'owner' || role === 'admin') return 'owner';
  return 'editor';
};
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [currentAccount, setCurrentAccount] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState(null);
  const [twoFactorPendingUser, setTwoFactorPendingUser] = useState(null);
  const [twoFactorPendingAccounts, setTwoFactorPendingAccounts] = useState([]);
  const [twoFactorPendingAccount, setTwoFactorPendingAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ownerExists, setOwnerExists] = useState(true);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem('authToken');
      const savedUser = localStorage.getItem('user');
      const savedAccount = localStorage.getItem('currentAccount');
      const savedAccounts = localStorage.getItem('accounts');

      if (savedToken && savedUser) {
        setToken(savedToken);
        const parsedUser = JSON.parse(savedUser);
        setUser({ ...parsedUser, role: normalizeRole(parsedUser?.role) });
        if (savedAccount) {
          setCurrentAccount(JSON.parse(savedAccount));
        }
        if (savedAccounts) {
          setAccounts(JSON.parse(savedAccounts));
        }

        try {
          const meResponse = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: {
              Authorization: `Bearer ${savedToken}`
            }
          });
          if (meResponse.ok) {
            const meData = await meResponse.json();
            const normalizedUser = {
              ...meData.user,
              role: normalizeRole(meData.user?.role)
            };
            setUser(normalizedUser);
            localStorage.setItem('user', JSON.stringify(normalizedUser));
            if (meData.currentAccount) {
              setCurrentAccount(meData.currentAccount);
              localStorage.setItem('currentAccount', JSON.stringify(meData.currentAccount));
            }
            if (Array.isArray(meData.accounts)) {
              setAccounts(meData.accounts);
              localStorage.setItem('accounts', JSON.stringify(meData.accounts));
            }
          }
        } catch (error) {
          // Keep local session state; backend calls will enforce auth validity.
        }
      }

      try {
        const response = await fetch(`${API_BASE_URL}/auth/setup-status`);
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
  }, []);

  const login = async (email, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        // Try to parse JSON error message; fall back to status text
        let message = 'Login failed';
        try {
          const error = await response.json();
          message = error.message || message;
        } catch (parseErr) {
          message = response.statusText || message;
        }
        throw new Error(message);
      }

      const data = await response.json();

      if (data.requiresTwoFactor) {
        setTwoFactorChallenge(data.challengeToken);
        setTwoFactorPendingUser({ ...data.user, role: normalizeRole(data.user?.role) });
        setTwoFactorPendingAccounts(data.accounts || []);
        setTwoFactorPendingAccount(data.currentAccount || null);
        return { success: false, requiresTwoFactor: true };
      }

      const { token: newToken, user: userData, currentAccount, accounts: userAccounts } = data;
      const normalizedUser = { ...userData, role: normalizeRole(userData?.role) };

      setToken(newToken);
      setUser(normalizedUser);
      setCurrentAccount(currentAccount);
      setAccounts(userAccounts || []);
      localStorage.setItem('authToken', newToken);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      localStorage.setItem('currentAccount', JSON.stringify(currentAccount));
      localStorage.setItem('accounts', JSON.stringify(userAccounts || []));
      setOwnerExists(true);
      setTwoFactorChallenge(null);
      setTwoFactorPendingUser(null);
      setTwoFactorPendingAccounts([]);
      setTwoFactorPendingAccount(null);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const verifyLoginTwoFactor = async (token) => {
    try {
      if (!twoFactorChallenge) {
        throw new Error('Two-factor challenge has expired. Please login again.');
      }

      const response = await fetch(`${API_BASE_URL}/auth/2fa/verify-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ challengeToken: twoFactorChallenge, token }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Invalid two-factor code');
      }

      const { token: newToken, user: userData, currentAccount, accounts: userAccounts } = data;
      const normalizedUser = { ...userData, role: normalizeRole(userData?.role) };

      setToken(newToken);
      setUser(normalizedUser);
      setCurrentAccount(currentAccount);
      setAccounts(userAccounts || []);
      localStorage.setItem('authToken', newToken);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      localStorage.setItem('currentAccount', JSON.stringify(currentAccount));
      localStorage.setItem('accounts', JSON.stringify(userAccounts || []));

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
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password, passwordConfirm, accountName }),
      });

      if (!response.ok) {
        // parse error message if JSON
        let message = 'Registration failed';
        try {
          const error = await response.json();
          message = error.message || message;
        } catch (parseErr) {
          message = response.statusText || message;
        }
        throw new Error(message);
      }

      const data = await response.json();
      const { token: newToken, user: userData, currentAccount, accounts: userAccounts } = data;
      const normalizedUser = { ...userData, role: normalizeRole(userData?.role) };

      setToken(newToken);
      setUser(normalizedUser);
      setCurrentAccount(currentAccount);
      setAccounts(userAccounts || []);
      localStorage.setItem('authToken', newToken);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      localStorage.setItem('currentAccount', JSON.stringify(currentAccount));
      localStorage.setItem('accounts', JSON.stringify(userAccounts || []));
      setOwnerExists(true);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const requestPasswordReset = async (email) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to request password reset');
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const resetPassword = async (token, password, passwordConfirm) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password, passwordConfirm }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to reset password');
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const selectAccount = async (accountId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/select-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ accountId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to select account');
      }

      const data = await response.json();
      const { token: newToken, currentAccount, user: userData, accounts: userAccounts } = data;

      setToken(newToken);
      if (userData) {
        const normalizedUser = { ...userData, role: normalizeRole(userData?.role) };
        setUser(normalizedUser);
        localStorage.setItem('user', JSON.stringify(normalizedUser));
      }
      setCurrentAccount(currentAccount);
      if (Array.isArray(userAccounts)) {
        setAccounts(userAccounts);
        localStorage.setItem('accounts', JSON.stringify(userAccounts));
      }
      localStorage.setItem('authToken', newToken);
      localStorage.setItem('currentAccount', JSON.stringify(currentAccount));

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const createAccount = async (accountName) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/create-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ accountName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create account');
      }

      const data = await response.json();
      const { account, accounts: updatedAccounts } = data;

      setAccounts(updatedAccounts || []);
      localStorage.setItem('accounts', JSON.stringify(updatedAccounts || []));

      return { success: true, account };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setCurrentAccount(null);
    setAccounts([]);
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('currentAccount');
    localStorage.removeItem('accounts');
    setTwoFactorChallenge(null);
    setTwoFactorPendingUser(null);
    setTwoFactorPendingAccounts([]);
    setTwoFactorPendingAccount(null);
  };

  const getTwoFactorStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/2fa/status`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch 2FA status');
      }
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const startTwoFactorSetup = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/2fa/setup`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to start 2FA setup');
      }
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const verifyTwoFactorSetup = async (setupToken) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/2fa/verify-setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ token: setupToken }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to verify 2FA setup');
      }

      const { token: newToken, user: userData, currentAccount, accounts: userAccounts } = data;
      const normalizedUser = { ...userData, role: normalizeRole(userData?.role) };

      setToken(newToken);
      setUser(normalizedUser);
      setCurrentAccount(currentAccount);
      setAccounts(userAccounts || []);
      localStorage.setItem('authToken', newToken);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      localStorage.setItem('currentAccount', JSON.stringify(currentAccount));
      localStorage.setItem('accounts', JSON.stringify(userAccounts || []));

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const updateCurrentUser = (nextUser) => {
    const normalizedUser = { ...nextUser, role: normalizeRole(nextUser?.role) };
    setUser(normalizedUser);
    localStorage.setItem('user', JSON.stringify(normalizedUser));
  };

  const value = {
    user,
    token,
    currentAccount,
    accounts,
    loading,
    ownerExists,
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
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
