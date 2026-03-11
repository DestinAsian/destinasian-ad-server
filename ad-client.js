/**
 * Ad Server Client SDK
 * Include this script in your website to load and track ads
 * 
 * Usage:
 * <script src="https://your-ad-server.com/ad-client.js"></script>
 * <div id="my-ad" data-ad-code="ad-code-here" data-width="100%"></div>
 * <script>
 *   AdServer.loadAd('my-ad');
 * </script>
 */

window.AdServer = (function() {
  const API_BASE = 'http://localhost:5001/api';
  const ads = {};

  /**
   * Load and initialize an ad unit
   * @param {string} containerId - HTML element ID where ad will be loaded
   */
  async function loadAd(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`[AdServer] Container #${containerId} not found`);
      return;
    }

    const adCode = container.dataset.adCode;
    const inventory = container.dataset.inventory;
    const width = container.dataset.width || '100%';

    if (!adCode && !inventory) {
      console.error('[AdServer] data-ad-code or data-inventory attribute required');
      return;
    }

    try {
      // Fetch ad unit data
      const query = adCode ? `adCode=${encodeURIComponent(adCode)}` : `inventory=${encodeURIComponent(inventory)}`;
      const response = await fetch(`${API_BASE}/serve?${query}`);
      if (!response.ok) {
        console.error('[AdServer] Ad server response error');
        return;
      }
      const adUnit = await response.json();

      if (!adUnit) {
        console.error('[AdServer] Ad unit not found');
        return;
      }

      // Set container styles
      container.style.width = width;
      container.style.aspectRatio = '1/1';
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'center';
      container.style.overflow = 'hidden';
      container.style.backgroundColor = '#f0f0f0';
      container.style.cursor = 'pointer';
      container.style.borderRadius = '4px';

      // Create and insert image
      const img = document.createElement('img');
      img.src = adUnit.imageUrl;
      img.alt = adUnit.name;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';

      container.appendChild(img);

      // Record impression
      await recordImpression(adUnit.adCode);

      // Record click
      container.addEventListener('click', async () => {
        await recordClick(adUnit.adCode);
        window.open(adUnit.clickUrl, '_blank');
      });

      // Store ad reference
      ads[containerId] = adUnit;

      console.log(`[AdServer] Ad loaded: ${adUnit.name}`);
    } catch (error) {
      console.error('[AdServer] Error loading ad:', error);
    }
  }

  /**
   * Record impression
   */
  async function recordImpression(adCode) {
    try {
      await fetch(`${API_BASE}/tracking/${adCode}/impression`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log(`[AdServer] Impression recorded: ${adCode}`);
    } catch (error) {
      console.error('[AdServer] Error recording impression:', error);
    }
  }

  /**
   * Record click
   */
  async function recordClick(adCode) {
    try {
      await fetch(`${API_BASE}/tracking/${adCode}/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log(`[AdServer] Click recorded: ${adCode}`);
    } catch (error) {
      console.error('[AdServer] Error recording click:', error);
    }
  }

  /**
   * Get ad stats
   */
  async function getAdStats(adCode) {
    try {
      const response = await fetch(`${API_BASE}/ad-units?adCode=${adCode}`);
      const adUnits = await response.json();
      const adUnit = adUnits.find(ad => ad.adCode === adCode);
      return {
        impressions: adUnit.impressions,
        clicks: adUnit.clicks,
        ctr: adUnit.impressions > 0 
          ? ((adUnit.clicks / adUnit.impressions) * 100).toFixed(2)
          : 0
      };
    } catch (error) {
      console.error('[AdServer] Error getting stats:', error);
      return null;
    }
  }

  /**
   * Load all ads with data-ad attribute
   */
  function autoLoad() {
    const adElements = document.querySelectorAll('[data-ad-code]');
    adElements.forEach((el, index) => {
      if (!el.id) {
        el.id = `ad-server-${index}`;
      }
      loadAd(el.id);
    });
  }

  // Public API
  return {
    loadAd,
    recordImpression,
    recordClick,
    getAdStats,
    autoLoad,
    version: '1.0.0'
  };
})();

// Auto-load ads when DOM is ready
document.addEventListener('DOMContentLoaded', AdServer.autoLoad);
