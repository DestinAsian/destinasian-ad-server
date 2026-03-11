import React, { useEffect, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AccountManagement from './pages/AccountManagement';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

function App() {
  const { isAuthenticated, loading, user, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState('login');
  const [resetToken, setResetToken] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      setCurrentPage('dashboard');
    }
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        fontSize: '18px'
      }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    const authPage = ['signup', 'forgot', 'reset'].includes(currentPage) ? currentPage : 'login';
    return (
      <>
        {authPage === 'login' && <Login onNavigate={setCurrentPage} />}
        {authPage === 'signup' && <Signup onNavigate={setCurrentPage} />}
        {authPage === 'forgot' && (
          <ForgotPassword
            onNavigate={setCurrentPage}
            onResetToken={(token) => {
              setResetToken(token);
              setCurrentPage('reset');
            }}
          />
        )}
        {authPage === 'reset' && (
          <ResetPassword
            onNavigate={setCurrentPage}
            initialToken={resetToken}
          />
        )}
      </>
    );
  }

  return (
    <div>
      <div style={{
        background: '#f5f5f5',
        borderBottom: '1px solid #ddd',
        padding: '15px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', color: '#333' }}>
          Ad Server Dashboard
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ color: '#666' }}>
            Welcome, <strong>{user?.name}</strong>
          </span>
          <button
            onClick={() => setCurrentPage('dashboard')}
            style={{
              padding: '8px 16px',
              background: currentPage === 'dashboard' ? '#1e3c72' : '#fff',
              color: currentPage === 'dashboard' ? '#fff' : '#333',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Dashboard
          </button>
          <button
            onClick={() => setCurrentPage('accounts')}
            style={{
              padding: '8px 16px',
              background: currentPage === 'accounts' ? '#1e3c72' : '#fff',
              color: currentPage === 'accounts' ? '#fff' : '#333',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            My Accounts
          </button>
          <button
            onClick={logout}
            style={{
              padding: '8px 16px',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Logout
          </button>
        </div>
      </div>
      {currentPage === 'dashboard' && <Dashboard />}
      {currentPage === 'accounts' && <AccountManagement />}
    </div>
  );
}

export default App;
