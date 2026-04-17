import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { inventoryAPI, inventoryGroupAPI } from '../services/api';
import '../styles/Inventory.css';

function Inventory() {
  const [inventories, setInventories] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [inventorySort, setInventorySort] = useState('recent');
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [form, setForm] = useState({ name: '', key: '', description: '', groupName: '', rotationMode: 'single' });
  const [groupForm, setGroupForm] = useState({ name: '', description: '', sortOrder: '' });
  const [editingId, setEditingId] = useState(null);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', key: '', description: '', groupName: '', rotationMode: 'single', isActive: true });
  const [editGroupForm, setEditGroupForm] = useState({ name: '', description: '', sortOrder: '' });
  const [editGroupInventoryIds, setEditGroupInventoryIds] = useState([]);

  const loadData = async () => {
    try {
      const [groupResponse, inventoryResponse] = await Promise.all([
        inventoryGroupAPI.getAll(),
        inventoryAPI.getAll()
      ]);

      const inventoryList = inventoryResponse.data || [];
      const uniqueInventories = Array.from(new Map(inventoryList.map((item) => [item._id, item])).values());
      const groupList = groupResponse.data || [];

      setGroups(groupList);
      setInventories(uniqueInventories);
      setCollapsedGroups((current) => {
        const nextState = { ...current };
        groupList.forEach((group) => {
          if (typeof nextState[group._id] === 'undefined') {
            nextState[group._id] = false;
          }
        });

        const validKeys = new Set(groupList.map((group) => group._id));
        if (uniqueInventories.some((inventory) => inventory.groupName && !groupList.some((group) => group.name === inventory.groupName))) {
          validKeys.add('orphaned-group');
          if (typeof nextState['orphaned-group'] === 'undefined') {
            nextState['orphaned-group'] = false;
          }
        }

        return Object.keys(nextState).reduce((accumulator, key) => {
          if (validKeys.has(key)) {
            accumulator[key] = nextState[key];
          }
          return accumulator;
        }, {});
      });
      setForm((current) => ({
        ...current,
        groupName: current.groupName || groupList[0]?.name || ''
      }));
      setLoading(false);
    } catch (err) {
      setError('Failed to load inventory data');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const sortInventories = useCallback((inventoryList) => {
    const list = [...inventoryList];

    switch (inventorySort) {
      case 'name':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'key':
        return list.sort((a, b) => a.key.localeCompare(b.key));
      case 'active':
        return list.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
      case 'recent':
      default:
        return list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }
  }, [inventorySort]);

  const groupedInventories = useMemo(() => {
    const sections = groups.map((group) => ({
      ...group,
      inventories: sortInventories(
        inventories.filter((inventory) => inventory.groupName === group.name)
      )
    }));

    const orphanedInventories = inventories.filter((inventory) => inventory.groupName && !groups.some((group) => group.name === inventory.groupName));
    if (orphanedInventories.length > 0) {
      sections.push({
        _id: 'orphaned-group',
        name: 'Unlinked Groups',
        description: 'Legacy inventories with missing group records',
        sortOrder: 9999,
        inventories: sortInventories(orphanedInventories)
      });
    }

    return sections;
  }, [groups, inventories, sortInventories]);

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

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      await inventoryGroupAPI.create({
        name: groupForm.name,
        description: groupForm.description,
        sortOrder: groupForm.sortOrder === '' ? undefined : Number(groupForm.sortOrder)
      });

      setGroupForm({ name: '', description: '', sortOrder: '' });
      setSuccessMessage('Inventory group created');
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create inventory group');
    }
  };

  const startEditGroup = (group) => {
    setEditingGroupId(group._id);
    setEditGroupForm({
      name: group.name || '',
      description: group.description || '',
      sortOrder: group.sortOrder ?? ''
    });
    setEditGroupInventoryIds(
      inventories
        .filter((inventory) => inventory.groupName === group.name)
        .map((inventory) => inventory._id)
    );
  };

  const cancelEditGroup = () => {
    setEditingGroupId(null);
    setEditGroupForm({ name: '', description: '', sortOrder: '' });
    setEditGroupInventoryIds([]);
  };

  const handleUpdateGroup = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      const currentGroup = groups.find((group) => group._id === editingGroupId);
      const previousGroupName = currentGroup?.name || '';
      const nextGroupName = (editGroupForm.name || '').trim();
      const currentGroupInventoryIds = inventories
        .filter((inventory) => inventory.groupName === previousGroupName)
        .map((inventory) => inventory._id);
      const removedInventoryIds = currentGroupInventoryIds.filter((inventoryId) => !editGroupInventoryIds.includes(inventoryId));

      if (removedInventoryIds.length > 0) {
        setError(`To move inventory out of "${previousGroupName}", open the destination group and check it there first.`);
        return;
      }

      await inventoryGroupAPI.update(editingGroupId, {
        name: nextGroupName,
        description: editGroupForm.description,
        sortOrder: editGroupForm.sortOrder === '' ? 0 : Number(editGroupForm.sortOrder)
      });

      const inventoriesToMove = inventories.filter(
        (inventory) => editGroupInventoryIds.includes(inventory._id) && inventory.groupName !== previousGroupName
      );

      await Promise.all(
        inventoriesToMove.map((inventory) => inventoryAPI.update(inventory._id, { groupName: nextGroupName }))
      );

      setEditingGroupId(null);
      setEditGroupInventoryIds([]);
      setSuccessMessage('Inventory group updated');
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update inventory group');
    }
  };

  const handleDeleteGroup = async (group) => {
    if (!window.confirm(`Delete inventory group "${group.name}"?`)) return;
    setError(null);

    try {
      await inventoryGroupAPI.delete(group._id);
      setSuccessMessage('Inventory group deleted');
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete inventory group');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      await inventoryAPI.create({
        name: form.name,
        key: form.key,
        description: form.description,
        groupName: form.groupName,
        rotationMode: form.rotationMode
      });

      setForm({
        name: '',
        key: '',
        description: '',
        groupName: groups[0]?.name || '',
        rotationMode: 'single'
      });
      setSuccessMessage('Inventory created');
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create inventory');
    }
  };

  const startEdit = (inventory) => {
    setEditingId(inventory._id);
    setEditForm({
      name: inventory.name || '',
      key: inventory.key || '',
      description: inventory.description || '',
      groupName: inventory.groupName || groups[0]?.name || '',
      rotationMode: inventory.rotationMode || 'single',
      isActive: inventory.isActive !== false
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: '', key: '', description: '', groupName: groups[0]?.name || '', rotationMode: 'single', isActive: true });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      await inventoryAPI.update(editingId, editForm);
      setEditingId(null);
      setSuccessMessage('Inventory updated');
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update inventory');
    }
  };

  const handleDelete = async (inventory) => {
    if (!window.confirm(`Delete inventory "${inventory.name}"?`)) return;
    setError(null);

    try {
      await inventoryAPI.delete(inventory._id);
      setSuccessMessage('Inventory deleted');
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete inventory');
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
        description: inventory.description || '',
        groupName: inventory.groupName,
        rotationMode: inventory.rotationMode || 'single'
      });

      setSuccessMessage('Inventory duplicated');
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to duplicate inventory');
    }
  };

  const toggleEditGroupInventory = (inventoryId) => {
    setEditGroupInventoryIds((current) => (
      current.includes(inventoryId)
        ? current.filter((id) => id !== inventoryId)
        : [...current, inventoryId]
    ));
  };

  const toggleGroupCollapse = (groupId) => {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId]
    }));
  };

  if (loading) return <div className="loading">Loading inventory...</div>;

  return (
    <div className="inventory-page">
      <header className="inventory-header">
        <div>
          <h2>Inventory</h2>
          <p>Manage inventory groups first, then place each inventory inside the right group.</p>
        </div>
        <div className="inventory-toolbar">
          <label htmlFor="inventory-sort">Sort Inventory</label>
          <select
            id="inventory-sort"
            value={inventorySort}
            onChange={(e) => setInventorySort(e.target.value)}
          >
            <option value="recent">Newest First</option>
            <option value="name">Name</option>
            <option value="key">Key</option>
            <option value="active">Active First</option>
          </select>
        </div>
      </header>

      {successMessage && <div className="alert alert-success">{successMessage}</div>}
      {error && (
        <div className="alert alert-error">
          {error}
          <button onClick={() => setError(null)} className="alert-close">✕</button>
        </div>
      )}

      <div className="inventory-group-card inventory-card">
        <h3>Inventory Groups</h3>
        <form onSubmit={handleCreateGroup} className="inventory-group-form">
          <input
            type="text"
            placeholder='Group Name (e.g., Singapore Banner)'
            value={groupForm.name}
            onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={groupForm.description}
            onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
          />
          <input
            type="number"
            placeholder="Sort Order"
            value={groupForm.sortOrder}
            onChange={(e) => setGroupForm({ ...groupForm, sortOrder: e.target.value })}
            min="0"
          />
          <button type="submit" className="btn btn-primary">Add Group</button>
        </form>

        <div className="inventory-group-list">
          {groups.map((group) => {
            const inventoryCount = inventories.filter((inventory) => inventory.groupName === group.name).length;
            const groupInventories = [...inventories]
              .sort((a, b) => a.name.localeCompare(b.name));

            return (
              <div key={group._id} className="inventory-group-item">
                {editingGroupId === group._id ? (
                  <form onSubmit={handleUpdateGroup} className="inventory-group-edit-form">
                    <div className="inventory-group-edit-fields">
                      <input
                        type="text"
                        value={editGroupForm.name}
                        onChange={(e) => setEditGroupForm({ ...editGroupForm, name: e.target.value })}
                        required
                      />
                      <input
                        type="text"
                        value={editGroupForm.description}
                        onChange={(e) => setEditGroupForm({ ...editGroupForm, description: e.target.value })}
                        placeholder="Description"
                      />
                      <input
                        type="number"
                        value={editGroupForm.sortOrder}
                        onChange={(e) => setEditGroupForm({ ...editGroupForm, sortOrder: e.target.value })}
                        min="0"
                      />
                    </div>
                    <div className="inventory-group-picker">
                      <div className="inventory-group-picker-header">
                        <strong>Choose Inventories For This Group</strong>
                        <span>Checked inventories will belong to {editGroupForm.name || group.name}.</span>
                        <span>To move an inventory out, open its destination group and check it there.</span>
                      </div>
                      <div className="inventory-group-picker-list">
                        {groupInventories.map((inventory) => (
                          <label key={inventory._id} className="inventory-group-picker-item">
                            <input
                              type="checkbox"
                              checked={editGroupInventoryIds.includes(inventory._id)}
                              onChange={() => toggleEditGroupInventory(inventory._id)}
                            />
                            <span className="inventory-group-picker-text">
                              <span className="inventory-group-picker-name">{inventory.name}</span>
                              <span className="inventory-group-picker-meta">
                                {inventory.key} · Currently in {inventory.groupName}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="inventory-group-edit-actions">
                      <button type="submit" className="btn btn-primary btn-sm">Save</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEditGroup}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="inventory-group-info">
                      <div className="inventory-group-name">{group.name}</div>
                      {group.description && <div className="inventory-group-meta">{group.description}</div>}
                      <div className="inventory-group-meta">Sort Order: {group.sortOrder ?? 0}</div>
                      <div className="inventory-group-meta">{inventoryCount} inventories</div>
                    </div>
                    <div className="inventory-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => startEditGroup(group)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteGroup(group)}>Delete</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

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
            value={form.groupName}
            onChange={(e) => setForm({ ...form, groupName: e.target.value })}
            required
          >
            <option value="">Select Inventory Group</option>
            {groups.map((group) => (
              <option key={group._id} value={group.name}>
                {group.name}
              </option>
            ))}
          </select>
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

      <div className="inventory-section-list">
        {groupedInventories.map((group) => (
          <section key={group._id} className={`inventory-group-section ${collapsedGroups[group._id] ? 'is-collapsed' : ''}`}>
            <button
              type="button"
              className="inventory-group-section-header"
              onClick={() => toggleGroupCollapse(group._id)}
              aria-expanded={!collapsedGroups[group._id]}
            >
              <div>
                <h3>{group.name}</h3>
                {group.description && <p>{group.description}</p>}
              </div>
              <div className="inventory-group-section-header-actions">
                <span className="inventory-group-section-count">{group.inventories.length} inventories</span>
                <span className="inventory-group-section-arrow">{collapsedGroups[group._id] ? '+' : '−'}</span>
              </div>
            </button>

            {!collapsedGroups[group._id] && (
              <div className="inventory-list">
                {group.inventories.length === 0 && <p className="no-data">No inventory in this group yet.</p>}
                {group.inventories.map((inventory) => (
                <div key={inventory._id} className="inventory-item">
                  {editingId === inventory._id ? (
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
                        value={editForm.groupName}
                        onChange={(e) => setEditForm({ ...editForm, groupName: e.target.value })}
                        required
                      >
                        {groups.map((groupOption) => (
                          <option key={groupOption._id} value={groupOption.name}>
                            {groupOption.name}
                          </option>
                        ))}
                      </select>
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
                      <div className="inventory-main">
                        <div className="inventory-info">
                          <div className="inventory-name">{inventory.name}</div>
                          <div className="inventory-key">Key: {inventory.key}</div>
                          {inventory.description && <div className="inventory-desc">{inventory.description}</div>}
                          <div className="inventory-desc">Group: {inventory.groupName}</div>
                          <div className="inventory-desc">Mode: {inventory.rotationMode === 'rotate' ? 'Rotate ads' : 'Single ad'}</div>
                          <div className={`inventory-status ${inventory.isActive ? 'active' : 'inactive'}`}>
                            {inventory.isActive ? 'Active' : 'Inactive'}
                          </div>
                          <div className="inventory-snippet">
                            <div className="inventory-snippet-label">CMS Tag</div>
                            <code>{`<div data-inventory="${inventory.key}" data-width="100%"></div>`}</code>
                            <div className="inventory-snippet-actions">
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={async () => {
                                  const text = `<div data-inventory="${inventory.key}" data-width="100%"></div>`;
                                  if (navigator.clipboard?.writeText) {
                                    await navigator.clipboard.writeText(text);
                                  }
                                }}
                              >
                                Copy Tag
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="inventory-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => handleDuplicate(inventory)}>Duplicate</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => startEdit(inventory)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(inventory)}>Delete</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export default Inventory;
