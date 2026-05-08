import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import { accountAPI, userAPI } from '../services/api';
import '../styles/Users.css';
import '../styles/AccountManagement.css';

function AccountManagement() {
  const { user, selectAccount } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const [newAccountName, setNewAccountName] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);

  const [shareModalAccount, setShareModalAccount] = useState(null);
  const [availableShareUsers, setAvailableShareUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [loadingShareUsers, setLoadingShareUsers] = useState(false);
  const [sharingSubmitting, setSharingSubmitting] = useState(false);

  const isOwner = user?.role === 'owner';

  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      if (nameA !== nameB) return nameA < nameB ? -1 : 1;
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });
  }, [accounts]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await accountAPI.getAll();
      const rows = Array.isArray(response.data?.accounts)
        ? response.data.accounts
        : (Array.isArray(response.data) ? response.data : []);
      setAccounts(rows);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load accounts');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const showSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  const handleSwitchAccount = async (accountId) => {
    const result = await selectAccount(accountId);
    if (result.success) {
      showSuccess('Switched to account successfully');
    } else if (result.error) {
      setError(result.error);
    }
  };

  const handleStartEdit = (account) => {
    setEditingId(account._id);
    setEditName(account.name || '');
  };

  const handleSaveEdit = async (accountId) => {
    if (!editName.trim()) {
      setError('Account name is required');
      return;
    }

    try {
      await accountAPI.update(accountId, { name: editName.trim() });
      setEditingId(null);
      showSuccess('Account updated successfully');
      await fetchAccounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update account');
    }
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!newAccountName.trim()) {
      setError('Account name is required');
      return;
    }

    try {
      setCreatingAccount(true);
      await accountAPI.create({ name: newAccountName.trim() });
      setNewAccountName('');
      showSuccess('Account created successfully');
      await fetchAccounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create account');
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleDeleteAccount = async (account) => {
    if (!window.confirm(`Delete account "${account.name}"?`)) return;

    try {
      await accountAPI.delete(account._id);
      showSuccess('Account deleted successfully');
      await fetchAccounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete account');
    }
  };

  const openShareModal = async (account) => {
    if (!isOwner) return;
    setShareModalAccount(account);
    setLoadingShareUsers(true);
    try {
      const response = await userAPI.getAll();
      const users = Array.isArray(response.data?.users) ? response.data.users : [];
      const ownerId = account?.owner?._id ? String(account.owner._id) : null;

      const eligibleUsers = users
        .filter((candidate) => candidate?.id)
        .filter((candidate) => candidate?.isActive !== false)
        .filter((candidate) => String(candidate.id) !== ownerId)
        .filter((candidate) => candidate?.role !== 'owner');

      const eligibleUserIdSet = new Set(eligibleUsers.map((candidate) => String(candidate.id)));
      const preselected = (account.sharedUsers || [])
        .map((entry) => String(entry.userId || ''))
        .filter((id) => eligibleUserIdSet.has(id));

      setAvailableShareUsers(eligibleUsers);
      setSelectedUserIds([...new Set(preselected)]);
    } catch (err) {
      setAvailableShareUsers([]);
      setSelectedUserIds([]);
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load users for sharing');
    } finally {
      setLoadingShareUsers(false);
    }
  };

  const closeShareModal = () => {
    if (sharingSubmitting) return;
    setShareModalAccount(null);
    setAvailableShareUsers([]);
    setSelectedUserIds([]);
  };

  const handleShareSelectionChange = (event) => {
    const { value, checked } = event.target;
    setSelectedUserIds((current) => {
      const currentSet = new Set(current);
      if (checked) {
        currentSet.add(value);
      } else {
        currentSet.delete(value);
      }
      return [...currentSet];
    });
  };

  const handleSaveShare = async () => {
    if (!shareModalAccount?._id) return;
    try {
      setSharingSubmitting(true);
      await accountAPI.syncShare(shareModalAccount._id, { userIds: selectedUserIds });
      showSuccess('Account sharing updated successfully');
      closeShareModal();
      await fetchAccounts();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to share account');
    } finally {
      setSharingSubmitting(false);
    }
  };

  if (loading) return <div className="loading">Loading accounts...</div>;

  return (
    <div className="account-management users-page">
      <header className="account-page-header users-header">
        <div>
          <h2>My Accounts</h2>
          <p>Manage account access, sharing, and account-level campaign and ad channel overview.</p>
        </div>
      </header>

      {successMessage && <div className="alert alert-success">{successMessage}</div>}
      {error && (
        <div className="alert alert-error">
          {error}
          <button onClick={() => setError(null)} className="alert-close">✕</button>
        </div>
      )}

      {isOwner && (
        <section className="account-create-card users-card">
          <h3>Add Account</h3>
          <form className="account-create-form" onSubmit={handleCreateAccount}>
            <input
              type="text"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              placeholder="Account name"
              disabled={creatingAccount}
            />
            <button type="submit" className="btn btn-primary" disabled={creatingAccount}>
              {creatingAccount ? 'Creating...' : 'Create Account'}
            </button>
          </form>
        </section>
      )}

      <section className="account-list-card users-card">
        <h3>All Accounts</h3>
        <div className="accounts-grid">
          {sortedAccounts.map((account) => {
          const isOwnerOfAccount = String(account?.owner?._id || '') === String(user?.id || '');
          const canManageAccount = isOwner && (account.accessLevel === 'owner' || isOwnerOfAccount);
          const summary = account.summary || {};
          const sharedUsers = Array.isArray(account.sharedUsers) ? account.sharedUsers : [];

          return (
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
                    <button type="button" className="btn-cancel-edit" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <h3>{account.name}</h3>
                  </>
                )}
              </div>

              <div className="account-card-body">
                <p className="account-info">
                  <span className="label">Owner:</span>
                  <span className="value">{account.owner?.email || account.email || '-'}</span>
                </p>
                <p className="account-info">
                  <span className="label">Created:</span>
                  <span className="value">{account.createdAt ? new Date(account.createdAt).toLocaleDateString() : '-'}</span>
                </p>
                <p className="account-info">
                  <span className="label">Updated:</span>
                  <span className="value">{account.updatedAt ? new Date(account.updatedAt).toLocaleDateString() : '-'}</span>
                </p>
                <p className="account-info">
                  <span className="label">Shared Users:</span>
                  <span className="value">{summary.sharedUsersCount || sharedUsers.length || 0}</span>
                </p>

                <div className="account-stats">
                  <div className="stat">
                    <span className="stat-label">Campaigns</span>
                    <span className="stat-value">{summary.campaignCount || 0}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Active</span>
                    <span className="stat-value">{summary.activeCampaignCount || 0}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Ad Channels</span>
                    <span className="stat-value">{summary.inventoryCount || 0}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Ad Units</span>
                    <span className="stat-value">{summary.adUnitCount || 0}</span>
                  </div>
                </div>

                <div className="account-stats account-stats-secondary">
                  <div className="stat">
                    <span className="stat-label">Impressions</span>
                    <span className="stat-value">{summary.impressions || 0}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Clicks</span>
                    <span className="stat-value">{summary.clicks || 0}</span>
                  </div>
                </div>

                {canManageAccount && (
                  <div className="share-section">
                    <h4>Shared Access</h4>
                    {sharedUsers.length === 0 && <p className="share-empty">No shared users yet.</p>}
                    {sharedUsers.map((entry) => (
                      <div key={`${account._id}-${entry.userId}`} className="share-row">
                        <span className="share-email">{entry.name ? `${entry.name} — ${entry.email}` : entry.email}</span>
                        <span className="share-level">{entry.accessLevel || 'editor'}</span>
                      </div>
                    ))}
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
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleStartEdit(account)}
                  >
                    Edit Name
                  </button>
                )}

                {canManageAccount && editingId !== account._id && (
                  <>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => openShareModal(account)}
                    >
                      Share
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteAccount(account)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          );
          })}
        </div>
        {sortedAccounts.length === 0 && (
          <div className="no-accounts">
            <p>
              {isOwner
                ? 'No accounts found.'
                : 'No account has been shared with you yet. Please contact the account owner.'}
            </p>
          </div>
        )}
      </section>

      <Modal
        isOpen={Boolean(shareModalAccount)}
        title="Share Account"
        onClose={closeShareModal}
      >
        <div className="share-modal">
          <p className="share-modal-account-name">
            Account: <strong>{shareModalAccount?.name || '-'}</strong>
          </p>

          {loadingShareUsers ? (
            <p className="share-empty">Loading users...</p>
          ) : availableShareUsers.length === 0 ? (
            <p className="share-empty">No users available to share with.</p>
          ) : (
            <>
              <p className="share-modal-label">Select users</p>
              <div className="selectable-checkbox-list share-checkbox-list" role="group" aria-label="Share account users">
                {availableShareUsers.map((candidate) => (
                  <label key={candidate.id} className="selectable-checkbox-item share-checkbox-item">
                    <input
                      type="checkbox"
                      value={candidate.id}
                      checked={selectedUserIds.includes(String(candidate.id))}
                      onChange={handleShareSelectionChange}
                      disabled={sharingSubmitting}
                    />
                    <span>{`${candidate.name || 'User'} — ${candidate.email}`}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="share-modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeShareModal}
              disabled={sharingSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveShare}
              disabled={sharingSubmitting || loadingShareUsers}
            >
              {sharingSubmitting ? 'Saving...' : 'Share'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default AccountManagement;
