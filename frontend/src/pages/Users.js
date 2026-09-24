import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { getApiErrorMessage } from '../utils/apiError';
import '../styles/Users.css';

const emptyCreateForm = {
  name: '',
  email: '',
  password: '',
  passwordConfirm: ''
};

function Users() {
  const { user, updateCurrentUser, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const { notifyError: setError, notifySuccess: setSuccessMessage } = useToast();
  const confirmAction = useConfirm();

  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    passwordConfirm: ''
  });

  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '' });
  const [resetPasswordUserId, setResetPasswordUserId] = useState(null);
  const [resetPasswordForm, setResetPasswordForm] = useState({ newPassword: '', passwordConfirm: '' });
  const [ownerActionTwoFactorToken, setOwnerActionTwoFactorToken] = useState('');
  const [transferForm, setTransferForm] = useState({
    targetEmail: '',
    currentPassword: '',
    twoFactorToken: '',
    confirmationText: ''
  });

  const isOwner = user?.role === 'owner';

  useEffect(() => {
    if (user) {
      setProfileForm({ name: user.name || '', email: user.email || '' });
    }
  }, [user]);

  const loadUsers = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const response = await userAPI.getAll();
      setUsers(response.data?.users || []);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load users'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setError]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const roleA = a.role === 'owner' ? 0 : 1;
      const roleB = b.role === 'owner' ? 0 : 1;
      if (roleA !== roleB) return roleA - roleB;
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      if (nameA !== nameB) return nameA < nameB ? -1 : 1;
      return (a.email || '').localeCompare(b.email || '');
    });
  }, [users]);

  const showSuccess = (message) => {
    setSuccessMessage(message);
  };

  const handleCreateEditor = async (e) => {
    e.preventDefault();
    if (pendingAction) return;
    setError('');

    if (createForm.password !== createForm.passwordConfirm) {
      setError('Passwords do not match');
      return;
    }

    try {
      setPendingAction({ type: 'create', id: 'new' });
      await userAPI.create(createForm);
      setCreateForm(emptyCreateForm);
      showSuccess('User created successfully.');
      await loadUsers({ silent: true });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create user'));
    } finally {
      setPendingAction(null);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (pendingAction) return;
    setError('');

    try {
      setPendingAction({ type: 'profile', id: user?.id });
      const response = await userAPI.updateMe(profileForm);
      if (response.data?.user) {
        updateCurrentUser({
          id: response.data.user.id,
          name: response.data.user.name,
          email: response.data.user.email,
          role: response.data.user.role
        });
      }
      showSuccess('User updated successfully.');
      await loadUsers({ silent: true });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update profile'));
    } finally {
      setPendingAction(null);
    }
  };

  const handleUpdateMyPassword = async (e) => {
    e.preventDefault();
    if (pendingAction) return;
    setError('');

    try {
      setPendingAction({ type: 'password', id: user?.id });
      await userAPI.updateMyPassword(passwordForm);
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        passwordConfirm: ''
      });
      showSuccess('Password updated successfully. Please log in again.');
      setTimeout(() => logout(), 1200);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update password'));
    } finally {
      setPendingAction(null);
    }
  };

  const beginEditUser = (targetUser) => {
    setEditingUserId(targetUser.id);
    setEditForm({
      name: targetUser.name || '',
      email: targetUser.email || ''
    });
  };

  const saveEditUser = async (targetUserId) => {
    if (pendingAction) return;
    setError('');
    try {
      setPendingAction({ type: 'edit', id: targetUserId });
      await userAPI.update(targetUserId, editForm);
      setEditingUserId(null);
      showSuccess('User updated successfully.');
      await loadUsers({ silent: true });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update user'));
    } finally {
      setPendingAction(null);
    }
  };

  const handleToggleStatus = async (targetUser) => {
    if (pendingAction) return;
    setError('');
    try {
      setPendingAction({ type: 'status', id: targetUser.id });
      const nextStatus = targetUser.isActive ? 'disabled' : 'active';
      await userAPI.updateStatus(targetUser.id, {
        status: nextStatus,
        twoFactorToken: ownerActionTwoFactorToken
      });
      showSuccess('User updated successfully.');
      await loadUsers({ silent: true });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update user status'));
    } finally {
      setPendingAction(null);
    }
  };

  const handleDeleteUser = async (targetUser) => {
    const confirmed = await confirmAction({
      title: 'Delete user?',
      message: `The user "${targetUser.name}" will be permanently deleted.`,
      confirmLabel: 'Delete user'
    });
    if (!confirmed) return;
    if (pendingAction) return;
    setError('');
    try {
      setPendingAction({ type: 'delete', id: targetUser.id });
      await userAPI.delete(targetUser.id, { twoFactorToken: ownerActionTwoFactorToken });
      showSuccess('User deleted successfully.');
      await loadUsers({ silent: true });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to delete user'));
    } finally {
      setPendingAction(null);
    }
  };

  const handleOwnerResetPassword = async (targetUserId) => {
    if (pendingAction) return;
    setError('');
    try {
      setPendingAction({ type: 'reset-password', id: targetUserId });
      await userAPI.updatePassword(targetUserId, {
        ...resetPasswordForm,
        twoFactorToken: ownerActionTwoFactorToken
      });
      setResetPasswordUserId(null);
      setResetPasswordForm({ newPassword: '', passwordConfirm: '' });
      showSuccess('Password updated successfully.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update password'));
    } finally {
      setPendingAction(null);
    }
  };

  const handleTransferOwnership = async (e) => {
    e.preventDefault();
    if (pendingAction) return;
    setError('');

    try {
      setPendingAction({ type: 'transfer', id: user?.id });
      await userAPI.reassignOwner(transferForm);
      showSuccess('Ownership transferred successfully. You will be logged out.');
      setTransferForm({
        targetEmail: '',
        currentPassword: '',
        twoFactorToken: '',
        confirmationText: ''
      });
      setTimeout(() => logout(), 1500);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to transfer ownership'));
    } finally {
      setPendingAction(null);
    }
  };

  if (loading) return <div className="loading">Loading users...</div>;

  return (
    <div className="users-page">
      <header className="users-header">
        <h2>Users</h2>
        <p>{isOwner ? 'Manage editor access and user permissions.' : 'View users and update your own profile.'}</p>
        {refreshing && <span className="users-refresh-status">Refreshing…</span>}
      </header>

      <section className="users-card">
        <h3>My Profile</h3>
        <form className="users-form-grid" onSubmit={handleUpdateProfile}>
          <input
            type="text"
            value={profileForm.name}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Your name"
            required
          />
          <input
            type="email"
            value={profileForm.email}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="Your email"
            required
          />
          <button type="submit" className="btn btn-primary" disabled={Boolean(pendingAction)}>
            {pendingAction?.type === 'profile' ? 'Updating…' : 'Update Profile'}
          </button>
        </form>

        <form className="users-form-grid password-grid" onSubmit={handleUpdateMyPassword}>
          <input
            type="password"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
            placeholder="Current password"
            required
            autoComplete="current-password"
          />
          <input
            type="password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
            placeholder="New password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
          <input
            type="password"
            value={passwordForm.passwordConfirm}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, passwordConfirm: e.target.value }))}
            placeholder="Confirm new password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
          <button type="submit" className="btn btn-secondary" disabled={Boolean(pendingAction)}>
            {pendingAction?.type === 'password' ? 'Updating…' : 'Change Password'}
          </button>
        </form>
      </section>

      {isOwner && (
        <section className="users-card">
          <h3>Add Editor</h3>
          <form className="users-form-grid" onSubmit={handleCreateEditor}>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Name"
              required
            />
            <input
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="Email"
              required
              autoComplete="email"
            />
            <input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Temporary password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
            <input
              type="password"
              value={createForm.passwordConfirm}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, passwordConfirm: e.target.value }))}
              placeholder="Confirm temporary password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
            <button type="submit" className="btn btn-primary" disabled={Boolean(pendingAction)}>
              {pendingAction?.type === 'create' ? 'Creating…' : 'Create Editor'}
            </button>
          </form>
        </section>
      )}

      {isOwner && (
        <section className="users-card">
          <h3>Transfer Ownership</h3>
          <p className="users-note">
            This will demote your account to editor and assign owner to an existing active editor account.
            The new owner will be required to complete 2FA setup if not already enabled.
          </p>
          <form className="users-form-grid" onSubmit={handleTransferOwnership}>
            <input
              type="email"
              value={transferForm.targetEmail}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, targetEmail: e.target.value }))}
              placeholder="Target editor email"
              required
              autoComplete="email"
            />
            <input
              type="password"
              value={transferForm.currentPassword}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
              placeholder="Current owner password"
              required
              autoComplete="current-password"
            />
            <input
              type="text"
              value={transferForm.twoFactorToken}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, twoFactorToken: e.target.value }))}
              placeholder="Current owner 2FA code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
            />
            <input
              type="text"
              value={transferForm.confirmationText}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, confirmationText: e.target.value }))}
              placeholder='Type "TRANSFER OWNERSHIP"'
              required
            />
            <button type="submit" className="btn btn-danger" disabled={Boolean(pendingAction)}>
              {pendingAction?.type === 'transfer' ? 'Transferring…' : 'Transfer Ownership'}
            </button>
          </form>
        </section>
      )}

      <section className="users-card">
        <h3>All Users</h3>
        {isOwner && (
          <div className="users-owner-action-token">
            <label>Owner 2FA code for sensitive actions:</label>
            <input
              type="text"
              value={ownerActionTwoFactorToken}
              onChange={(e) => setOwnerActionTwoFactorToken(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="6-digit code"
              autoComplete="one-time-code"
            />
          </div>
        )}
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Updated</th>
                {isOwner && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((row) => {
                const isRowOwner = row.role === 'owner';
                const isRowEditing = editingUserId === row.id;
                return (
                  <tr key={row.id}>
                    <td>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                        />
                      ) : row.name}
                    </td>
                    <td>
                      {isRowEditing ? (
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                        />
                      ) : row.email}
                    </td>
                    <td><span className={`role-pill role-${row.role}`}>{row.role}</span></td>
                    <td>
                      <span className={`status-pill ${row.isActive ? 'active' : 'disabled'}`}>
                        {row.isActive ? 'active' : 'disabled'}
                      </span>
                    </td>
                    <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}</td>
                    <td>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '-'}</td>
                    {isOwner && (
                      <td>
                        {!isRowOwner && (
                          <div className="users-actions">
                            {isRowEditing ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => saveEditUser(row.id)}
                                  disabled={Boolean(pendingAction)}
                                >
                                  {pendingAction?.type === 'edit' && pendingAction.id === row.id
                                    ? 'Saving…'
                                    : 'Save'}
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingUserId(null)}>
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => beginEditUser(row)} disabled={Boolean(pendingAction)}>
                                  Edit
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setResetPasswordUserId(row.id)} disabled={Boolean(pendingAction)}>
                                  Reset Password
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleToggleStatus(row)} disabled={Boolean(pendingAction)}>
                                  {pendingAction?.type === 'status' && pendingAction.id === row.id
                                    ? 'Updating…'
                                    : (row.isActive ? 'Disable' : 'Activate')}
                                </button>
                                <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(row)} disabled={Boolean(pendingAction)}>
                                  {pendingAction?.type === 'delete' && pendingAction.id === row.id
                                    ? 'Deleting…'
                                    : 'Delete'}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isOwner && resetPasswordUserId && (
          <div className="users-reset-box">
            <h4>Reset Editor Password</h4>
            <div className="users-form-grid">
              <input
                type="password"
                value={resetPasswordForm.newPassword}
                onChange={(e) => setResetPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                placeholder="New password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
              <input
                type="password"
                value={resetPasswordForm.passwordConfirm}
                onChange={(e) => setResetPasswordForm((prev) => ({ ...prev, passwordConfirm: e.target.value }))}
                placeholder="Confirm password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleOwnerResetPassword(resetPasswordUserId)}
                disabled={Boolean(pendingAction)}
              >
                {pendingAction?.type === 'reset-password'
                  ? 'Updating…'
                  : 'Update Password'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setResetPasswordUserId(null);
                  setResetPasswordForm({ newPassword: '', passwordConfirm: '' });
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default Users;
