import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { accountAPI } from '../services/api';
import '../styles/AccountManagement.css';

function AccountManagement() {
  const { user, selectAccount } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [accountStats, setAccountStats] = useState({});

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const response = await accountAPI.getAll();
      setAccounts(response.data);
      
      // Fetch stats for each account
      response.data.forEach(account => {
        accountAPI.getStats(account._id)
          .then(statsResponse => {
            setAccountStats(prev => ({
              ...prev,
              [account._id]: statsResponse.data.stats
            }));
          })
          .catch(err => console.error(`Failed to load stats for account ${account._id}`, err));
      });
      
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load accounts');
      setLoading(false);
    }
  };

  const handleSwitchAccount = async (accountId) => {
    const result = await selectAccount(accountId);
    if (result.success) {
      setSuccessMessage('Switched to account successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  const handleStartEdit = (account) => {
    setEditingId(account._id);
    setEditName(account.name);
  };

  const handleSaveEdit = async (accountId) => {
    if (!editName.trim()) {
      setError('Account name is required');
      return;
    }

    try {
      await accountAPI.update(accountId, { name: editName.trim() });
      setSuccessMessage('Account updated successfully');
      setEditingId(null);
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchAccounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update account');
    }
  };

  const handleDeleteAccount = async (accountId, accountName) => {
    if (accounts.length === 1) {
      setError('Cannot delete your only account');
      return;
    }

    if (window.confirm(`Are you sure you want to delete "${accountName}"? This will also delete all campaigns and ad units in this account. This action cannot be undone.`)) {
      try {
        await accountAPI.delete(accountId);
        setSuccessMessage('Account deleted successfully');
        setTimeout(() => {
          setSuccessMessage(null);
          fetchAccounts();
        }, 2000);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to delete account');
      }
    }
  };

  if (loading) return <div className="loading">Loading accounts...</div>;

  return (
    <div className="account-management">
      <h2>My Accounts</h2>

      {successMessage && (
        <div className="alert alert-success">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          {error}
          <button onClick={() => setError(null)} className="alert-close">✕</button>
        </div>
      )}

      <div className="accounts-grid">
        {accounts.map((account) => (
          <div key={account._id} className="account-card">
            <div className="account-card-header">
              {editingId === account._id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveEdit(account._id);
                  }}
                  className="edit-form"
                >
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="edit-input"
                    autoFocus
                  />
                  <button type="submit" className="btn-save">Save</button>
                  <button
                    type="button"
                    className="btn-cancel-edit"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <h3>{account.name}</h3>
              )}
            </div>

            <div className="account-card-body">
              <p className="account-info">
                <span className="label">Owner Email:</span>
                <span className="value">{account.email || user?.email}</span>
              </p>
              <p className="account-info">
                <span className="label">Created:</span>
                <span className="value">
                  {account.createdAt ? new Date(account.createdAt).toLocaleDateString() : 'N/A'}
                </span>
              </p>
              <p className="account-info">
                <span className="label">Status:</span>
                <span className={`status ${account.isActive ? 'active' : 'inactive'}`}>
                  {account.isActive ? 'Active' : 'Inactive'}
                </span>
              </p>

              {accountStats[account._id] && (
                <div className="account-stats">
                  <div className="stat">
                    <span className="stat-label">Campaigns</span>
                    <span className="stat-value">{accountStats[account._id].campaigns}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Ad Units</span>
                    <span className="stat-value">{accountStats[account._id].adUnits}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="account-card-footer">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleSwitchAccount(account._id)}
              >
                Switch to Account
              </button>
              {editingId !== account._id && (
                <>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleStartEdit(account)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDeleteAccount(account._id, account.name)}
                    disabled={accounts.length === 1}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {accounts.length === 0 && (
        <div className="no-accounts">
          <p>No accounts found</p>
        </div>
      )}
    </div>
  );
}

export default AccountManagement;
