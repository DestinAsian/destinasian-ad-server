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

(function(root, factory) {
  const exported = factory(root);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  if (root) {
    root.AdServer = exported;

    if (root.document) {
      root.document.addEventListener('DOMContentLoaded', exported.autoLoad);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis, function(root) {
  const API_BASE = 'http://localhost:5001/api';
  const ads = {};

  function setContainerStyles(container, width) {
    container.style.width = width;
    container.style.aspectRatio = '1/1';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.overflow = 'hidden';
    container.style.backgroundColor = '#f0f0f0';
    container.style.cursor = 'pointer';
    container.style.borderRadius = '4px';
  }

  function renderAdImage(container, adUnit) {
    const img = root.document.createElement('img');
    img.src = adUnit.imageUrl;
    img.alt = adUnit.name;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    container.appendChild(img);
  }

  function createImpressionTracker(options) {
    const {
      container,
      adCode,
      recordImpressionFn,
      observerFactory,
      visibilityThreshold = 0.5
    } = options;

    let hasTracked = false;
    let observer = null;

    const trackOnce = async () => {
      if (hasTracked) {
        return false;
      }

      hasTracked = true;
      await recordImpressionFn(adCode);
      return true;
    };

    const handleIntersect = (entries) => {
      const visibleEntry = entries.find((entry) => entry.target === container);
      if (!visibleEntry) {
        return;
      }

      if (visibleEntry.isIntersecting && visibleEntry.intersectionRatio >= visibilityThreshold) {
        if (observer && typeof observer.unobserve === 'function') {
          observer.unobserve(container);
        }

        trackOnce().catch((error) => {
          console.error('[AdServer] Error recording impression:', error);
        });
      }
    };

    const start = () => {
      const createObserver = observerFactory || ((callback, config) => {
        if (!root.IntersectionObserver) {
          return null;
        }

        return new root.IntersectionObserver(callback, config);
      });

      observer = createObserver(handleIntersect, { threshold: [visibilityThreshold] });

      if (!observer || typeof observer.observe !== 'function') {
        trackOnce().catch((error) => {
          console.error('[AdServer] Error recording impression:', error);
        });
        return null;
      }

      observer.observe(container);
      return observer;
    };

    return {
      start,
      hasTracked: () => hasTracked
    };
  }

  async function loadAd(containerId) {
    const container = root.document.getElementById(containerId);
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
      const query = adCode ? `adCode=${encodeURIComponent(adCode)}` : `inventory=${encodeURIComponent(inventory)}`;
      const response = await root.fetch(`${API_BASE}/serve?${query}`);
      if (!response.ok) {
        console.error('[AdServer] Ad server response error');
        return;
      }
      const adUnit = await response.json();

      if (!adUnit) {
        console.error('[AdServer] Ad unit not found');
        return;
      }

      container.replaceChildren();
      setContainerStyles(container, width);
      renderAdImage(container, adUnit);

      const impressionTracker = createImpressionTracker({
        container,
        adCode: adUnit.adCode,
        recordImpressionFn: recordImpression
      });
      impressionTracker.start();

      container.onclick = async () => {
        await recordClick(adUnit.adCode);
        root.open(adUnit.clickUrl, '_blank');
      };

      ads[containerId] = adUnit;

      console.log(`[AdServer] Ad loaded: ${adUnit.name}`);
    } catch (error) {
      console.error('[AdServer] Error loading ad:', error);
    }
  }

  async function recordImpression(adCode) {
    try {
      await root.fetch(`${API_BASE}/tracking/${adCode}/impression`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        keepalive: true
      });
      console.log(`[AdServer] Impression recorded: ${adCode}`);
    } catch (error) {
      console.error('[AdServer] Error recording impression:', error);
    }
  }

  async function recordClick(adCode) {
    try {
      await root.fetch(`${API_BASE}/tracking/${adCode}/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        keepalive: true
      });
      console.log(`[AdServer] Click recorded: ${adCode}`);
    } catch (error) {
      console.error('[AdServer] Error recording click:', error);
    }
  }

  async function getAdStats(adCode) {
    try {
      const response = await root.fetch(`${API_BASE}/ad-units?adCode=${adCode}`);
      const adUnits = await response.json();
      const adUnit = adUnits.find((ad) => ad.adCode === adCode);
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

  function autoLoad() {
    const adElements = root.document.querySelectorAll('[data-ad-code], [data-inventory]');
    adElements.forEach((el, index) => {
      if (!el.id) {
        el.id = `ad-server-${index}`;
      }
      loadAd(el.id);
    });
  }

  return {
    loadAd,
    recordImpression,
    recordClick,
    getAdStats,
    autoLoad,
    createImpressionTracker,
    version: '1.1.0'
  };
});
