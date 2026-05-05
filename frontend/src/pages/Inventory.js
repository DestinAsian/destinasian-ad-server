import React, { useEffect, useMemo, useState } from "react";
import { inventoryAPI } from "../services/api";
import "../styles/Inventory.css";

function Inventory() {
  const [inventories, setInventories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [form, setForm] = useState({
    name: "",
    key: "",
    description: "",
  });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    key: "",
    description: "",
    isActive: true,
  });
  const cmsScriptTag = `<script src="https://YOUR-AD-SERVER.DOMAIN/ad-client.js"></script>`;

  const loadData = async () => {
    try {
      const response = await inventoryAPI.getAll();
      const inventoryList = response.data || [];
      const uniqueInventories = Array.from(
        new Map(inventoryList.map((item) => [item._id, item])).values(),
      );
      setInventories(uniqueInventories);
      setLoading(false);
    } catch (err) {
      setError("Failed to load inventory data");
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const sortedInventories = useMemo(() => {
    return [...inventories]
      .map((inventory, index) => ({ inventory, index }))
      .sort((a, b) => {
        const nameA = (a.inventory?.name || "").toLowerCase();
        const nameB = (b.inventory?.name || "").toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return a.index - b.index;
      })
      .map(({ inventory }) => inventory);
  }, [inventories]);

  const showCopiedFeedback = () => {
    setSuccessMessage("Copied to the clipboard");
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  const copyToClipboard = async (text) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(text);
      showCopiedFeedback();
      return true;
    } catch (copyError) {
      setError("Failed to copy");
      return false;
    }
  };

  const slugifyKey = (value) => {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
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

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      await inventoryAPI.create({
        name: form.name,
        key: form.key,
        description: form.description,
      });

      setForm({
        name: "",
        key: "",
        description: "",
      });
      setSuccessMessage("Inventory created");
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create inventory");
    }
  };

  const startEdit = (inventory) => {
    setEditingId(inventory._id);
    setEditForm({
      name: inventory.name || "",
      key: inventory.key || "",
      description: inventory.description || "",
      isActive: inventory.isActive !== false,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({
      name: "",
      key: "",
      description: "",
      isActive: true,
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      await inventoryAPI.update(editingId, editForm);
      setEditingId(null);
      setSuccessMessage("Inventory updated");
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update inventory");
    }
  };

  const handleDelete = async (inventory) => {
    if (!window.confirm(`Delete inventory "${inventory.name}"?`)) return;
    setError(null);

    try {
      await inventoryAPI.delete(inventory._id);
      setSuccessMessage("Inventory deleted");
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete inventory");
    }
  };

  const handleDuplicate = async (inventory) => {
    setError(null);

    try {
      const existingNames = new Set(inventories.map((item) => item.name));
      const existingKeys = new Set(inventories.map((item) => item.key));
      const name = generateCopyName(inventory.name, existingNames);
      const key = generateCopyKey(inventory.key, existingKeys);

      await inventoryAPI.create({
        name,
        key,
        description: inventory.description || "",
      });

      setSuccessMessage("Inventory duplicated");
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to duplicate inventory");
    }
  };

  if (loading) return <div className="loading">Loading inventory...</div>;

  return (
    <div className="inventory-page">
      <header className="inventory-header">
        <div>
          <h2>Inventory</h2>
          <p>Create and manage ad placement inventories.</p>
        </div>
      </header>

      {successMessage && (
        <div className="alert alert-success">{successMessage}</div>
      )}
      {error && (
        <div className="alert alert-error">
          {error}
          <button onClick={() => setError(null)} className="alert-close">
            ✕
          </button>
        </div>
      )}
      <div className="ad-unit-cms">
        <div className="ad-unit-cms-label">CMS Setup</div>
        <div className="ad-unit-cms-description">
          Add this script inside the {`<Head>`} element of your website or CMS
          template.
        </div>
        <code className="ad-unit-cms-code">{cmsScriptTag}</code>
        <div className="ad-unit-cms-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              await copyToClipboard(`${cmsScriptTag}\n`);
            }}
          >
            Copy CMS Tag
          </button>
        </div>
      </div>
      <div className="inventory-card">
        <h3>Create Inventory</h3>
        <form onSubmit={handleCreate} className="inventory-form">
          <input
            type="text"
            placeholder="Name (e.g., Homepage Banner)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Key (optional, e.g., homepage-banner)"
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <button type="submit" className="btn btn-primary">
            Create
          </button>
        </form>
      </div>

      <section className="inventory-card">
        <h3>Inventories</h3>
        <div className="inventory-list">
          {sortedInventories.length === 0 && (
            <p className="no-data">No inventory yet.</p>
          )}
          {sortedInventories.map((inventory) => (
            <div key={inventory._id} className="inventory-item">
              {editingId === inventory._id ? (
                <form onSubmit={handleUpdate} className="inventory-edit-form">
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                    required
                  />
                  <input
                    type="text"
                    value={editForm.key}
                    onChange={(e) =>
                      setEditForm({ ...editForm, key: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                  />
                  <label className="inventory-toggle">
                    <input
                      type="checkbox"
                      checked={editForm.isActive}
                      onChange={(e) =>
                        setEditForm({ ...editForm, isActive: e.target.checked })
                      }
                    />
                    Active
                  </label>
                  <button type="submit" className="btn btn-primary btn-sm">
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={cancelEdit}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <div className="inventory-main">
                    <div className="inventory-info">
                      <div className="inventory-name">{inventory.name}</div>
                      <div className="inventory-key">Key: {inventory.key}</div>
                      {inventory.description && (
                        <div className="inventory-desc">
                          {inventory.description}
                        </div>
                      )}
                      <div
                        className={`inventory-status ${inventory.isActive ? "active" : "inactive"}`}
                      >
                        {inventory.isActive ? "Active" : "Inactive"}
                      </div>
                      <div className="inventory-snippet">
                        <div className="inventory-snippet-label">CMS Tag</div>
                        <code>{`<div data-inventory="${inventory.key}" data-width="100%"></div>`}</code>
                        <div className="inventory-snippet-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={async () => {
                              await copyToClipboard(
                                `<div data-inventory="${inventory.key}" data-width="100%"></div>`,
                              );
                            }}
                          >
                            Copy Tag
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="inventory-actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleDuplicate(inventory)}
                    >
                      Duplicate
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => startEdit(inventory)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(inventory)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default Inventory;
