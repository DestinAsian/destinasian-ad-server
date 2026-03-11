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

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
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
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Reset Token:</label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label>New Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength="6"
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
              minLength="6"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
        <p className="auth-toggle">
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
