import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Auth.css';

function Login({ onNavigate, canRegister = true }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, verifyLoginTwoFactor, twoFactorPendingUser } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    if (result.requiresTwoFactor) {
      setRequiresTwoFactor(true);
      setLoading(false);
      return;
    }

    if (result.success) {
      onNavigate('dashboard');
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  const handleVerifyTwoFactor = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await verifyLoginTwoFactor(twoFactorToken);
    if (result.success) {
      setRequiresTwoFactor(false);
      setTwoFactorToken('');
      onNavigate('dashboard');
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>{requiresTwoFactor ? 'Two-Factor Verification' : 'Login'}</h2>
        {error && <div className="error-message">{error}</div>}

        {!requiresTwoFactor ? (
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
            <div className="form-group">
              <label>Password:</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyTwoFactor}>
            <div className="info-message">
              Enter the 6-digit code from Google Authenticator
              {twoFactorPendingUser?.email ? ` for ${twoFactorPendingUser.email}` : ''}.
            </div>
            <div className="form-group">
              <label>2FA Code:</label>
              <input
                type="text"
                value={twoFactorToken}
                onChange={(e) => setTwoFactorToken(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                disabled={loading}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify 2FA'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: '10px' }}
              onClick={() => {
                setRequiresTwoFactor(false);
                setTwoFactorToken('');
              }}
            >
              Back to Login
            </button>
          </form>
        )}

        {!requiresTwoFactor && canRegister ? (
          <p className="auth-toggle">
            Don't have an account?{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => onNavigate('signup')}
            >
              Sign up
            </button>
          </p>
        ) : null}

        {!requiresTwoFactor && !canRegister ? (
          <p className="auth-toggle">
            Owner is already configured. Ask the owner to grant editor access.
          </p>
        ) : null}

        {!requiresTwoFactor && (
          <p className="auth-toggle">
            Forgot your password?{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => onNavigate('forgot')}
            >
              Reset it
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

export default Login;
