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

const getCampaignAdChannelNames = (campaign) => {
  const channelMap = new Map();
  const adUnits = Array.isArray(campaign?.adUnits) ? campaign.adUnits : [];

  adUnits.forEach((adUnit) => {
    const linkedChannels = [
      ...(Array.isArray(adUnit?.inventories) ? adUnit.inventories : []),
      adUnit?.inventory
    ];

    linkedChannels.forEach((channel) => {
      if (!channel || typeof channel !== 'object' || !channel.name) {
        return;
      }

      const key = String(channel._id || channel.id || channel.name).toLowerCase();
      if (!channelMap.has(key)) {
        channelMap.set(key, channel.name);
      }
    });
  });

  return Array.from(channelMap.values());
};

function CampaignTableNameCell({ campaign, onOpen }) {
  const adChannelNames = getCampaignAdChannelNames(campaign);

  return (
    <td className="campaign-table-name">
      <button
        type="button"
        className="campaign-table-name-button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(campaign);
        }}
      >
        {campaign.name}
      </button>
      <span className="campaign-table-channel-line">
        Ad Channels: {adChannelNames.length > 0 ? adChannelNames.join(', ') : 'None'}
      </span>
    </td>
  );
}

const CAMPAIGN_PAGE_SIZE = 5;

function Dashboard({ view = 'overview', searchQuery = '' }) {
  const { currentAccount, user, accounts } = useAuth();
  const isCampaignView = view === 'campaigns';
  const isOverviewView = !isCampaignView;
  const normalizedSearchQuery = (searchQuery || '').trim();
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(normalizedSearchQuery);
  const defaultDateRange = useMemo(() => getDefaultDateRange(), []);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignHasMore, setCampaignHasMore] = useState(true);
  const [campaignsLoadingMore, setCampaignsLoadingMore] = useState(false);
  const [inventories, setInventories] = useState([]);
  const [overviewCampaignOptions, setOverviewCampaignOptions] = useState([]);
  const [selectedOverviewCampaignId, setSelectedOverviewCampaignId] = useState('');
  const [selectedOverviewAdChannelId, setSelectedOverviewAdChannelId] = useState('');
  const [campaignFilterSearch, setCampaignFilterSearch] = useState('');
  const [adChannelFilterSearch, setAdChannelFilterSearch] = useState('');
  const [isCampaignFilterOpen, setIsCampaignFilterOpen] = useState(false);
  const [isAdChannelFilterOpen, setIsAdChannelFilterOpen] = useState(false);
  const [selectedInventoryId, setSelectedInventoryId] = useState('');
  const [campaignSort, setCampaignSort] = useState('recent');
  const [campaignEditorId, setCampaignEditorId] = useState(null);
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [analytics, setAnalytics] = useState({
    impressions: 0,
    clicks: 0,
    ctr: 0,
    daily: [],
    topCampaigns: [],
    topAdUnits: []
  });
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const selectedCampaignRef = useRef(null);
  const loadMoreRef = useRef(null);
  const campaignFilterRef = useRef(null);
  const adChannelFilterRef = useRef(null);
  const [loading, setLoading] = useState(isCampaignView);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showAdUnitModal, setShowAdUnitModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [editingAdUnit, setEditingAdUnit] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const hasMountedCampaignSortRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(normalizedSearchQuery), 300);
    return () => clearTimeout(timer);
  }, [normalizedSearchQuery]);

  const fetchCampaigns = useCallback(async ({ page = 1, reset = false } = {}) => {
    try {
      if (!currentAccount?.id) {
        setCampaigns([]);
        setCampaignHasMore(false);
        setCampaignPage(1);
        setLoading(false);
        return;
      }

      if (reset) {
        setLoading(true);
      } else {
        setCampaignsLoadingMore(true);
      }

      const params = {
        page,
        limit: CAMPAIGN_PAGE_SIZE
      };
      if (selectedInventoryId) params.inventoryId = selectedInventoryId;
      if (debouncedSearchQuery) params.search = debouncedSearchQuery;

      const response = await campaignAPI.getAll(params);
      const campaignRows = Array.isArray(response.data?.data)
        ? response.data.data
        : (Array.isArray(response.data) ? response.data : []);
      const hasMore = typeof response.data?.pagination?.hasMore === 'boolean'
        ? response.data.pagination.hasMore
        : campaignRows.length >= CAMPAIGN_PAGE_SIZE;

      let dedupedRows = [];
      setCampaigns((prev) => {
        const source = reset ? campaignRows : [...prev, ...campaignRows];
        dedupedRows = Array.from(
          new Map(source.map((campaign) => [campaign._id, campaign])).values()
        );
        return dedupedRows;
      });
      setCampaignHasMore(Boolean(hasMore));
      setCampaignPage(page);

      const nextSelectedCampaignId = dedupedRows.some((campaign) => campaign._id === selectedCampaignRef.current)
        ? selectedCampaignRef.current
        : dedupedRows[0]?._id || null;

      selectedCampaignRef.current = nextSelectedCampaignId;
      setSelectedCampaign(nextSelectedCampaignId);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoading(false);
      setCampaignsLoadingMore(false);
    }
  }, [currentAccount?.id, selectedInventoryId, debouncedSearchQuery]);

  useEffect(() => {
    if (!isCampaignView) {
      setLoading(false);
      return;
    }

    fetchCampaigns({ page: 1, reset: true });
  }, [fetchCampaigns, isCampaignView]);

  useEffect(() => {
    if (!isCampaignView) {
      return;
    }
    if (!hasMountedCampaignSortRef.current) {
      hasMountedCampaignSortRef.current = true;
      return;
    }
    fetchCampaigns({ page: 1, reset: true });
  }, [campaignSort, isCampaignView, fetchCampaigns]);

  const loadMoreCampaigns = useCallback(() => {
    if (loading || campaignsLoadingMore || !campaignHasMore || !isCampaignView) {
      return;
    }

    fetchCampaigns({ page: campaignPage + 1, reset: false });
  }, [loading, campaignsLoadingMore, campaignHasMore, isCampaignView, fetchCampaigns, campaignPage]);

  useEffect(() => {
    if (!isCampaignView || !campaignHasMore) {
      return undefined;
    }

    const target = loadMoreRef.current;
    if (!target) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadMoreCampaigns();
          }
        });
      },
      { rootMargin: '240px 0px 240px 0px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [isCampaignView, campaignHasMore, loadMoreCampaigns, campaigns.length]);

  const fetchAnalytics = useCallback(async () => {
    try {
      if (!currentAccount?.id) {
        setAnalytics({
          impressions: 0,
          clicks: 0,
          ctr: 0,
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
        inventoryId: selectedOverviewAdChannelId || undefined,
        campaignId: selectedOverviewCampaignId || undefined,
        search: debouncedSearchQuery || undefined,
        limit: 5
      });
      setAnalytics({
        impressions: response.data?.impressions || 0,
        clicks: response.data?.clicks || 0,
        ctr: response.data?.ctr || 0,
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
        daily: [],
        topCampaigns: [],
        topAdUnits: []
      });
    } finally {
      setAnalyticsLoading(false);
    }
  }, [currentAccount?.id, dateRange.endDate, dateRange.startDate, selectedOverviewAdChannelId, selectedOverviewCampaignId, debouncedSearchQuery]);

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
    setCampaignPage(1);
    setCampaignHasMore(true);
    setCampaignsLoadingMore(false);
    selectedCampaignRef.current = null;
    setSelectedCampaign(null);
    setOverviewCampaignOptions([]);
    setSelectedOverviewCampaignId('');
    setSelectedOverviewAdChannelId('');
    setCampaignFilterSearch('');
    setAdChannelFilterSearch('');
    setIsCampaignFilterOpen(false);
    setIsAdChannelFilterOpen(false);
    setSelectedInventoryId('');
    setCampaignSort('recent');
    setCampaignEditorId(null);
    setDateRange(getDefaultDateRange());
    loadInventories();
  }, [currentAccount?.id]);

  useEffect(() => {
    const loadOverviewCampaignOptions = async () => {
      try {
        const response = await campaignAPI.getAll();
        const rows = Array.isArray(response.data?.data)
          ? response.data.data
          : (Array.isArray(response.data) ? response.data : []);
        setOverviewCampaignOptions(rows);
      } catch (loadError) {
        setOverviewCampaignOptions([]);
      }
    };

    if (!currentAccount?.id) {
      setOverviewCampaignOptions([]);
      setSelectedOverviewCampaignId('');
      setSelectedOverviewAdChannelId('');
      setCampaignFilterSearch('');
      setAdChannelFilterSearch('');
      return;
    }

    loadOverviewCampaignOptions();
  }, [currentAccount?.id]);

  const sortedOverviewCampaignOptions = useMemo(() => (
    [...overviewCampaignOptions].sort((a, b) =>
      (a?.name || a?._id || '').localeCompare(b?.name || b?._id || '', undefined, { sensitivity: 'base' })
    )
  ), [overviewCampaignOptions]);

  const sortedAdChannelOptions = useMemo(() => (
    [...inventories].sort((a, b) =>
      (a?.name || a?._id || '').localeCompare(b?.name || b?._id || '', undefined, { sensitivity: 'base' })
    )
  ), [inventories]);

  const filteredCampaignOptions = useMemo(() => {
    const searchValue = campaignFilterSearch.trim().toLowerCase();
    if (!searchValue) return sortedOverviewCampaignOptions;
    return sortedOverviewCampaignOptions.filter((campaign) =>
      (campaign?.name || campaign?._id || '').toLowerCase().includes(searchValue)
    );
  }, [campaignFilterSearch, sortedOverviewCampaignOptions]);

  const filteredAdChannelOptions = useMemo(() => {
    const searchValue = adChannelFilterSearch.trim().toLowerCase();
    if (!searchValue) return sortedAdChannelOptions;
    return sortedAdChannelOptions.filter((adChannel) =>
      (adChannel?.name || adChannel?._id || '').toLowerCase().includes(searchValue)
    );
  }, [adChannelFilterSearch, sortedAdChannelOptions]);

  const selectedOverviewCampaign = useMemo(
    () => sortedOverviewCampaignOptions.find((campaign) => campaign._id === selectedOverviewCampaignId) || null,
    [selectedOverviewCampaignId, sortedOverviewCampaignOptions]
  );

  const selectedOverviewAdChannel = useMemo(
    () => sortedAdChannelOptions.find((adChannel) => adChannel._id === selectedOverviewAdChannelId) || null,
    [selectedOverviewAdChannelId, sortedAdChannelOptions]
  );

  useEffect(() => {
    if (!selectedOverviewCampaignId) return;
    const exists = sortedOverviewCampaignOptions.some((campaign) => campaign._id === selectedOverviewCampaignId);
    if (!exists) {
      setSelectedOverviewCampaignId('');
      setCampaignFilterSearch('');
    }
  }, [selectedOverviewCampaignId, sortedOverviewCampaignOptions]);

  useEffect(() => {
    if (!selectedOverviewAdChannelId) return;
    const exists = sortedAdChannelOptions.some((adChannel) => adChannel._id === selectedOverviewAdChannelId);
    if (!exists) {
      setSelectedOverviewAdChannelId('');
      setAdChannelFilterSearch('');
    }
  }, [selectedOverviewAdChannelId, sortedAdChannelOptions]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!campaignFilterRef.current?.contains(event.target)) setIsCampaignFilterOpen(false);
      if (!adChannelFilterRef.current?.contains(event.target)) setIsAdChannelFilterOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenCreateModal = () => {
    setEditingCampaign(null);
    setShowCampaignModal(true);
    setError(null);
  };

  const handleOpenCampaignEditor = (campaign) => {
    selectedCampaignRef.current = campaign._id;
    setSelectedCampaign(campaign._id);
    setEditingCampaign(campaign);
    setCampaignEditorId(campaign._id);
    setError(null);
  };

  const handleCloseCampaignEditor = () => {
    setCampaignEditorId(null);
    setEditingCampaign(null);
    setError(null);
  };

  const handleCloseCampaignModal = () => {
    setShowCampaignModal(false);
    setCampaignEditorId(null);
    setEditingCampaign(null);
    setError(null);
  };

  const handleOpenCreateAdUnitModal = (campaignId = null) => {
    if (campaignId) {
      selectedCampaignRef.current = campaignId;
      setSelectedCampaign(campaignId);
    }
    setEditingAdUnit(null);
    setShowAdUnitModal(true);
    setError(null);
  };

  const handleOpenEditAdUnitModal = (adUnit, campaignId = null) => {
    const resolvedCampaignId = campaignId || adUnit?.campaign?._id || adUnit?.campaign || null;
    if (resolvedCampaignId) {
      selectedCampaignRef.current = resolvedCampaignId;
      setSelectedCampaign(resolvedCampaignId);
    }
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
      await fetchCampaigns({ page: 1, reset: true });
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
        await fetchCampaigns({ page: 1, reset: true });
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
      if (isCampaignView) {
        await fetchCampaigns({ page: 1, reset: true });
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
        if (isCampaignView) {
          await fetchCampaigns({ page: 1, reset: true });
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
      await fetchCampaigns({ page: 1, reset: true });
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
      if (isCampaignView) {
        await fetchCampaigns({ page: 1, reset: true });
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
      await fetchCampaigns({ page: 1, reset: true });
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
      if (isCampaignView) {
        await fetchCampaigns({ page: 1, reset: true });
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

  const campaignEditorCampaign = useMemo(
    () => campaigns.find((campaign) => campaign._id === campaignEditorId) || null,
    [campaignEditorId, campaigns]
  );

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

  const hasSearchNoDashboardData = useMemo(() => {
    if (!debouncedSearchQuery || analyticsLoading) return false;
    const impressions = Number(analytics?.impressions || 0);
    const clicks = Number(analytics?.clicks || 0);
    const dailyCount = Array.isArray(analytics?.daily) ? analytics.daily.length : 0;
    const topCampaignCount = Array.isArray(analytics?.topCampaigns) ? analytics.topCampaigns.length : 0;
    const topAdUnitCount = Array.isArray(analytics?.topAdUnits) ? analytics.topAdUnits.length : 0;
    return impressions === 0 && clicks === 0 && dailyCount === 0 && topCampaignCount === 0 && topAdUnitCount === 0;
  }, [debouncedSearchQuery, analyticsLoading, analytics]);

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
            <div className="dashboard-filter-field dashboard-filter-field-wide" ref={campaignFilterRef}>
              <label htmlFor="dashboard-campaign-filter" className="account-list-label">Campaign</label>
              <div className="dashboard-filter-combobox">
                <input
                  id="dashboard-campaign-filter"
                  type="text"
                  className="account-select dashboard-filter-select dashboard-filter-input"
                  placeholder="All Campaigns"
                  value={campaignFilterSearch}
                  onFocus={() => setIsCampaignFilterOpen(true)}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setCampaignFilterSearch(nextValue);
                    setIsCampaignFilterOpen(true);
                    if (!nextValue.trim()) {
                      setSelectedOverviewCampaignId('');
                      return;
                    }
                    const selectedLabel = selectedOverviewCampaign?.name || selectedOverviewCampaign?._id || '';
                    if (selectedOverviewCampaignId && nextValue !== selectedLabel) {
                      setSelectedOverviewCampaignId('');
                    }
                  }}
                />
                {isCampaignFilterOpen && (
                  <div className="dashboard-filter-options" role="listbox" aria-label="Campaign filter options">
                    <button
                      type="button"
                      className={`dashboard-filter-option${!selectedOverviewCampaignId ? ' selected' : ''}`}
                      onClick={() => {
                        setSelectedOverviewCampaignId('');
                        setCampaignFilterSearch('');
                        setIsCampaignFilterOpen(false);
                      }}
                    >
                      All Campaigns
                    </button>
                    {filteredCampaignOptions.length > 0 ? (
                      filteredCampaignOptions.map((campaign) => (
                        <button
                          type="button"
                          key={campaign._id}
                          className={`dashboard-filter-option${selectedOverviewCampaignId === campaign._id ? ' selected' : ''}`}
                          onClick={() => {
                            setSelectedOverviewCampaignId(campaign._id);
                            setCampaignFilterSearch(campaign.name || campaign._id);
                            setIsCampaignFilterOpen(false);
                          }}
                        >
                          {campaign.name || campaign._id}
                        </button>
                      ))
                    ) : (
                      <div className="dashboard-filter-option-empty">No campaigns found.</div>
                    )}
                  </div>
                )}
              </div>
              <small className="dashboard-filter-helper">
                {selectedOverviewCampaign ? `Filtering by ${selectedOverviewCampaign.name || selectedOverviewCampaign._id}` : 'Showing all campaigns'}
              </small>
            </div>
            <div className="dashboard-filter-field dashboard-filter-field-wide" ref={adChannelFilterRef}>
              <label htmlFor="dashboard-ad-channel-filter" className="account-list-label">Ad Channel</label>
              <div className="dashboard-filter-combobox">
                <input
                  id="dashboard-ad-channel-filter"
                  type="text"
                  className="account-select dashboard-filter-select dashboard-filter-input"
                  placeholder="All Ad Channels"
                  value={adChannelFilterSearch}
                  onFocus={() => setIsAdChannelFilterOpen(true)}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setAdChannelFilterSearch(nextValue);
                    setIsAdChannelFilterOpen(true);
                    if (!nextValue.trim()) {
                      setSelectedOverviewAdChannelId('');
                      return;
                    }
                    const selectedLabel = selectedOverviewAdChannel?.name || selectedOverviewAdChannel?._id || '';
                    if (selectedOverviewAdChannelId && nextValue !== selectedLabel) {
                      setSelectedOverviewAdChannelId('');
                    }
                  }}
                />
                {isAdChannelFilterOpen && (
                  <div className="dashboard-filter-options" role="listbox" aria-label="Ad Channel filter options">
                    <button
                      type="button"
                      className={`dashboard-filter-option${!selectedOverviewAdChannelId ? ' selected' : ''}`}
                      onClick={() => {
                        setSelectedOverviewAdChannelId('');
                        setAdChannelFilterSearch('');
                        setIsAdChannelFilterOpen(false);
                      }}
                    >
                      All Ad Channels
                    </button>
                    {filteredAdChannelOptions.length > 0 ? (
                      filteredAdChannelOptions.map((adChannel) => (
                        <button
                          type="button"
                          key={adChannel._id}
                          className={`dashboard-filter-option${selectedOverviewAdChannelId === adChannel._id ? ' selected' : ''}`}
                          onClick={() => {
                            setSelectedOverviewAdChannelId(adChannel._id);
                            setAdChannelFilterSearch(adChannel.name || adChannel._id);
                            setIsAdChannelFilterOpen(false);
                          }}
                        >
                          {adChannel.name || adChannel._id}
                        </button>
                      ))
                    ) : (
                      <div className="dashboard-filter-option-empty">No ad channels found.</div>
                    )}
                  </div>
                )}
              </div>
              <small className="dashboard-filter-helper">
                {selectedOverviewAdChannel ? `Filtering by ${selectedOverviewAdChannel.name || selectedOverviewAdChannel._id}` : 'Showing all ad channels'}
              </small>
            </div>
          </div>
        </div>

        {hasSearchNoDashboardData && (
          <p className="no-data">No dashboard data found for this search.</p>
        )}

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
        </div>

        <div className="dashboard-chart-panel">
          <div className="dashboard-chart-header">
            <div>
              <h3>Daily Performance</h3>
              <p>Uses the existing analytics endpoint with your selected date range and ad channel selection.</p>
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
      <div className="main-content campaigns-main-content">
        <div className="campaigns-page">
          <div className="campaigns-section-panel">
            <h2>List of Campaign</h2>
            <div className="dashboard-sidebar-filters campaigns-top-filters">
              <div className="dashboard-filter-field">
                <label htmlFor="campaign-inventory-filter" className="account-list-label">Ad Channel</label>
                <select
                  id="campaign-inventory-filter"
                  className="account-select dashboard-filter-select"
                  value={selectedInventoryId}
                  onChange={(e) => setSelectedInventoryId(e.target.value)}
                >
                  <option value="">All Ad Channels</option>
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
          </div>

          <div className="campaigns-section-panel">
            <div className="campaign-table-wrap">
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th aria-label="Select campaign">
                      <input type="checkbox" disabled />
                    </th>
                    <th>ID</th>
                    <th>Start / End</th>
                    <th>Name</th>
                    <th>Impressions</th>
                    <th>Impressions Today</th>
                    <th>Clicks</th>
                    <th>Clicks Today</th>
                    <th>CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCampaigns.map((campaign) => (
                    <tr
                      key={campaign._id}
                      className="campaign-table-row"
                      onClick={() => handleOpenCampaignEditor(campaign)}
                    >
                      <td onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${campaign.name}`} />
                      </td>
                      <td className="campaign-table-id">{campaign._id?.slice(-6) || '-'}</td>
                      <td>
                        <span>{new Date(campaign.startDate).toLocaleDateString()}</span>
                        <span className="campaign-table-end-date">{new Date(campaign.endDate).toLocaleDateString()}</span>
                      </td>
                      <CampaignTableNameCell
                        campaign={campaign}
                        onOpen={handleOpenCampaignEditor}
                      />
                      <td>{formatNumber(campaign.totalImpressions)}</td>
                      <td>{formatNumber(campaign.impressionsToday)}</td>
                      <td>{formatNumber(campaign.totalClicks)}</td>
                      <td>{formatNumber(campaign.clicksToday)}</td>
                      <td>{Number(campaign.ctr || 0).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {campaignHasMore && (
              <div ref={loadMoreRef} className="campaign-list-loader">
                {campaignsLoadingMore ? 'Loading more campaigns...' : 'Scroll to load more'}
              </div>
            )}
            {!campaignHasMore && campaigns.length > 0 && (
              <div className="campaign-list-loader">No more campaigns</div>
            )}
            {sortedCampaigns.length === 0 && (
              <p className="no-campaigns">
                {normalizedSearchQuery ? 'No campaigns found.' : 'No campaigns yet. Create one to get started!'}
              </p>
            )}
          </div>
        </div>
      </div>
      )}

      {isCampaignView && (
      <Modal
        isOpen={Boolean(campaignEditorCampaign)}
        title={campaignEditorCampaign ? `Edit ${campaignEditorCampaign.name}` : 'Edit Campaign'}
        onClose={handleCloseCampaignEditor}
        contentClassName="campaign-editor-modal"
      >
        {campaignEditorCampaign && (
          <div className="campaign-editor-content">
            <div className="campaign-editor-actions">
              <button
                className={`btn-icon btn-status ${campaignEditorCampaign.status}`}
                onClick={() => handleToggleCampaignStatus(campaignEditorCampaign._id, campaignEditorCampaign.status)}
                title={campaignEditorCampaign.status === 'active' ? 'Pause' : 'Activate'}
                aria-label={campaignEditorCampaign.status === 'active' ? 'Pause campaign' : 'Activate campaign'}
              >
                {campaignEditorCampaign.status === 'active' ? '⏸' : '▶'}
              </button>
              <button
                className="btn-icon btn-edit"
                onClick={() => handleDuplicateCampaign(campaignEditorCampaign)}
                title="Duplicate"
                aria-label="Duplicate campaign"
              >
                📄
              </button>
              <button
                className="btn-icon btn-delete"
                onClick={() => handleDeleteCampaign(campaignEditorCampaign._id)}
                title="Delete"
                aria-label="Delete campaign"
              >
                🗑️
              </button>
            </div>

            <CampaignForm
              campaign={campaignEditorCampaign}
              submitting={submitting}
              onSubmit={handleSubmitCampaign}
              onCancel={handleCloseCampaignEditor}
            />

            <div className="ad-units-section campaign-editor-ad-units">
              <div className="ad-units-header">
                <h3>Ad Units</h3>
                <button
                  className="btn btn-primary btn-sm new-ad-unit-button"
                  onClick={() => handleOpenCreateAdUnitModal(campaignEditorCampaign._id)}
                >
                  + New Ad Unit
                </button>
              </div>
              <div className="ad-units-grid">
                {(campaignEditorCampaign.adUnits || []).map((adUnit) => (
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
                        onClick={() => handleOpenEditAdUnitModal(adUnit, campaignEditorCampaign._id)}
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
              {(campaignEditorCampaign.adUnits || []).length === 0 && (
                <p className="no-data">
                  No ad units in this campaign. <button className="link-btn" onClick={() => handleOpenCreateAdUnitModal(campaignEditorCampaign._id)}>Create one</button>
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
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
