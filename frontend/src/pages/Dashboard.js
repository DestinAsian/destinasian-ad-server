import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { campaignAPI, adUnitAPI, inventoryAPI, trackingAPI } from '../services/api';
import '../styles/Dashboard.css';
import CampaignChart from '../components/CampaignChart';
import AdUnitChart from '../components/AdUnitChart';
import CampaignForm from '../components/CampaignForm';
import AdUnitForm from '../components/AdUnitForm';
import AccountSelector from '../components/AccountSelector';
import Modal from '../components/Modal';
import { useAuth } from '../contexts/AuthContext';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const formatDateInput = (date) => {
  const dateValue = new Date(date);
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultDateRange = () => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 29);

  return {
    startDate: formatDateInput(startDate),
    endDate: formatDateInput(endDate)
  };
};

const formatNumber = (value) => {
  return new Intl.NumberFormat('en-US').format(Number(value) || 0);
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(Number(value) || 0);
};

function Dashboard({ view = 'overview' }) {
  const { currentAccount, user, accounts } = useAuth();
  const isCampaignView = view === 'campaigns';
  const isOverviewView = !isCampaignView;
  const defaultDateRange = useMemo(() => getDefaultDateRange(), []);
  const [campaigns, setCampaigns] = useState([]);
  const [adUnits, setAdUnits] = useState([]);
  const [inventories, setInventories] = useState([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState('');
  const [campaignSort, setCampaignSort] = useState('recent');
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [analytics, setAnalytics] = useState({
    impressions: 0,
    clicks: 0,
    ctr: 0,
    revenue: 0,
    daily: [],
    topCampaigns: [],
    topAdUnits: []
  });
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const selectedCampaignRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showAdUnitModal, setShowAdUnitModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [editingAdUnit, setEditingAdUnit] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const fetchAdUnits = useCallback(async (campaignId) => {
    try {
      const params = selectedInventoryId ? { inventoryId: selectedInventoryId } : undefined;
      const response = await adUnitAPI.getByCampaign(campaignId, params);
      setAdUnits(response.data);
    } catch (error) {
      console.error('Error fetching ad units:', error);
    }
  }, [selectedInventoryId]);

  const fetchCampaigns = useCallback(async () => {
    try {
      if (!currentAccount?.id) {
        setCampaigns([]);
        setAdUnits([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const params = selectedInventoryId ? { inventoryId: selectedInventoryId } : undefined;
      const response = await campaignAPI.getAll(params);
      setCampaigns(response.data);

      const nextSelectedCampaignId = response.data.some((campaign) => campaign._id === selectedCampaignRef.current)
        ? selectedCampaignRef.current
        : response.data[0]?._id || null;

      selectedCampaignRef.current = nextSelectedCampaignId;
      setSelectedCampaign(nextSelectedCampaignId);
      if (nextSelectedCampaignId) {
        fetchAdUnits(nextSelectedCampaignId);
      } else {
        setAdUnits([]);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      setLoading(false);
    }
  }, [currentAccount?.id, selectedInventoryId, fetchAdUnits]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const fetchAnalytics = useCallback(async () => {
    try {
      if (!currentAccount?.id) {
        setAnalytics({
          impressions: 0,
          clicks: 0,
          ctr: 0,
          revenue: 0,
          daily: [],
          topCampaigns: [],
          topAdUnits: []
        });
        setAnalyticsLoading(false);
        return;
      }

      setAnalyticsLoading(true);
      const response = await trackingAPI.getAnalytics({
        startDate: dateRange.startDate || undefined,
        endDate: dateRange.endDate || undefined,
        inventoryId: selectedInventoryId || undefined,
        limit: 5
      });
      setAnalytics({
        impressions: response.data?.impressions || 0,
        clicks: response.data?.clicks || 0,
        ctr: response.data?.ctr || 0,
        revenue: response.data?.revenue || 0,
        daily: response.data?.daily || [],
        topCampaigns: response.data?.topCampaigns || [],
        topAdUnits: response.data?.topAdUnits || []
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setAnalytics({
        impressions: 0,
        clicks: 0,
        ctr: 0,
        revenue: 0,
        daily: [],
        topCampaigns: [],
        topAdUnits: []
      });
    } finally {
      setAnalyticsLoading(false);
    }
  }, [currentAccount?.id, dateRange.endDate, dateRange.startDate, selectedInventoryId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    const loadInventories = async () => {
      try {
        const response = await inventoryAPI.getAll();
        setInventories(response.data || []);
      } catch (error) {
        console.error('Error fetching inventories:', error);
      }
    };

    setCampaigns([]);
    setAdUnits([]);
    selectedCampaignRef.current = null;
    setSelectedCampaign(null);
    setSelectedInventoryId('');
    setCampaignSort('recent');
    setDateRange(getDefaultDateRange());
    loadInventories();
  }, [currentAccount?.id]);

  const handleCampaignSelect = (campaignId) => {
    selectedCampaignRef.current = campaignId;
    setSelectedCampaign(campaignId);
    fetchAdUnits(campaignId);
  };

  const handleOpenCreateModal = () => {
    setEditingCampaign(null);
    setShowCampaignModal(true);
    setError(null);
  };

  const handleOpenEditModal = (campaign) => {
    setEditingCampaign(campaign);
    setShowCampaignModal(true);
    setError(null);
  };

  const handleCloseCampaignModal = () => {
    setShowCampaignModal(false);
    setEditingCampaign(null);
    setError(null);
  };

  const handleOpenCreateAdUnitModal = () => {
    setEditingAdUnit(null);
    setShowAdUnitModal(true);
    setError(null);
  };

  const handleOpenEditAdUnitModal = (adUnit) => {
    setEditingAdUnit(adUnit);
    setShowAdUnitModal(true);
    setError(null);
  };

  const handleCloseAdUnitModal = () => {
    setShowAdUnitModal(false);
    setEditingAdUnit(null);
    setError(null);
  };

  const handleSubmitCampaign = async (formData) => {
    setSubmitting(true);
    setError(null);
    try {
      if (editingCampaign) {
        await campaignAPI.update(editingCampaign._id, formData);
        setSuccessMessage('Campaign updated successfully!');
      } else {
        await campaignAPI.create(formData);
        setSuccessMessage('Campaign created successfully!');
      }
      handleCloseCampaignModal();
      await fetchCampaigns();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save campaign');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCampaign = async (campaignId) => {
    if (window.confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) {
      try {
        await campaignAPI.delete(campaignId);
        setSuccessMessage('Campaign deleted successfully!');
        await fetchCampaigns();
        if (selectedCampaign === campaignId) {
          selectedCampaignRef.current = null;
          setSelectedCampaign(null);
        }
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to delete campaign');
      }
    }
  };

  const handleSubmitAdUnit = async (formData) => {
    setSubmitting(true);
    setError(null);
    try {
      if (editingAdUnit) {
        await adUnitAPI.update(editingAdUnit._id, formData);
        setSuccessMessage('Ad unit updated successfully!');
      } else {
        await adUnitAPI.create(formData);
        setSuccessMessage('Ad unit created successfully!');
      }
      handleCloseAdUnitModal();
      if (selectedCampaign) {
        await fetchAdUnits(selectedCampaign);
      }
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save ad unit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAdUnit = async (adUnitId) => {
    if (window.confirm('Are you sure you want to delete this ad unit? This action cannot be undone.')) {
      try {
        await adUnitAPI.delete(adUnitId);
        setSuccessMessage('Ad unit deleted successfully!');
        if (selectedCampaign) {
          await fetchAdUnits(selectedCampaign);
        }
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to delete ad unit');
      }
    }
  };

  const handleToggleCampaignStatus = async (campaignId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'paused' : 'active';
      await campaignAPI.updateStatus(campaignId, newStatus);
      setSuccessMessage(`Campaign ${newStatus === 'active' ? 'activated' : 'paused'} successfully!`);
      await fetchCampaigns();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update campaign status');
    }
  };

  const handleToggleAdUnitStatus = async (adUnitId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'paused' : 'active';
      await adUnitAPI.updateStatus(adUnitId, newStatus);
      setSuccessMessage(`Ad unit ${newStatus === 'active' ? 'activated' : 'paused'} successfully!`);
      if (selectedCampaign) {
        await fetchAdUnits(selectedCampaign);
      }
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update ad unit status');
    }
  };

  const generateCopyName = (baseName, existingNames) => {
    const clean = baseName.trim();
    const copyBase = `${clean} (Copy)`;
    if (!existingNames.has(copyBase)) return copyBase;
    let i = 2;
    while (existingNames.has(`${clean} (Copy ${i})`)) {
      i += 1;
    }
    return `${clean} (Copy ${i})`;
  };

  const handleDuplicateCampaign = async (campaign) => {
    try {
      const existing = new Set(campaigns.map(c => c.name));
      const name = generateCopyName(campaign.name, existing);
      await campaignAPI.create({
        name,
        description: campaign.description || '',
        startDate: campaign.startDate,
        endDate: campaign.endDate
      });
      setSuccessMessage('Campaign duplicated successfully!');
      await fetchCampaigns();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to duplicate campaign');
    }
  };

  const handleDuplicateAdUnit = async (adUnit) => {
    try {
      await adUnitAPI.create({
        name: adUnit.name,
        campaign: adUnit.campaign?._id || adUnit.campaign || selectedCampaign,
        inventory: adUnit.inventory?._id || adUnit.inventory,
        inventories: Array.isArray(adUnit.inventories)
          ? adUnit.inventories.map((inventory) => inventory?._id || inventory).filter(Boolean)
          : undefined,
        startDate: adUnit.startDate,
        endDate: adUnit.endDate,
        imageUrl: adUnit.imageUrl,
        htmlCreative: adUnit.htmlCreative,
        iframeUrl: adUnit.iframeUrl,
        clickUrl: adUnit.clickUrl,
        width: adUnit.width
      });
      setSuccessMessage('Ad unit duplicated successfully!');
      if (selectedCampaign) {
        await fetchAdUnits(selectedCampaign);
      }
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to duplicate ad unit');
    }
  };

  const sortedCampaigns = useMemo(() => {
    const campaignList = [...campaigns];

    switch (campaignSort) {
      case 'name':
        return campaignList.sort((a, b) => a.name.localeCompare(b.name));
      case 'impressions':
        return campaignList.sort((a, b) => (b.totalImpressions || 0) - (a.totalImpressions || 0));
      case 'clicks':
        return campaignList.sort((a, b) => (b.totalClicks || 0) - (a.totalClicks || 0));
      case 'ctr':
        return campaignList.sort((a, b) => Number(b.ctr || 0) - Number(a.ctr || 0));
      case 'recent':
      default:
        return campaignList.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }
  }, [campaignSort, campaigns]);

  const analyticsChartData = useMemo(() => ({
    labels: analytics.daily.map((entry) => new Date(entry.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })),
    datasets: [
      {
        label: 'Impressions',
        data: analytics.daily.map((entry) => entry.impressions || 0),
        borderColor: '#6f98a6',
        backgroundColor: 'rgba(111, 152, 166, 0.14)',
        tension: 0.35,
        fill: true,
        pointRadius: 2,
        pointHoverRadius: 4
      },
      {
        label: 'Clicks',
        data: analytics.daily.map((entry) => entry.clicks || 0),
        borderColor: '#1f2b32',
        backgroundColor: 'rgba(31, 43, 50, 0.08)',
        tension: 0.35,
        fill: false,
        pointRadius: 2,
        pointHoverRadius: 4
      }
    ]
  }), [analytics.daily]);

  const analyticsChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          color: '#49545c',
          font: {
            family: 'Rubik'
          }
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false
      }
    },
    interaction: {
      mode: 'index',
      intersect: false
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: '#67757e',
          font: {
            family: 'Rubik'
          }
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(124, 170, 184, 0.12)'
        },
        ticks: {
          color: '#67757e',
          font: {
            family: 'Rubik'
          }
        }
      }
    }
  }), []);

  if (loading) return <div className="loading">Loading...</div>;

  if (user?.role === 'editor' && (!Array.isArray(accounts) || accounts.length === 0 || !currentAccount?.id)) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <div>
            <h1>{isCampaignView ? 'Campaigns' : 'Dashboard'}</h1>
          </div>
        </header>
        <div className="no-selection">
          <p>No account has been shared with you yet. Please contact the account owner.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>{isCampaignView ? 'Campaigns' : 'Dashboard'}</h1>
          <p className="dashboard-header-copy">
            {isCampaignView
              ? 'Manage campaigns and ad units without leaving the main workflow.'
              : 'Overview of delivery, engagement, and account-level performance.'}
          </p>
        </div>
        <div className="dashboard-header-actions">
          <AccountSelector />
          {isCampaignView && (
            <button className="btn btn-primary" onClick={handleOpenCreateModal}>
              + New Campaign
            </button>
          )}
        </div>
      </header>

      {successMessage && (
        <div className="alert alert-success">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {isOverviewView && (
      <section className="dashboard-overview">
        <div className="dashboard-overview-header">
          <div>
            <h2>Overview</h2>
            <p>Check performance, narrow the date range, and keep campaign browsing straightforward.</p>
          </div>
          <div className="dashboard-filter-grid">
            <div className="dashboard-filter-field">
              <label htmlFor="dashboard-start-date" className="account-list-label">Start Date</label>
              <input
                id="dashboard-start-date"
                type="date"
                className="dashboard-date-input"
                value={dateRange.startDate}
                max={dateRange.endDate || undefined}
                onChange={(e) => setDateRange((current) => ({ ...current, startDate: e.target.value }))}
              />
            </div>
            <div className="dashboard-filter-field">
              <label htmlFor="dashboard-end-date" className="account-list-label">End Date</label>
              <input
                id="dashboard-end-date"
                type="date"
                className="dashboard-date-input"
                value={dateRange.endDate}
                min={dateRange.startDate || undefined}
                onChange={(e) => setDateRange((current) => ({ ...current, endDate: e.target.value }))}
              />
            </div>
            <div className="dashboard-filter-field">
              <label htmlFor="inventory-filter" className="account-list-label">Inventory</label>
              <select
                id="inventory-filter"
                className="account-select dashboard-filter-select"
                value={selectedInventoryId}
                onChange={(e) => setSelectedInventoryId(e.target.value)}
              >
                <option value="">All Inventories</option>
                {inventories.map((inventory) => (
                  <option key={inventory._id} value={inventory._id}>
                    {inventory.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="dashboard-kpi-grid">
          <div className="stat-card dashboard-kpi-card">
            <h4>Impressions</h4>
            <p className="stat-value">{analyticsLoading ? '...' : formatNumber(analytics.impressions)}</p>
          </div>
          <div className="stat-card dashboard-kpi-card">
            <h4>Clicks</h4>
            <p className="stat-value">{analyticsLoading ? '...' : formatNumber(analytics.clicks)}</p>
          </div>
          <div className="stat-card dashboard-kpi-card">
            <h4>CTR</h4>
            <p className="stat-value">{analyticsLoading ? '...' : `${Number(analytics.ctr || 0).toFixed(2)}%`}</p>
          </div>
          <div className="stat-card dashboard-kpi-card">
            <h4>Revenue</h4>
            <p className="stat-value">{analyticsLoading ? '...' : formatCurrency(analytics.revenue)}</p>
          </div>
        </div>

        <div className="dashboard-chart-panel">
          <div className="dashboard-chart-header">
            <div>
              <h3>Daily Performance</h3>
              <p>Uses the existing analytics endpoint with your selected date range and inventory selection.</p>
            </div>
            <div className="dashboard-chart-meta">
              <span>{analytics.topCampaigns[0]?.name ? `Top Campaign: ${analytics.topCampaigns[0].name}` : 'No campaign data yet'}</span>
              <span>{analytics.topAdUnits[0]?.name ? `Top Ad Unit: ${analytics.topAdUnits[0].name}` : 'No ad unit data yet'}</span>
            </div>
          </div>
          <div className="dashboard-chart-canvas">
            {analyticsLoading ? (
              <div className="no-data">Loading analytics...</div>
            ) : analytics.daily.length > 0 ? (
              <Line data={analyticsChartData} options={analyticsChartOptions} />
            ) : (
              <div className="no-data">No analytics yet for this date range.</div>
            )}
          </div>
        </div>
      </section>
      )}

      {isCampaignView && (
      <div className="dashboard-container">
        <div className="sidebar">
          <h2>List of Campaign</h2>
          <div className="dashboard-sidebar-filters">
            <div className="dashboard-filter-field">
              <label htmlFor="campaign-inventory-filter" className="account-list-label">Inventory</label>
              <select
                id="campaign-inventory-filter"
                className="account-select dashboard-filter-select"
                value={selectedInventoryId}
                onChange={(e) => setSelectedInventoryId(e.target.value)}
              >
                <option value="">All Inventories</option>
                {inventories.map((inventory) => (
                  <option key={inventory._id} value={inventory._id}>
                    {inventory.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="dashboard-filter-field">
              <label htmlFor="campaign-sort" className="account-list-label">Sort Campaigns</label>
              <select
                id="campaign-sort"
                className="account-select dashboard-filter-select"
                value={campaignSort}
                onChange={(e) => setCampaignSort(e.target.value)}
              >
                <option value="recent">Newest First</option>
                <option value="name">Name A-Z</option>
                <option value="impressions">Most Impressions</option>
                <option value="clicks">Most Clicks</option>
                <option value="ctr">Highest CTR</option>
              </select>
            </div>
          </div>
          <ul className="campaign-list">
            {sortedCampaigns.map((campaign) => (
              <li
                key={campaign._id}
                className={`campaign-item ${selectedCampaign === campaign._id ? 'active' : ''}`}
              >
                <div 
                  className="campaign-info"
                  onClick={() => handleCampaignSelect(campaign._id)}
                >
                  <strong>{campaign.name}</strong>
                  <small>{campaign.status}</small>
                </div>
                <div className="campaign-actions">
                  <button
                    className={`btn-icon btn-status ${campaign.status}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleCampaignStatus(campaign._id, campaign.status);
                    }}
                    title={campaign.status === 'active' ? 'Pause' : 'Activate'}
                    aria-label={campaign.status === 'active' ? 'Pause campaign' : 'Activate campaign'}
                  >
                    {campaign.status === 'active' ? '⏸' : '▶'}
                  </button>
                  <button
                    className="btn-icon btn-edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicateCampaign(campaign);
                    }}
                    title="Duplicate"
                    aria-label="Duplicate campaign"
                  >
                    📄
                  </button>
                  <button
                    className="btn-icon btn-edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEditModal(campaign);
                    }}
                    title="Edit"
                    aria-label="Edit campaign"
                  >
                    ✏️
                  </button>
                  <button
                    className="btn-icon btn-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCampaign(campaign._id);
                    }}
                    title="Delete"
                    aria-label="Delete campaign"
                  >
                    🗑️
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {campaigns.length === 0 && (
            <p className="no-campaigns">No campaigns yet. Create one to get started!</p>
          )}
        </div>

        <div className="main-content">
          {selectedCampaign && (
            <>
              <CampaignChart campaignId={selectedCampaign} />
              
              <div className="ad-units-section">
                <div className="ad-units-header">
                  <h3>Ad Units in Campaign</h3>
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={handleOpenCreateAdUnitModal}
                  >
                    + New Ad Unit
                  </button>
                </div>
                <div className="ad-units-grid">
                  {adUnits.map((adUnit) => (
                    <div key={adUnit._id} className="ad-unit-card">
                      <AdUnitChart adUnit={adUnit} />
                      <div className="ad-unit-actions">
                        <button
                          className={`btn-icon btn-status ${adUnit.status}`}
                          onClick={() => handleToggleAdUnitStatus(adUnit._id, adUnit.status)}
                          title={adUnit.status === 'active' ? 'Pause' : 'Activate'}
                          aria-label={adUnit.status === 'active' ? 'Pause ad unit' : 'Activate ad unit'}
                        >
                          {adUnit.status === 'active' ? '⏸' : '▶'}
                        </button>
                        <button
                          className="btn-icon btn-edit"
                          onClick={() => handleDuplicateAdUnit(adUnit)}
                          title="Duplicate"
                          aria-label="Duplicate ad unit"
                        >
                          📄
                        </button>
                        <button
                          className="btn-icon btn-edit"
                          onClick={() => handleOpenEditAdUnitModal(adUnit)}
                          title="Edit"
                          aria-label="Edit ad unit"
                        >
                          ✏️
                        </button>
                        <button
                          className="btn-icon btn-delete"
                          onClick={() => handleDeleteAdUnit(adUnit._id)}
                          title="Delete"
                          aria-label="Delete ad unit"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {adUnits.length === 0 && (
                  <p className="no-data">No ad units in this campaign. <button className="link-btn" onClick={handleOpenCreateAdUnitModal}>Create one</button></p>
                )}
              </div>
            </>
          )}
          {!selectedCampaign && campaigns.length > 0 && (
            <div className="no-selection">
              <p>Select a campaign from the left to view details</p>
            </div>
          )}
        </div>
      </div>
      )}

      {isCampaignView && (
      <Modal
        isOpen={showCampaignModal}
        title={editingCampaign ? 'Edit Campaign' : 'Create New Campaign'}
        onClose={handleCloseCampaignModal}
      >
        <CampaignForm
          campaign={editingCampaign}
          submitting={submitting}
          onSubmit={handleSubmitCampaign}
          onCancel={handleCloseCampaignModal}
        />
      </Modal>
      )}

      {isCampaignView && (
      <Modal
        isOpen={showAdUnitModal}
        title={editingAdUnit ? 'Edit Ad Unit' : 'Create New Ad Unit'}
        onClose={handleCloseAdUnitModal}
      >
        <AdUnitForm
          adUnit={editingAdUnit}
          submitting={submitting}
          campaignId={selectedCampaign}
          campaign={campaigns.find(c => c._id === selectedCampaign)}
          onSubmit={handleSubmitAdUnit}
          onCancel={handleCloseAdUnitModal}
        />
      </Modal>
      )}
    </div>
  );
}

export default Dashboard;
