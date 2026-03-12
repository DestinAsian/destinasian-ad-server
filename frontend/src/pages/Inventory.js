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
      const list = response.data || [];
      const unique = Array.from(new Map(list.map(item => [item._id, item])).values());
      setInventories(unique);
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

  const slugifyKey = (value) => {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };

  const generateCopyName = (baseName, existingNames) => {
    const clean = baseName.trim();
    const match = clean.match(/^(.*?)(?:\s+(\d+))$/);
    let base = clean;
    let num = null;
    if (match) {
      base = (match[1] || clean).trim();
      num = parseInt(match[2], 10);
    }
    if (num !== null) {
      const candidate = `${base} ${num + 1}`;
      if (!existingNames.has(candidate)) return candidate;
    }
    let i = 2;
    let candidate = `${clean} ${i}`;
    while (existingNames.has(candidate)) {
      i += 1;
      candidate = `${clean} ${i}`;
    }
    return candidate;
  };

  const generateCopyKey = (baseKey, existingKeys) => {
    const clean = slugifyKey(baseKey);
    const match = clean.match(/^(.*?)-(\d+)$/);
    let base = clean;
    let num = null;
    if (match) {
      base = match[1];
      num = parseInt(match[2], 10);
    }
    if (num !== null) {
      const candidate = `${base}-${num + 1}`;
      if (!existingKeys.has(candidate)) return candidate;
    }
    let i = 2;
    let candidate = `${clean}-${i}`;
    while (existingKeys.has(candidate)) {
      i += 1;
      candidate = `${clean}-${i}`;
    }
    return candidate;
  };

  const handleDuplicate = async (inv) => {
    setError(null);
    try {
      const existingNames = new Set(inventories.map(i => i.name));
      const existingKeys = new Set(inventories.map(i => i.key));
      const name = generateCopyName(inv.name, existingNames);
      const key = generateCopyKey(inv.key, existingKeys);
      await inventoryAPI.create({
        name,
        key,
        description: inv.description || '',
        rotationMode: inv.rotationMode || 'single'
      });
      setSuccessMessage('Inventory duplicated');
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadInventories();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to duplicate inventory');
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
                  <button className="btn btn-secondary btn-sm" onClick={() => handleDuplicate(inv)}>Duplicate</button>
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
