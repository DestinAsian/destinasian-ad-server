import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adUnitAPI, inventoryAPI } from "../services/api";
import AccountSelector from "../components/AccountSelector";
import { useAuth } from "../contexts/AuthContext";
import "../styles/Inventory.css";

const isAdUnitLinkedToChannel = (adUnit, channelId) => {
  const targetId = String(channelId || "");
  if (!targetId) return false;

  const inventoryIds = Array.isArray(adUnit?.inventories)
    ? adUnit.inventories.map((entry) => String(entry?._id || entry))
    : [];
  const primaryInventoryId = adUnit?.inventory
    ? String(adUnit.inventory?._id || adUnit.inventory)
    : null;

  return inventoryIds.includes(targetId) || primaryInventoryId === targetId;
};

function Inventory({ searchQuery = "" }) {
  const { currentAccount, user, accounts } = useAuth();
  const [inventories, setInventories] = useState([]);
  const [adUnits, setAdUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [runningAdsOnly, setRunningAdsOnly] = useState(false);
  const [sortMode, setSortMode] = useState("name");
  const [isCmsSetupExpanded, setIsCmsSetupExpanded] = useState(false);
  const [isCreateCardExpanded, setIsCreateCardExpanded] = useState(false);
  const [isAdChannelsExpanded, setIsAdChannelsExpanded] = useState(true);
  const [selectedInventoryFilterIds, setSelectedInventoryFilterIds] = useState(
    [],
  );
  const [isInventoryFilterOpen, setIsInventoryFilterOpen] = useState(false);
  const [expandedSnippets, setExpandedSnippets] = useState({});
  const [expandedInventoryIds, setExpandedInventoryIds] = useState(
    () => new Set(),
  );
  const [inventorySummaryViewById, setInventorySummaryViewById] = useState({});
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
  const inventoryFilterRef = useRef(null);
  const loadRequestIdRef = useRef(0);

  const isRunningAdUnit = useCallback((adUnit) => {
    const adUnitStatus = String(adUnit?.status || "").toLowerCase();
    if (adUnitStatus !== "active") return false;

    const campaignStatus = String(adUnit?.campaign?.status || "").toLowerCase();
    if (!campaignStatus) return true;
    return (
      campaignStatus === "active" ||
      campaignStatus === "running" ||
      campaignStatus === "live"
    );
  }, []);

  const loadData = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    if (!currentAccount?.id) {
      setInventories([]);
      setAdUnits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [inventoryResponse, adUnitResponse] = await Promise.all([
        inventoryAPI.getAll({ runningAdsOnly }),
        adUnitAPI.getAll(),
      ]);

      if (loadRequestIdRef.current !== requestId) return;

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
      if (loadRequestIdRef.current !== requestId) return;
      setError("Failed to load ad channel data");
      setLoading(false);
    }
  }, [currentAccount?.id, runningAdsOnly]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setInventories([]);
    setAdUnits([]);
    setSelectedInventoryFilterIds([]);
    setIsInventoryFilterOpen(false);
    setExpandedSnippets({});
    setExpandedInventoryIds(new Set());
    setInventorySummaryViewById({});
    setEditingId(null);
    setEditForm({
      name: "",
      key: "",
      description: "",
      isActive: true,
      adUnitIds: [],
    });
    setForm({
      name: "",
      key: "",
      description: "",
      adUnitIds: [],
    });
    setIsCreateCardExpanded(false);
  }, [currentAccount?.id]);

  useEffect(() => {
    if (!isInventoryFilterOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (inventoryFilterRef.current?.contains(event.target)) return;
      setIsInventoryFilterOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isInventoryFilterOpen]);

  const inventoryDetailsById = useMemo(() => {
    const detailsMap = new Map();

    inventories.forEach((inventory) => {
      const linkedAdUnits = adUnits.filter((adUnit) =>
        isAdUnitLinkedToChannel(adUnit, inventory._id),
      );
      const runningAdUnits = linkedAdUnits.filter(isRunningAdUnit);

      const buildCampaignEntries = (sourceAdUnits) => {
        const campaignMap = new Map();
        sourceAdUnits.forEach((adUnit) => {
          const campaignId = String(
            adUnit?.campaign?._id ||
              adUnit?.campaign ||
              `campaign-unavailable-${adUnit._id}`,
          );
          const campaignName = adUnit?.campaign?.name || "Campaign unavailable";
          const campaignStatus = adUnit?.campaign?.status || "unavailable";
          if (!campaignMap.has(campaignId)) {
            campaignMap.set(campaignId, {
              campaignId,
              campaignName,
              campaignStatus,
              adUnits: [],
            });
          }
          campaignMap.get(campaignId).adUnits.push(adUnit);
        });
        return [...campaignMap.values()].sort((a, b) =>
          String(a.campaignName || "").localeCompare(
            String(b.campaignName || ""),
            undefined,
            { sensitivity: "base" },
          ),
        );
      };

      const linkedCampaigns = buildCampaignEntries(linkedAdUnits);
      const runningCampaigns = buildCampaignEntries(runningAdUnits);
      const linkedImpressions = linkedAdUnits.reduce(
        (sum, adUnit) => sum + Number(adUnit?.impressions || 0),
        0,
      );
      const linkedClicks = linkedAdUnits.reduce(
        (sum, adUnit) => sum + Number(adUnit?.clicks || 0),
        0,
      );
      const linkedCtr =
        linkedImpressions > 0 ? (linkedClicks / linkedImpressions) * 100 : 0;
      const runningImpressions = runningAdUnits.reduce(
        (sum, adUnit) => sum + Number(adUnit?.impressions || 0),
        0,
      );
      const runningClicks = runningAdUnits.reduce(
        (sum, adUnit) => sum + Number(adUnit?.clicks || 0),
        0,
      );
      const runningCtr =
        runningImpressions > 0 ? (runningClicks / runningImpressions) * 100 : 0;

      detailsMap.set(String(inventory._id), {
        linkedCount: linkedAdUnits.length,
        runningCount: runningAdUnits.length,
        linkedMetrics: {
          impressions: linkedImpressions,
          clicks: linkedClicks,
          ctr: linkedCtr,
        },
        runningMetrics: {
          impressions: runningImpressions,
          clicks: runningClicks,
          ctr: runningCtr,
        },
        linkedCampaigns,
        runningCampaigns,
      });
    });

    return detailsMap;
  }, [inventories, adUnits, isRunningAdUnit]);

  const sortedAdUnits = useMemo(
    () =>
      [...adUnits].sort((a, b) =>
        String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
          sensitivity: "base",
        }),
      ),
    [adUnits],
  );

  const inventoryFilterOptions = useMemo(
    () =>
      [...inventories]
        .map((inventory) => ({
          id: String(inventory?._id || ""),
          name: String(inventory?.name || "Untitled Ad Channel"),
        }))
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        ),
    [inventories],
  );

  useEffect(() => {
    const optionIds = new Set(inventoryFilterOptions.map((entry) => entry.id));
    setSelectedInventoryFilterIds((prev) => {
      const next = prev.filter((id) => optionIds.has(String(id)));
      return next.length === prev.length ? prev : next;
    });
  }, [inventoryFilterOptions]);

  const selectedInventoryFilterSet = useMemo(
    () => new Set(selectedInventoryFilterIds.map((id) => String(id))),
    [selectedInventoryFilterIds],
  );

  const hasInventorySelectionFilter = selectedInventoryFilterIds.length > 0;

  const sortedInventories = useMemo(() => {
    const normalizedSearch = String(searchQuery || "")
      .trim()
      .toLowerCase();
    const hasSelectionFilter = selectedInventoryFilterIds.length > 0;
    return [...inventories]
      .map((inventory, index) => ({ inventory, index }))
      .filter(({ inventory }) => {
        if (!normalizedSearch) return true;
        const nameMatch = (inventory?.name || "")
          .toLowerCase()
          .includes(normalizedSearch);
        const keyMatch = (inventory?.key || "")
          .toLowerCase()
          .includes(normalizedSearch);
        if (nameMatch || keyMatch) return true;

        const details = inventoryDetailsById.get(String(inventory?._id));
        if (!details) return false;
        const summaryView =
          inventorySummaryViewById[inventory?._id] || "linked";
        const campaignEntries =
          summaryView === "running"
            ? details.runningCampaigns
            : details.linkedCampaigns;

        return campaignEntries.some((campaignEntry) => {
          const campaignMatch = String(campaignEntry?.campaignName || "")
            .toLowerCase()
            .includes(normalizedSearch);
          if (campaignMatch) return true;
          return (campaignEntry?.adUnits || []).some((adUnit) =>
            String(adUnit?.name || "")
              .toLowerCase()
              .includes(normalizedSearch),
          );
        });
      })
      .filter(({ inventory }) => {
        if (!hasSelectionFilter) return true;
        const inventoryId = String(inventory?._id || "");
        return selectedInventoryFilterSet.has(inventoryId);
      })
      .sort((a, b) => {
        if (sortMode === "mostActiveAdUnits") {
          const aDetails = inventoryDetailsById.get(String(a.inventory?._id));
          const bDetails = inventoryDetailsById.get(String(b.inventory?._id));
          const runningDelta =
            Number(bDetails?.runningCount || 0) -
            Number(aDetails?.runningCount || 0);
          if (runningDelta !== 0) return runningDelta;
        }
        const nameA = (a.inventory?.name || "").toLowerCase();
        const nameB = (b.inventory?.name || "").toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return a.index - b.index;
      })
      .map(({ inventory }) => inventory);
  }, [
    inventories,
    searchQuery,
    sortMode,
    selectedInventoryFilterIds,
    selectedInventoryFilterSet,
    inventoryDetailsById,
    inventorySummaryViewById,
  ]);

  const selectedInventoryFilterSummary = useMemo(() => {
    const selectedOptions = inventoryFilterOptions.filter((entry) =>
      selectedInventoryFilterSet.has(entry.id),
    );
    if (
      selectedOptions.length === 0 ||
      selectedOptions.length === inventoryFilterOptions.length
    ) {
      return "All Ad Channels";
    }
    if (selectedOptions.length === 1) {
      return selectedOptions[0].name;
    }
    if (selectedOptions.length === 2) {
      return `${selectedOptions[0].name}, ${selectedOptions[1].name}`;
    }
    return `${selectedOptions[0].name} +${selectedOptions.length - 1}`;
  }, [inventoryFilterOptions, selectedInventoryFilterSet]);

  const showCopiedFeedback = () => {
    setSuccessMessage("Copied to the clipboard");
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  const toggleSnippetExpanded = (inventoryId) => {
    setExpandedSnippets((prev) => ({
      ...prev,
      [inventoryId]: !prev[inventoryId],
    }));
  };

  const toggleInventoryExpanded = (inventoryId) => {
    const normalizedId = String(inventoryId || "");
    setExpandedInventoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(normalizedId)) {
        next.delete(normalizedId);
      } else {
        next.add(normalizedId);
      }
      return next;
    });
  };

  const getSummaryView = (inventoryId) =>
    inventorySummaryViewById[inventoryId] || "linked";

  const setSummaryView = (inventoryId, view) => {
    setInventorySummaryViewById((prev) => ({
      ...prev,
      [inventoryId]: view,
    }));
  };

  const toggleInventoryFilterSelection = (inventoryId) => {
    const normalizedId = String(inventoryId || "");
    setSelectedInventoryFilterIds((prev) => {
      const next = new Set(prev.map((id) => String(id)));
      if (next.has(normalizedId)) {
        next.delete(normalizedId);
      } else {
        next.add(normalizedId);
      }
      return [...next];
    });
  };

  const selectAllInventoryFilters = () => {
    setSelectedInventoryFilterIds(
      inventoryFilterOptions.map((option) => option.id),
    );
  };

  const clearInventoryFilters = () => {
    setSelectedInventoryFilterIds([]);
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

  const createAdUnitSelection = useMemo(
    () => new Set(form.adUnitIds.map((id) => String(id))),
    [form.adUnitIds],
  );
  const editAdUnitSelection = useMemo(
    () => new Set(editForm.adUnitIds.map((id) => String(id))),
    [editForm.adUnitIds],
  );

  if (
    user?.role === "editor" &&
    (!Array.isArray(accounts) || accounts.length === 0 || !currentAccount?.id)
  ) {
    return (
      <div className="inventory-page">
        <div className="no-data">
          No account has been shared with you yet. Please contact the account
          owner.
        </div>
      </div>
    );
  }

  if (loading) return <div className="loading">Loading ad channels...</div>;

  return (
    <div className="inventory-page">
      <header className="inventory-header">
        <div className="inventory-header-copy">
          <h1>Ad Channels</h1>
          <p>Create and manage ad placement channels.</p>
        </div>
        <AccountSelector />
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
      <div className={`ad-unit-cms ${isCmsSetupExpanded ? "is-expanded" : ""}`}>
        <button
          type="button"
          className="ad-unit-cms-toggle"
          aria-expanded={isCmsSetupExpanded}
          onClick={() => setIsCmsSetupExpanded((prev) => !prev)}
        >
          <span className="ad-unit-cms-label">CMS Setup</span>
          <span className="ad-unit-cms-toggle-icon" aria-hidden="true">
            {isCmsSetupExpanded ? "▾" : "▸"}
          </span>
        </button>
        {isCmsSetupExpanded && (
          <div className="ad-unit-cms-body">
            <div className="ad-unit-cms-description">
              Add this script inside the {`<Head>`} element of your website or
              CMS template.
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
        )}
      </div>
      <div
        className={`inventory-card create-ad-channel-card ${isCreateCardExpanded ? "is-expanded" : "is-collapsed"}`}
      >
        <button
          type="button"
          className="ad-unit-cms-toggle create-ad-channel-toggle"
          aria-expanded={isCreateCardExpanded}
          onClick={() => setIsCreateCardExpanded((prev) => !prev)}
        >
          <h3>Create Ad Channel</h3>
          <span className="ad-unit-cms-toggle-icon" aria-hidden="true">
            {isCreateCardExpanded ? "▾" : "▸"}
          </span>
        </button>
        {isCreateCardExpanded && (
          <div className="create-ad-channel-body">
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
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
              <div className="inventory-form-adunits">
                <div className="inventory-form-adunits-label">Ad Units</div>
                {sortedAdUnits.length === 0 ? (
                  <p className="no-data">No ad units available.</p>
                ) : (
                  <div className="selectable-checkbox-list inventory-adunit-list">
                    {sortedAdUnits.map((adUnit) => {
                      const adUnitId = String(adUnit._id);
                      const checked = createAdUnitSelection.has(adUnitId);
                      const campaignName =
                        adUnit?.campaign?.name || "Campaign unavailable";
                      return (
                        <label
                          key={adUnitId}
                          className={`selectable-checkbox-item ${checked ? "selected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setForm((prev) => {
                                const set = new Set(
                                  prev.adUnitIds.map((id) => String(id)),
                                );
                                if (set.has(adUnitId)) set.delete(adUnitId);
                                else set.add(adUnitId);
                                return { ...prev, adUnitIds: [...set] };
                              });
                            }}
                          />
                          <span className="inventory-adunit-choice-text">
                            <span className="inventory-adunit-choice-name">
                              {adUnit.name}
                            </span>
                            <span className="inventory-adunit-choice-meta">
                              Campaign: {campaignName}
                            </span>
                            <span className="inventory-adunit-choice-meta">
                              Status: {adUnit.status || "unknown"}
                            </span>
                          </span>
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
        )}
      </div>

      <section
        className={`inventory-card inventory-list-card ${isAdChannelsExpanded ? "is-expanded" : "is-collapsed"}`}
      >
        <div className="inventory-list-card-header">
          <button
            type="button"
            className="ad-unit-cms-toggle inventory-list-card-toggle"
            aria-expanded={isAdChannelsExpanded}
            onClick={() => setIsAdChannelsExpanded((prev) => !prev)}
          >
            <h3>List of Ad Channel</h3>
            <span className="ad-unit-cms-toggle-icon" aria-hidden="true">
              {isAdChannelsExpanded ? "▾" : "▸"}
            </span>
          </button>
          <div className="inventory-toolbar">
            <div className="inventory-toolbar-group">
              <label htmlFor="running-ads-only">Running Ads</label>
              <select
                id="running-ads-only"
                value={runningAdsOnly ? "yes" : "no"}
                onChange={(e) => setRunningAdsOnly(e.target.value === "yes")}
              >
                <option value="no">All Ad Channels</option>
                <option value="yes">Show only running ads</option>
              </select>
            </div>
            <div className="inventory-toolbar-group">
              <label htmlFor="inventory-sort-mode">Sort By</label>
              <select
                id="inventory-sort-mode"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
              >
                <option value="name">Ad Channel Name</option>
                <option value="mostActiveAdUnits">Most Active Ad Units</option>
              </select>
            </div>
            <div className="inventory-toolbar-group">
              <label htmlFor="inventory-visibility-filter">Filter Ad Channels</label>
              <div
                ref={inventoryFilterRef}
                className="inventory-filter-dropdown"
                id="inventory-visibility-filter"
              >
                <button
                  type="button"
                  className="inventory-filter-trigger"
                  aria-expanded={isInventoryFilterOpen}
                  aria-haspopup="true"
                  onClick={() => setIsInventoryFilterOpen((prev) => !prev)}
                >
                  <span>{selectedInventoryFilterSummary}</span>
                  <span aria-hidden="true">
                    {isInventoryFilterOpen ? "▾" : "▸"}
                  </span>
                </button>
                {isInventoryFilterOpen && (
                  <div className="inventory-filter-menu">
                    <div className="inventory-filter-menu-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={selectAllInventoryFilters}
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={clearInventoryFilters}
                      >
                        Clear
                      </button>
                    </div>
                    {inventoryFilterOptions.length === 0 ? (
                      <p className="no-data">No Ad Channels available.</p>
                    ) : (
                      <div className="inventory-filter-options">
                        {inventoryFilterOptions.map((option) => {
                          const checked = selectedInventoryFilterSet.has(
                            option.id,
                          );
                          return (
                            <label
                              key={option.id}
                              className="inventory-filter-option"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleInventoryFilterSelection(option.id)
                                }
                              />
                              <span>{option.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {isAdChannelsExpanded && (
          <>
            <div className="inventory-list">
              {sortedInventories.length === 0 && (
                <p className="no-data">
                  {hasInventorySelectionFilter
                    ? "No Ad Channels match the selected filters."
                    : String(searchQuery || "").trim()
                    ? "No Ad Channels found for this search."
                    : runningAdsOnly
                      ? "No Ad Channels with running ads found."
                      : "No Ad Channels found for this account."}
                </p>
              )}
              {sortedInventories.map((inventory) => (
                <div
                  key={inventory._id}
                  className={`inventory-item inventory-channel-card ${
                    expandedInventoryIds.has(String(inventory._id))
                      ? "is-expanded"
                      : "is-collapsed"
                  }`}
                >
                  {editingId === inventory._id ? (
                    <form
                      onSubmit={handleUpdate}
                      className="inventory-edit-form"
                    >
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
                          setEditForm({
                            ...editForm,
                            description: e.target.value,
                          })
                        }
                      />
                      <label className="inventory-toggle">
                        <input
                          type="checkbox"
                          checked={editForm.isActive}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              isActive: e.target.checked,
                            })
                          }
                        />
                        Active
                      </label>
                      <div className="inventory-form-adunits inventory-form-adunits-inline">
                        <div className="inventory-form-adunits-label">
                          Ad Units
                        </div>
                        {sortedAdUnits.length === 0 ? (
                          <p className="no-data">No ad units available.</p>
                        ) : (
                          <div className="selectable-checkbox-list inventory-adunit-list">
                            {sortedAdUnits.map((adUnit) => {
                              const adUnitId = String(adUnit._id);
                              const checked = editAdUnitSelection.has(adUnitId);
                              const campaignName =
                                adUnit?.campaign?.name ||
                                "Campaign unavailable";
                              return (
                                <label
                                  key={adUnitId}
                                  className={`selectable-checkbox-item ${checked ? "selected" : ""}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setEditForm((prev) => {
                                        const set = new Set(
                                          prev.adUnitIds.map((id) =>
                                            String(id),
                                          ),
                                        );
                                        if (set.has(adUnitId))
                                          set.delete(adUnitId);
                                        else set.add(adUnitId);
                                        return { ...prev, adUnitIds: [...set] };
                                      });
                                    }}
                                  />
                                  <span className="inventory-adunit-choice-text">
                                    <span className="inventory-adunit-choice-name">
                                      {adUnit.name}
                                    </span>
                                    <span className="inventory-adunit-choice-meta">
                                      Campaign: {campaignName}
                                    </span>
                                    <span className="inventory-adunit-choice-meta">
                                      Status: {adUnit.status || "unknown"}
                                    </span>
                                  </span>
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
                      {(() => {
                        const details = inventoryDetailsById.get(
                          String(inventory._id),
                        ) || {
                          linkedCount: 0,
                          runningCount: 0,
                          linkedMetrics: { impressions: 0, clicks: 0, ctr: 0 },
                          runningMetrics: { impressions: 0, clicks: 0, ctr: 0 },
                          linkedCampaigns: [],
                          runningCampaigns: [],
                        };
                        const summaryView = getSummaryView(inventory._id);
                        const currentMetrics =
                          summaryView === "running"
                            ? details.runningMetrics
                            : details.linkedMetrics;
                        const currentCampaigns =
                          summaryView === "running"
                            ? details.runningCampaigns
                            : details.linkedCampaigns;
                        const isSnippetExpanded = Boolean(
                          expandedSnippets[inventory._id],
                        );
                        const isExpanded = expandedInventoryIds.has(
                          String(inventory._id),
                        );

                        return (
                          <>
                            <button
                              type="button"
                              className="ad-unit-cms-toggle inventory-channel-toggle"
                              aria-expanded={isExpanded}
                              onClick={() =>
                                toggleInventoryExpanded(inventory._id)
                              }
                            >
                              <span className="ad-unit-cms-label inventory-channel-toggle-label">
                                <span className="inventory-name">
                                  {inventory.name}
                                </span>
                                <span className="inventory-inline-metrics">
                                  <span>
                                    Impressions:{" "}
                                    {new Intl.NumberFormat("en-US").format(
                                      currentMetrics.impressions,
                                    )}
                                  </span>
                                  <span>
                                    Clicks:{" "}
                                    {new Intl.NumberFormat("en-US").format(
                                      currentMetrics.clicks,
                                    )}
                                  </span>
                                  <span>
                                    CTR:{" "}
                                    {Number(currentMetrics.ctr || 0).toFixed(2)}
                                    %
                                  </span>
                                </span>
                              </span>
                              <span
                                className="ad-unit-cms-toggle-icon"
                                aria-hidden="true"
                              >
                                {isExpanded ? "▾" : "▸"}
                              </span>
                            </button>
                            {!isExpanded && (
                              <div className="inventory-collapsed-summary">
                                <span>
                                  Linked Ad Units: {details.linkedCount}
                                </span>
                                <span>
                                  Running Ad Units: {details.runningCount}
                                </span>
                              </div>
                            )}
                            {isExpanded && (
                              <div className="inventory-channel-body">
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
                                <div className="inventory-main">
                                  <div className="inventory-info">
                                    <div className="inventory-key">
                                      Key: {inventory.key}
                                    </div>
                                    {inventory.description && (
                                      <div className="inventory-desc">
                                        {inventory.description}
                                      </div>
                                    )}
                                    <div
                                      className={`inventory-status ${inventory.isActive ? "active" : "inactive"}`}
                                    >
                                      {inventory.isActive
                                        ? "Active"
                                        : "Inactive"}
                                    </div>
                                    <div className="inventory-performance">
                                      <div
                                        className="inventory-performance-summary"
                                        role="tablist"
                                        aria-label="Ad unit scope"
                                      >
                                        <button
                                          type="button"
                                          role="tab"
                                          aria-selected={
                                            summaryView === "linked"
                                          }
                                          className={`inventory-summary-toggle ${summaryView === "linked" ? "is-active" : ""}`}
                                          onClick={() =>
                                            setSummaryView(
                                              inventory._id,
                                              "linked",
                                            )
                                          }
                                        >
                                          Linked Ad Units: {details.linkedCount}
                                        </button>
                                        <button
                                          type="button"
                                          role="tab"
                                          aria-selected={
                                            summaryView === "running"
                                          }
                                          className={`inventory-summary-toggle ${summaryView === "running" ? "is-active" : ""}`}
                                          onClick={() =>
                                            setSummaryView(
                                              inventory._id,
                                              "running",
                                            )
                                          }
                                        >
                                          Running Ad Units:{" "}
                                          {details.runningCount}
                                        </button>
                                      </div>
                                      {currentCampaigns.length === 0 ? (
                                        <div className="inventory-performance-empty">
                                          {summaryView === "running"
                                            ? "No running ad units in this ad channel."
                                            : "No linked ad units in this ad channel."}
                                        </div>
                                      ) : (
                                        <div className="inventory-campaign-list">
                                          {currentCampaigns.map(
                                            (campaignEntry) => (
                                              <div
                                                key={campaignEntry.campaignId}
                                                className="inventory-campaign-item"
                                              >
                                                <div className="inventory-campaign-title">
                                                  Campaign:{" "}
                                                  {campaignEntry.campaignName}
                                                </div>
                                                <div className="inventory-campaign-status">
                                                  Status:{" "}
                                                  {campaignEntry.campaignStatus}
                                                </div>
                                                {campaignEntry.adUnits.map(
                                                  (adUnit) => (
                                                    <div
                                                      key={adUnit._id}
                                                      className="inventory-adunit-line"
                                                    >
                                                      <span>
                                                        Ad Unit: {adUnit.name}
                                                      </span>
                                                      <span>
                                                        Status: {adUnit.status}
                                                      </span>
                                                      <span>
                                                        Impressions:{" "}
                                                        {new Intl.NumberFormat(
                                                          "en-US",
                                                        ).format(
                                                          Number(
                                                            adUnit.impressions ||
                                                              0,
                                                          ),
                                                        )}
                                                      </span>
                                                      <span>
                                                        Clicks:{" "}
                                                        {new Intl.NumberFormat(
                                                          "en-US",
                                                        ).format(
                                                          Number(
                                                            adUnit.clicks || 0,
                                                          ),
                                                        )}
                                                      </span>
                                                      <span>
                                                        CTR:{" "}
                                                        {Number(
                                                          adUnit.ctr || 0,
                                                        ).toFixed(2)}
                                                        %
                                                      </span>
                                                    </div>
                                                  ),
                                                )}
                                              </div>
                                            ),
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    <div
                                      className={`inventory-snippet ${isSnippetExpanded ? "is-expanded" : ""}`}
                                    >
                                      <button
                                        type="button"
                                        className="inventory-snippet-toggle"
                                        aria-expanded={isSnippetExpanded}
                                        onClick={() =>
                                          toggleSnippetExpanded(inventory._id)
                                        }
                                      >
                                        <span className="inventory-snippet-label">
                                          CMS Tag
                                        </span>
                                        <span
                                          className="inventory-snippet-toggle-icon"
                                          aria-hidden="true"
                                        >
                                          {isSnippetExpanded ? "▾" : "▸"}
                                        </span>
                                      </button>
                                      {isSnippetExpanded && (
                                        <div className="inventory-snippet-body">
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
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default Inventory;
