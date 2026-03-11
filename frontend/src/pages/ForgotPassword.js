import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Auth.css';

function ForgotPassword({ onNavigate, onResetToken }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [loading, setLoading] = useState(false);
  const { requestPasswordReset } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setResetToken('');
    setLoading(true);

    const result = await requestPasswordReset(email);
    if (result.success) {
      const token = result.data?.resetToken || '';
      setMessage(result.data?.message || 'If the account exists, a reset token has been generated.');
      setResetToken(token);
      if (token && onResetToken) {
        onResetToken(token);
      }
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Forgot Password</h2>
        {error && <div className="error-message">{error}</div>}
        {message && <div className="info-message">{message}</div>}
        {resetToken && (
          <div className="token-box">
            <div className="token-label">Reset Token</div>
            <div className="token-value">{resetToken}</div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onNavigate('reset')}
            >
              Use Token to Reset Password
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Requesting...' : 'Request Reset Token'}
          </button>
        </form>
        <p className="auth-toggle">
          Remembered your password?{' '}
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

export default ForgotPassword;
