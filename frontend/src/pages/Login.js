import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Auth.css';

function Login({ onNavigate }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    if (result.success) {
      onNavigate('dashboard');
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Login</h2>
        {error && <div className="error-message">{error}</div>}
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
      </div>
    </div>
  );
}

export default Login;
