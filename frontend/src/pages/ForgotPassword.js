import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Auth.css';

function ForgotPassword({ onNavigate }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { requestPasswordReset } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    const result = await requestPasswordReset(email);
    if (result.success) {
      setMessage(result.data?.message || 'If the account exists, reset instructions have been sent.');
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
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
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
