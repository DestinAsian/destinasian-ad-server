import React, { useEffect, useState } from 'react';
import { inventoryAPI } from '../services/api';
import '../styles/Inventory.css';

function Inventory() {
  const [inventories, setInventories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [form, setForm] = useState({ name: '', key: '', description: '', rotationMode: 'single' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', key: '', description: '', rotationMode: 'single', isActive: true });

  const loadInventories = async () => {
    try {
      const response = await inventoryAPI.getAll();
      setInventories(response.data || []);
      setLoading(false);
    } catch (err) {
      setError('Failed to load inventories');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventories();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await inventoryAPI.create({
        name: form.name,
        key: form.key,
        description: form.description,
        rotationMode: form.rotationMode
      });
      setForm({ name: '', key: '', description: '', rotationMode: 'single' });
      setSuccessMessage('Inventory created');
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadInventories();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create inventory');
    }
  };

  const startEdit = (inv) => {
    setEditingId(inv._id);
    setEditForm({
      name: inv.name || '',
      key: inv.key || '',
      description: inv.description || '',
      rotationMode: inv.rotationMode || 'single',
      isActive: inv.isActive !== false
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: '', key: '', description: '', rotationMode: 'single', isActive: true });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await inventoryAPI.update(editingId, editForm);
      setSuccessMessage('Inventory updated');
      setTimeout(() => setSuccessMessage(null), 2500);
      setEditingId(null);
      await loadInventories();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update inventory');
    }
  };

  const handleDelete = async (inv) => {
    if (!window.confirm(`Delete inventory "${inv.name}"?`)) return;
    setError(null);
    try {
      await inventoryAPI.delete(inv._id);
      setSuccessMessage('Inventory deleted');
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadInventories();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete inventory');
    }
  };

  if (loading) return <div className="loading">Loading inventory...</div>;

  return (
    <div className="inventory-page">
      <header className="inventory-header">
        <h2>Inventory</h2>
      </header>

      {successMessage && <div className="alert alert-success">{successMessage}</div>}
      {error && (
        <div className="alert alert-error">
          {error}
          <button onClick={() => setError(null)} className="alert-close">✕</button>
        </div>
      )}

      <div className="inventory-card">
        <h3>Create Inventory</h3>
        <form onSubmit={handleCreate} className="inventory-form">
          <input
            type="text"
            placeholder="Name (e.g., Homepage Top)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Key (optional, e.g., homepage-top)"
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <select
            value={form.rotationMode}
            onChange={(e) => setForm({ ...form, rotationMode: e.target.value })}
          >
            <option value="single">Single ad</option>
            <option value="rotate">Rotate ads</option>
          </select>
          <button type="submit" className="btn btn-primary">Create</button>
        </form>
      </div>

      <div className="inventory-list">
        {inventories.length === 0 && <p>No inventory yet.</p>}
        {inventories.map((inv) => (
          <div key={inv._id} className="inventory-item">
            {editingId === inv._id ? (
              <form onSubmit={handleUpdate} className="inventory-edit-form">
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
                <input
                  type="text"
                  value={editForm.key}
                  onChange={(e) => setEditForm({ ...editForm, key: e.target.value })}
                />
                <input
                  type="text"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
                <select
                  value={editForm.rotationMode}
                  onChange={(e) => setEditForm({ ...editForm, rotationMode: e.target.value })}
                >
                  <option value="single">Single ad</option>
                  <option value="rotate">Rotate ads</option>
                </select>
                <label className="inventory-toggle">
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                  />
                  Active
                </label>
                <button type="submit" className="btn btn-primary btn-sm">Save</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEdit}>Cancel</button>
              </form>
            ) : (
              <>
                <div className="inventory-info">
                  <div className="inventory-name">{inv.name}</div>
                  <div className="inventory-key">Key: {inv.key}</div>
                  {inv.description && <div className="inventory-desc">{inv.description}</div>}
                  <div className="inventory-desc">Mode: {inv.rotationMode === 'rotate' ? 'Rotate ads' : 'Single ad'}</div>
                  <div className={`inventory-status ${inv.isActive ? 'active' : 'inactive'}`}>
                    {inv.isActive ? 'Active' : 'Inactive'}
                  </div>
                  <div className="inventory-snippet">
                    <div className="inventory-snippet-label">CMS Tag</div>
                    <code>{`<div data-inventory=\"${inv.key}\" data-width=\"100%\"></div>`}</code>
                    <div className="inventory-snippet-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={async () => {
                          const text = `<div data-inventory=\"${inv.key}\" data-width=\"100%\"></div>`;
                          if (navigator.clipboard?.writeText) {
                            await navigator.clipboard.writeText(text);
                          }
                        }}
                      >
                        Copy Tag
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={async () => {
                          const text = inv.key;
                          if (navigator.clipboard?.writeText) {
                            await navigator.clipboard.writeText(text);
                          }
                        }}
                      >
                        Copy Key
                      </button>
                    </div>
                  </div>
                </div>
                <div className="inventory-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => startEdit(inv)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(inv)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Inventory;
