import React, { useState, useEffect, useCallback } from 'react';
import { campaignAPI, adUnitAPI } from '../services/api';
import '../styles/Dashboard.css';
import CampaignChart from '../components/CampaignChart';
import AdUnitChart from '../components/AdUnitChart';
import CampaignForm from '../components/CampaignForm';
import AdUnitForm from '../components/AdUnitForm';
import AccountSelector from '../components/AccountSelector';
import Modal from '../components/Modal';
import { useAuth } from '../contexts/AuthContext';

function Dashboard() {
  const { currentAccount } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [adUnits, setAdUnits] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showAdUnitModal, setShowAdUnitModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [editingAdUnit, setEditingAdUnit] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const response = await campaignAPI.getAll();
      setCampaigns(response.data);
      if (response.data.length > 0) {
        setSelectedCampaign(response.data[0]._id);
        fetchAdUnits(response.data[0]._id);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  useEffect(() => {
    setCampaigns([]);
    setAdUnits([]);
    setSelectedCampaign(null);
    fetchCampaigns();
  }, [currentAccount?.id, fetchCampaigns]);

  const fetchAdUnits = async (campaignId) => {
    try {
      const response = await adUnitAPI.getByCampaign(campaignId);
      setAdUnits(response.data);
    } catch (error) {
      console.error('Error fetching ad units:', error);
    }
  };

  const handleCampaignSelect = (campaignId) => {
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
        startDate: adUnit.startDate,
        endDate: adUnit.endDate,
        imageUrl: adUnit.imageUrl,
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

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>DestinAsian Ad Server Dashboard</h1>
        <AccountSelector />
        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          + New Campaign
        </button>
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

      <div className="dashboard-container">
        <div className="sidebar">
          <h2>Campaigns</h2>
          <ul className="campaign-list">
            {campaigns.map((campaign) => (
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
    </div>
  );
}

export default Dashboard;
