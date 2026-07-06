import React from "react";
import AdUnit from "./AdUnit";

function AdUnitChart({ adUnit }) {
  // Use CTR from API if available, otherwise calculate
  const displayCtr =
    typeof adUnit.ctr === "number"
      ? adUnit.ctr
      : adUnit.impressions > 0
        ? ((adUnit.clicks / adUnit.impressions) * 100).toFixed(2)
        : 0;
  const useResponsiveAdPreview =
    process.env.REACT_APP_ENABLE_RESPONSIVE_AD_PREVIEW === "true";
  const hasRenderableCreative = Boolean(
    adUnit.imageUrl || adUnit.htmlCreative || adUnit.iframeUrl,
  );

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${dateStr} ${timeStr}`;
  };

  return (
    <div className="ad-unit-display">
      {useResponsiveAdPreview && hasRenderableCreative ? (
        <AdUnit adUnit={adUnit} className="ad-unit-preview-slot" />
      ) : adUnit.imageUrl ? (
        <div className="ad-unit-image">
          <img src={adUnit.imageUrl} alt={adUnit.name} />
        </div>
      ) : null}
      <div className="ad-unit-info">
        <h4>{adUnit.name}</h4>
        <p className="ad-code">AD ID: {adUnit.crmAdId || 'Pending'}</p>
        {adUnit.inventory && (
          <p className="ad-code">Ad Channel: {adUnit.inventory.name}</p>
        )}
        <div className="ad-unit-schedule">
          <small>
            Schedule: {formatDateTime(adUnit.startDate)} -{" "}
            {formatDateTime(adUnit.endDate)}
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
          <small>Status: {adUnit.status || "active"}</small>
        </div>
      </div>
    </div>
  );
}

export default AdUnitChart;
