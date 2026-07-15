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
      if (root.document.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', exported.autoLoad);
      } else {
        exported.autoLoad();
      }
    }
  }
})(typeof window !== 'undefined' ? window : globalThis, function(root) {
  function normalizeApiBase(value) {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim().replace(/\/+$/, '');
    if (!trimmed) {
      return null;
    }

    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }

  function getCurrentScript() {
    if (!root.document) {
      return null;
    }

    if (root.document.currentScript) {
      return root.document.currentScript;
    }

    if (typeof root.document.getElementsByTagName !== 'function') {
      return null;
    }

    const scripts = Array.from(root.document.getElementsByTagName('script'));
    return scripts.reverse().find((script) => typeof script.src === 'string' && script.src.includes('ad-client.js')) || null;
  }

  function resolveApiBase() {
    const currentScript = getCurrentScript();
    const datasetApiBase = normalizeApiBase(currentScript?.dataset?.apiBase);
    if (datasetApiBase) {
      return datasetApiBase;
    }

    const explicitApiBase = normalizeApiBase(root.AD_SERVER_API_BASE || root.AD_SERVER_BASE_URL);
    if (explicitApiBase) {
      return explicitApiBase;
    }

    if (currentScript?.src) {
      try {
        const scriptUrl = new URL(currentScript.src, root.location?.href);
        return `${scriptUrl.origin}/api`;
      } catch (error) {
        console.error('[AdServer] Error resolving API base from script URL:', error);
      }
    }

    if (root.location?.origin) {
      return `${root.location.origin.replace(/\/+$/, '')}/api`;
    }

    return 'http://localhost:5001/api';
  }

  const API_BASE = resolveApiBase();
  const ads = {};
  const usedAdCodesByInventory = {};
  const loadQueuesByInventory = {};

  function setContainerStyles(container, width) {
    container.style.width = width;
    container.style.aspectRatio = '1/1';
    container.style.display = 'block';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.backgroundColor = '#f0f0f0';
    container.style.borderRadius = '4px';
  }

  function createSurface(container) {
    const surface = root.document.createElement('div');
    surface.style.position = 'absolute';
    surface.style.inset = '0';
    surface.style.width = '100%';
    surface.style.height = '100%';
    surface.style.display = 'flex';
    surface.style.alignItems = 'stretch';
    surface.style.justifyContent = 'stretch';
    return surface;
  }

  function renderAdImage(surface, adUnit) {
    const img = root.document.createElement('img');
    img.src = adUnit.imageUrl;
    img.alt = adUnit.name;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.display = 'block';
    surface.appendChild(img);
  }

  function renderAdHtml(surface, adUnit) {
    const htmlContainer = root.document.createElement('div');
    htmlContainer.style.width = '100%';
    htmlContainer.style.height = '100%';
    htmlContainer.style.overflow = 'auto';
    htmlContainer.innerHTML = adUnit.htmlCreative;
    surface.appendChild(htmlContainer);
    return htmlContainer;
  }

  function renderAdIframe(container, adUnit) {
    const iframe = root.document.createElement('iframe');
    iframe.src = adUnit.iframeUrl;
    iframe.title = adUnit.name || 'Advertisement';
    iframe.loading = 'lazy';
    iframe.style.position = 'absolute';
    iframe.style.inset = '0';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';
    iframe.style.display = 'block';
    container.appendChild(iframe);

    if (adUnit.clickUrl) {
      const overlay = root.document.createElement('button');
      overlay.type = 'button';
      overlay.setAttribute('aria-label', `Open ${adUnit.name || 'advertisement'}`);
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.border = '0';
      overlay.style.padding = '0';
      overlay.style.margin = '0';
      overlay.style.background = 'transparent';
      overlay.style.cursor = 'pointer';
      container.appendChild(overlay);
      return overlay;
    }

    return iframe;
  }

  function getCreativeType(adUnit) {
    if (adUnit.htmlCreative) {
      return 'html';
    }

    if (adUnit.iframeUrl) {
      return 'iframe';
    }

    if (adUnit.imageUrl) {
      return 'image';
    }

    return 'empty';
  }

  function openTrackedDestination(destination) {
    if (!destination) {
      return;
    }

    const openedWindow = root.open(destination, '_blank');
    if (openedWindow) {
      openedWindow.opener = null;
    }
  }

  async function handleTrackedClick(adUnit, destination) {
    if (!destination) {
      return;
    }

    await recordClick(adUnit.adCode);
    openTrackedDestination(destination);
  }

  function renderAdCreative(container, adUnit) {
    const creativeType = getCreativeType(adUnit);

    if (creativeType === 'iframe') {
      return {
        creativeType,
        interactiveNode: renderAdIframe(container, adUnit)
      };
    }

    const surface = createSurface(container);
    container.appendChild(surface);

    if (creativeType === 'html') {
      return {
        creativeType,
        interactiveNode: renderAdHtml(surface, adUnit)
      };
    }

    if (creativeType === 'image') {
      renderAdImage(surface, adUnit);
      return {
        creativeType,
        interactiveNode: surface
      };
    }

    const emptyState = root.document.createElement('div');
    emptyState.textContent = 'No creative available';
    emptyState.style.width = '100%';
    emptyState.style.height = '100%';
    emptyState.style.display = 'flex';
    emptyState.style.alignItems = 'center';
    emptyState.style.justifyContent = 'center';
    emptyState.style.color = '#666';
    emptyState.style.fontSize = '14px';
    surface.appendChild(emptyState);

    return {
      creativeType,
      interactiveNode: surface
    };
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

  async function loadAdIntoContainer(container, options) {
    const { adCode, inventory, width, containerId } = options;
    try {
      const queryParams = new URLSearchParams();

      if (adCode) {
        queryParams.set('adCode', adCode);
      } else {
        queryParams.set('inventory', inventory);

        const usedAdCodes = Array.from(usedAdCodesByInventory[inventory] || []);
        if (usedAdCodes.length > 0) {
          queryParams.set('exclude', usedAdCodes.join(','));
        }
      }

      const response = await root.fetch(`${API_BASE}/serve?${queryParams.toString()}`);
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
      const rendered = renderAdCreative(container, adUnit);

      const impressionTracker = createImpressionTracker({
        container,
        adCode: adUnit.adCode,
        recordImpressionFn: recordImpression
      });
      impressionTracker.start();

      container.onclick = null;
      if (rendered.creativeType === 'html') {
        rendered.interactiveNode.onclick = async (event) => {
          const target = event.target && typeof event.target.closest === 'function'
            ? event.target.closest('a[href]')
            : null;

          if (target) {
            event.preventDefault();
            await handleTrackedClick(adUnit, target.href);
            return;
          }

          if (adUnit.clickUrl) {
            await handleTrackedClick(adUnit, adUnit.clickUrl);
          }
        };
      } else if (rendered.creativeType === 'iframe') {
        if (rendered.interactiveNode && rendered.interactiveNode.tagName === 'BUTTON') {
          rendered.interactiveNode.onclick = async () => {
            await handleTrackedClick(adUnit, adUnit.clickUrl);
          };
        }
      } else if (adUnit.clickUrl) {
        container.style.cursor = 'pointer';
        container.onclick = async () => {
          await handleTrackedClick(adUnit, adUnit.clickUrl);
        };
      }

      ads[containerId] = adUnit;
      if (inventory && adUnit.adCode) {
        usedAdCodesByInventory[inventory] = usedAdCodesByInventory[inventory] || new Set();
        usedAdCodesByInventory[inventory].add(adUnit.adCode);
      }

      console.log(`[AdServer] Ad loaded: ${adUnit.name}`);
    } catch (error) {
      console.error('[AdServer] Error loading ad:', error);
    }
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

    const loadOptions = {
      adCode,
      inventory,
      width,
      containerId
    };

    if (inventory && !adCode) {
      const previousLoad = loadQueuesByInventory[inventory] || Promise.resolve();
      const nextLoad = previousLoad
        .catch(() => {})
        .then(() => loadAdIntoContainer(container, loadOptions));
      const queuedLoad = nextLoad.finally(() => {
        if (loadQueuesByInventory[inventory] === queuedLoad) {
          delete loadQueuesByInventory[inventory];
        }
      });

      loadQueuesByInventory[inventory] = queuedLoad;

      return queuedLoad;
    }

    return loadAdIntoContainer(container, loadOptions);
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
    getCreativeType,
    renderAdCreative,
    resolveApiBase,
    version: '1.2.0'
  };
});
