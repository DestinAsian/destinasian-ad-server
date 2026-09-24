import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Auth.css';

function ResetPassword({ onNavigate, initialToken = '' }) {
  const [token, setToken] = useState(initialToken || '');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();

  useEffect(() => {
    if (initialToken) {
      setToken(initialToken);
    }
  }, [initialToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== passwordConfirm) {
      setError('Passwords do not match');
      return;
    }

    if (!token) {
      setError('This password reset link is missing or invalid. Request a new link.');
      return;
    }

    if (password.length < 12) {
      setError('Password must be at least 12 characters');
      return;
    }

    setLoading(true);
    const result = await resetPassword(token, password, passwordConfirm);
    if (result.success) {
      setMessage(result.data?.message || 'Password reset successful');
      setPassword('');
      setPasswordConfirm('');
      setTimeout(() => onNavigate('login'), 800);
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Reset Password</h2>
        {error && <div className="error-message">{error}</div>}
        {message && <div className="info-message">{message}</div>}
        {!token && (
          <div className="error-message">
            This password reset link is missing or invalid. Request a new link.
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>New Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength="12"
              maxLength="128"
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label>Confirm New Password:</label>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              disabled={loading}
              minLength="12"
              maxLength="128"
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading || !token}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
        <p className="auth-toggle">
          {!token && (
            <button
              type="button"
              className="link-button"
              onClick={() => onNavigate('forgot')}
            >
              Request a new reset link
            </button>
          )}
          {!token && ' · '}
          <button
            type="button"
            className="link-button"
            onClick={() => onNavigate('login')}
          >
            Back to login
          </button>
        </p>
      </div>
    </div>
  );
}

export default ResetPassword;
