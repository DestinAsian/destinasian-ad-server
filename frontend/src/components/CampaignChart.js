import React, { useState, useEffect, useCallback } from 'react';
import { campaignAPI } from '../services/api';

function CampaignChart({ campaignId }) {
  const [stats, setStats] = useState(null);
  const [campaign, setCampaign] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, campaignRes] = await Promise.all([
        campaignAPI.getStats(campaignId),
        campaignAPI.getById(campaignId)
      ]);
      setStats(statsRes.data);
      setCampaign(campaignRes.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5001); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (!stats || !campaign) return <div>Loading campaign stats...</div>;

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
  };

  return (
    <div className="campaign-stats">
      <h2>{campaign.name}</h2>
      <div className="campaign-schedule">
        <p>
          <strong>Schedule:</strong> {formatDateTime(campaign.startDate)} - {formatDateTime(campaign.endDate)}
        </p>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <h4>Total Impressions</h4>
          <p className="stat-value">{stats.impressions}</p>
        </div>
        <div className="stat-card">
          <h4>Total Clicks</h4>
          <p className="stat-value">{stats.clicks}</p>
        </div>
        <div className="stat-card">
          <h4>Click-Through Rate (CTR)</h4>
          <p className="stat-value">{stats.ctr}</p>
        </div>
      </div>
    </div>
  );
}

export default CampaignChart;
