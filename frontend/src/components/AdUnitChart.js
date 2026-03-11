import React from 'react';

function AdUnitChart({ adUnit }) {
  // Use CTR from API if available, otherwise calculate
  const displayCtr = typeof adUnit.ctr === 'number' ? adUnit.ctr : (adUnit.impressions > 0 ? ((adUnit.clicks / adUnit.impressions) * 100).toFixed(2) : 0);

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
  };

  return (
    <div className="ad-unit-display">
      {adUnit.imageUrl && (
        <div className="ad-unit-image">
          <img src={adUnit.imageUrl} alt={adUnit.name} />
        </div>
      )}
      <div className="ad-unit-info">
        <h4>{adUnit.name}</h4>
        <p className="ad-code">Code: {adUnit.adCode}</p>
        <div className="ad-unit-schedule">
          <small>
            Schedule: {formatDateTime(adUnit.startDate)} - {formatDateTime(adUnit.endDate)}
          </small>
        </div>
        <div className="ad-unit-stats">
          <div className="stat-item">
            <span>Impressions:</span>
            <strong>{adUnit.impressions || 0}</strong>
          </div>
          <div className="stat-item">
            <span>Clicks:</span>
            <strong>{adUnit.clicks || 0}</strong>
          </div>
          <div className="stat-item">
            <span>CTR:</span>
            <strong>{displayCtr}%</strong>
          </div>
        </div>
        <div className="ad-unit-details">
          <small>Status: {adUnit.status || 'active'}</small>
        </div>
      </div>
    </div>
  );
}

export default AdUnitChart;
