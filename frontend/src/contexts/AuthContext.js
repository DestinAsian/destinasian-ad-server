import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

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
  const [loading, setLoading] = useState(true);

  // Initialize auth state from localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('user');
    const savedAccount = localStorage.getItem('currentAccount');
    const savedAccounts = localStorage.getItem('accounts');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      if (savedAccount) {
        setCurrentAccount(JSON.parse(savedAccount));
      }
      if (savedAccounts) {
        setAccounts(JSON.parse(savedAccounts));
      }
    }
    setLoading(false);
  }, []);

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

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
      const { token: newToken, user: userData, currentAccount, accounts: userAccounts } = data;

      setToken(newToken);
      setUser(userData);
      setCurrentAccount(currentAccount);
      setAccounts(userAccounts || []);
      localStorage.setItem('authToken', newToken);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('currentAccount', JSON.stringify(currentAccount));
      localStorage.setItem('accounts', JSON.stringify(userAccounts || []));

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

      setToken(newToken);
      setUser(userData);
      setCurrentAccount(currentAccount);
      setAccounts(userAccounts || []);
      localStorage.setItem('authToken', newToken);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('currentAccount', JSON.stringify(currentAccount));
      localStorage.setItem('accounts', JSON.stringify(userAccounts || []));

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
      const { token: newToken, currentAccount } = data;

      setToken(newToken);
      setCurrentAccount(currentAccount);
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
  };

  const value = {
    user,
    token,
    currentAccount,
    accounts,
    loading,
    login,
    register,
    requestPasswordReset,
    resetPassword,
    logout,
    selectAccount,
    createAccount,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
