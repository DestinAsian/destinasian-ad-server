export function createVisibilityTracker(options) {
  const {
    element,
    onVisible,
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
    await onVisible();
    return true;
  };

  const handleIntersect = (entries) => {
    const visibleEntry = entries.find((entry) => entry.target === element);
    if (!visibleEntry) {
      return;
    }

    if (visibleEntry.isIntersecting && visibleEntry.intersectionRatio >= visibilityThreshold) {
      if (observer && typeof observer.unobserve === 'function') {
        observer.unobserve(element);
      }

      trackOnce().catch((error) => {
        console.error('[ResponsiveAd] Error recording impression:', error);
      });
    }
  };

  const start = () => {
    const createObserver = observerFactory || ((callback, config) => {
      if (typeof window === 'undefined' || !window.IntersectionObserver) {
        return null;
      }

      return new window.IntersectionObserver(callback, config);
    });

    observer = createObserver(handleIntersect, { threshold: [visibilityThreshold] });

    if (!observer || typeof observer.observe !== 'function') {
      trackOnce().catch((error) => {
        console.error('[ResponsiveAd] Error recording impression:', error);
      });
      return null;
    }

    observer.observe(element);
    return observer;
  };

  const stop = () => {
    if (observer && typeof observer.unobserve === 'function') {
      observer.unobserve(element);
    }

    if (observer && typeof observer.disconnect === 'function') {
      observer.disconnect();
    }
  };

  return {
    start,
    stop,
    hasTracked: () => hasTracked
  };
}

export async function recordTrackedEvent(options) {
  const {
    apiBaseUrl,
    adCode,
    eventType,
    fetchImpl = typeof fetch === 'function' ? fetch : null
  } = options;

  if (!apiBaseUrl || !adCode || !eventType || typeof fetchImpl !== 'function') {
    return false;
  }

  try {
    await fetchImpl(`${apiBaseUrl}/tracking/${encodeURIComponent(adCode)}/${eventType}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      keepalive: true
    });

    return true;
  } catch (error) {
    console.error(`[ResponsiveAd] Error recording ${eventType}:`, error);
    return false;
  }
}
