import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../services/api';
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
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await userAPI.getAll();
      setUsers(response.data?.users || []);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load users');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

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
    setTimeout(() => setSuccessMessage(''), 2500);
  };

  const handleCreateEditor = async (e) => {
    e.preventDefault();
    setError('');

    if (createForm.password !== createForm.passwordConfirm) {
      setError('Passwords do not match');
      return;
    }

    try {
      await userAPI.create(createForm);
      setCreateForm(emptyCreateForm);
      showSuccess('User created successfully.');
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create user');
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setError('');

    try {
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
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile');
    }
  };

  const handleUpdateMyPassword = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await userAPI.updateMyPassword(passwordForm);
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        passwordConfirm: ''
      });
      showSuccess('Password updated successfully.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update password');
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
    setError('');
    try {
      await userAPI.update(targetUserId, editForm);
      setEditingUserId(null);
      showSuccess('User updated successfully.');
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user');
    }
  };

  const handleToggleStatus = async (targetUser) => {
    setError('');
    try {
      const nextStatus = targetUser.isActive ? 'disabled' : 'active';
      await userAPI.updateStatus(targetUser.id, {
        status: nextStatus,
        twoFactorToken: ownerActionTwoFactorToken
      });
      showSuccess('User updated successfully.');
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user status');
    }
  };

  const handleDeleteUser = async (targetUser) => {
    if (!window.confirm(`Delete user "${targetUser.name}"?`)) return;
    setError('');
    try {
      await userAPI.delete(targetUser.id, { twoFactorToken: ownerActionTwoFactorToken });
      showSuccess('User deleted successfully.');
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleOwnerResetPassword = async (targetUserId) => {
    setError('');
    try {
      await userAPI.updatePassword(targetUserId, {
        ...resetPasswordForm,
        twoFactorToken: ownerActionTwoFactorToken
      });
      setResetPasswordUserId(null);
      setResetPasswordForm({ newPassword: '', passwordConfirm: '' });
      showSuccess('Password updated successfully.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update password');
    }
  };

  const handleTransferOwnership = async (e) => {
    e.preventDefault();
    setError('');

    try {
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
      setError(err.response?.data?.message || 'Failed to transfer ownership');
    }
  };

  if (loading) return <div className="loading">Loading users...</div>;

  return (
    <div className="users-page">
      <header className="users-header">
        <h2>Users</h2>
        <p>{isOwner ? 'Manage editor access and user permissions.' : 'View users and update your own profile.'}</p>
      </header>

      {successMessage && <div className="alert alert-success">{successMessage}</div>}
      {error && (
        <div className="alert alert-error">
          {error}
          <button onClick={() => setError('')} className="alert-close">✕</button>
        </div>
      )}

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
          <button type="submit" className="btn btn-primary">Update Profile</button>
        </form>

        <form className="users-form-grid password-grid" onSubmit={handleUpdateMyPassword}>
          <input
            type="password"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
            placeholder="Current password"
            required
          />
          <input
            type="password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
            placeholder="New password"
            required
            minLength={6}
          />
          <input
            type="password"
            value={passwordForm.passwordConfirm}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, passwordConfirm: e.target.value }))}
            placeholder="Confirm new password"
            required
            minLength={6}
          />
          <button type="submit" className="btn btn-secondary">Change Password</button>
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
            />
            <input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Temporary password"
              required
              minLength={6}
            />
            <input
              type="password"
              value={createForm.passwordConfirm}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, passwordConfirm: e.target.value }))}
              placeholder="Confirm temporary password"
              required
              minLength={6}
            />
            <button type="submit" className="btn btn-primary">Create Editor</button>
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
            />
            <input
              type="password"
              value={transferForm.currentPassword}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
              placeholder="Current owner password"
              required
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
            />
            <input
              type="text"
              value={transferForm.confirmationText}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, confirmationText: e.target.value }))}
              placeholder='Type "TRANSFER OWNERSHIP"'
              required
            />
            <button type="submit" className="btn btn-danger">Transfer Ownership</button>
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
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => saveEditUser(row.id)}>
                                  Save
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingUserId(null)}>
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => beginEditUser(row)}>
                                  Edit
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setResetPasswordUserId(row.id)}>
                                  Reset Password
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleToggleStatus(row)}>
                                  {row.isActive ? 'Disable' : 'Activate'}
                                </button>
                                <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(row)}>
                                  Delete
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
                minLength={6}
              />
              <input
                type="password"
                value={resetPasswordForm.passwordConfirm}
                onChange={(e) => setResetPasswordForm((prev) => ({ ...prev, passwordConfirm: e.target.value }))}
                placeholder="Confirm password"
                minLength={6}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleOwnerResetPassword(resetPasswordUserId)}
              >
                Update Password
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
