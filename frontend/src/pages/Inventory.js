import React, { useCallback, useEffect, useMemo, useState } from "react";
import { adUnitAPI, inventoryAPI } from "../services/api";
import "../styles/Inventory.css";

const isAdUnitLinkedToChannel = (adUnit, channelId) => {
  const targetId = String(channelId || "");
  if (!targetId) return false;

  const inventoryIds = Array.isArray(adUnit?.inventories)
    ? adUnit.inventories.map((entry) => String(entry?._id || entry))
    : [];
  const primaryInventoryId = adUnit?.inventory ? String(adUnit.inventory?._id || adUnit.inventory) : null;

  return inventoryIds.includes(targetId) || primaryInventoryId === targetId;
};

function Inventory({ searchQuery = "" }) {
  const [inventories, setInventories] = useState([]);
  const [adUnits, setAdUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [runningAdsOnly, setRunningAdsOnly] = useState(false);
  const [form, setForm] = useState({
    name: "",
    key: "",
    description: "",
    adUnitIds: [],
  });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    key: "",
    description: "",
    isActive: true,
    adUnitIds: [],
  });
  const cmsScriptTag = `<script src="https://YOUR-AD-SERVER.DOMAIN/ad-client.js"></script>`;

  const loadData = useCallback(async () => {
    try {
      const [inventoryResponse, adUnitResponse] = await Promise.all([
        inventoryAPI.getAll({ runningAdsOnly }),
        adUnitAPI.getAll(),
      ]);
      const inventoryList = inventoryResponse.data || [];
      const adUnitList = adUnitResponse.data || [];
      const uniqueInventories = Array.from(
        new Map(inventoryList.map((item) => [item._id, item])).values(),
      );
      const uniqueAdUnits = Array.from(
        new Map(adUnitList.map((item) => [item._id, item])).values(),
      );
      setInventories(uniqueInventories);
      setAdUnits(uniqueAdUnits);
      setLoading(false);
    } catch (err) {
      setError("Failed to load ad channel data");
      setLoading(false);
    }
  }, [runningAdsOnly]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sortedInventories = useMemo(() => {
    const normalizedSearch = String(searchQuery || "").trim().toLowerCase();
    return [...inventories]
      .map((inventory, index) => ({ inventory, index }))
      .filter(({ inventory }) => {
        if (!normalizedSearch) return true;
        return (inventory?.name || "").toLowerCase().includes(normalizedSearch);
      })
      .sort((a, b) => {
        const nameA = (a.inventory?.name || "").toLowerCase();
        const nameB = (b.inventory?.name || "").toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return a.index - b.index;
      })
      .map(({ inventory }) => inventory);
  }, [inventories, searchQuery]);

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
        adUnitIds: form.adUnitIds,
      });

      setForm({
        name: "",
        key: "",
        description: "",
        adUnitIds: [],
      });
      setSuccessMessage("Ad Channel created");
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create ad channel");
    }
  };

  const startEdit = (inventory) => {
    setEditingId(inventory._id);
    setEditForm({
      name: inventory.name || "",
      key: inventory.key || "",
      description: inventory.description || "",
      isActive: inventory.isActive !== false,
      adUnitIds: adUnits
        .filter((adUnit) => isAdUnitLinkedToChannel(adUnit, inventory._id))
        .map((adUnit) => String(adUnit._id)),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({
      name: "",
      key: "",
      description: "",
      isActive: true,
      adUnitIds: [],
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      await inventoryAPI.update(editingId, editForm);
      setEditingId(null);
      setSuccessMessage("Ad Channel updated");
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update ad channel");
    }
  };

  const handleDelete = async (inventory) => {
    if (!window.confirm(`Delete ad channel "${inventory.name}"?`)) return;
    setError(null);

    try {
      await inventoryAPI.delete(inventory._id);
      setSuccessMessage("Ad Channel deleted");
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete ad channel");
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

      setSuccessMessage("Ad Channel duplicated");
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to duplicate ad channel");
    }
  };

  const createAdUnitSelection = useMemo(() => new Set(form.adUnitIds.map((id) => String(id))), [form.adUnitIds]);
  const editAdUnitSelection = useMemo(() => new Set(editForm.adUnitIds.map((id) => String(id))), [editForm.adUnitIds]);

  if (loading) return <div className="loading">Loading ad channels...</div>;

  return (
    <div className="inventory-page">
      <header className="inventory-header">
        <div>
          <h2>Ad Channels</h2>
          <p>Create and manage ad placement channels.</p>
        </div>
        <div className="inventory-toolbar">
          <label htmlFor="running-ads-only">Show only running ads</label>
          <select
            id="running-ads-only"
            value={runningAdsOnly ? "yes" : "no"}
            onChange={(e) => setRunningAdsOnly(e.target.value === "yes")}
          >
            <option value="no">All Ad Channels</option>
            <option value="yes">Running Ads</option>
          </select>
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
        <h3>Create Ad Channel</h3>
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
          <div className="inventory-form-adunits">
            <div className="inventory-form-adunits-label">Ad Units</div>
            {adUnits.length === 0 ? (
              <p className="no-data">No ad units available.</p>
            ) : (
              <div className="selectable-checkbox-list inventory-adunit-list">
                {adUnits.map((adUnit) => {
                  const adUnitId = String(adUnit._id);
                  const checked = createAdUnitSelection.has(adUnitId);
                  return (
                    <label key={adUnitId} className={`selectable-checkbox-item ${checked ? "selected" : ""}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setForm((prev) => {
                            const set = new Set(prev.adUnitIds.map((id) => String(id)));
                            if (set.has(adUnitId)) set.delete(adUnitId);
                            else set.add(adUnitId);
                            return { ...prev, adUnitIds: [...set] };
                          });
                        }}
                      />
                      <span>{adUnit.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <button type="submit" className="btn btn-primary">
            Create
          </button>
        </form>
      </div>

      <section className="inventory-card">
        <h3>Ad Channels</h3>
        <div className="inventory-list">
          {sortedInventories.length === 0 && (
            <p className="no-data">
              {runningAdsOnly
                ? "No Ad Channels with running ads found."
                : "No ad channels yet."}
            </p>
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
                  <div className="inventory-form-adunits inventory-form-adunits-inline">
                    <div className="inventory-form-adunits-label">Ad Units</div>
                    {adUnits.length === 0 ? (
                      <p className="no-data">No ad units available.</p>
                    ) : (
                      <div className="selectable-checkbox-list inventory-adunit-list">
                        {adUnits.map((adUnit) => {
                          const adUnitId = String(adUnit._id);
                          const checked = editAdUnitSelection.has(adUnitId);
                          return (
                            <label key={adUnitId} className={`selectable-checkbox-item ${checked ? "selected" : ""}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setEditForm((prev) => {
                                    const set = new Set(prev.adUnitIds.map((id) => String(id)));
                                    if (set.has(adUnitId)) set.delete(adUnitId);
                                    else set.add(adUnitId);
                                    return { ...prev, adUnitIds: [...set] };
                                  });
                                }}
                              />
                              <span>{adUnit.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
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
                      <div className="inventory-snippet-label">
                        Linked Ad Units: {adUnits.filter((adUnit) => isAdUnitLinkedToChannel(adUnit, inventory._id)).length}
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
