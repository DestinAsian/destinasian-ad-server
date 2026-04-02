import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { API_BASE_URL } from '../services/api';
import { createVisibilityTracker, recordTrackedEvent } from '../utils/adTracking';
import '../styles/ResponsiveAdUnit.css';

const DEFAULT_TARGET = '_blank';

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

function openTrackedDestination(destination, target = DEFAULT_TARGET) {
  if (!destination || typeof window === 'undefined') {
    return;
  }

  const nextWindow = window.open(destination, target);
  if (nextWindow) {
    nextWindow.opener = null;
  }
}

function AdUnit({
  adUnit,
  onImpression,
  onClick,
  enableTracking = true,
  trackingBaseUrl = API_BASE_URL,
  className = ''
}) {
  const containerRef = useRef(null);
  const creativeType = useMemo(() => getCreativeType(adUnit), [adUnit]);

  const recordImpression = useCallback(async () => {
    if (enableTracking && adUnit?.adCode) {
      await recordTrackedEvent({
        apiBaseUrl: trackingBaseUrl,
        adCode: adUnit.adCode,
        eventType: 'impression'
      });
    }

    if (onImpression) {
      onImpression(adUnit);
    }
  }, [adUnit, enableTracking, onImpression, trackingBaseUrl]);

  const recordClickAndOpen = useCallback(async (destination) => {
    if (!destination) {
      return;
    }

    if (enableTracking && adUnit?.adCode) {
      await recordTrackedEvent({
        apiBaseUrl: trackingBaseUrl,
        adCode: adUnit.adCode,
        eventType: 'click'
      });
    }

    if (onClick) {
      onClick(adUnit);
    }

    openTrackedDestination(destination);
  }, [adUnit, enableTracking, onClick, trackingBaseUrl]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const tracker = createVisibilityTracker({
      element: containerRef.current,
      onVisible: recordImpression
    });

    tracker.start();

    return () => {
      tracker.stop();
    };
  }, [recordImpression]);

  const handleContainerClick = useCallback(async (event) => {
    if (creativeType === 'iframe') {
      return;
    }

    if (creativeType === 'html') {
      const clickedElement = event.target instanceof Element ? event.target : null;
      const anchor = clickedElement ? clickedElement.closest('a[href]') : null;
      if (anchor && containerRef.current && containerRef.current.contains(anchor)) {
        event.preventDefault();
        await recordClickAndOpen(anchor.href);
        return;
      }
    }

    if (adUnit?.clickUrl) {
      event.preventDefault();
      await recordClickAndOpen(adUnit.clickUrl);
    }
  }, [adUnit, creativeType, recordClickAndOpen]);

  const handleIframeOverlayClick = useCallback(async () => {
    if (adUnit?.clickUrl) {
      await recordClickAndOpen(adUnit.clickUrl);
    }
  }, [adUnit, recordClickAndOpen]);

  const handleKeyDown = useCallback(async (event) => {
    if (!adUnit?.clickUrl || creativeType === 'iframe') {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      await recordClickAndOpen(adUnit.clickUrl);
    }
  }, [adUnit, creativeType, recordClickAndOpen]);

  const rootClassName = ['responsive-ad', className].filter(Boolean).join(' ');
  const isWrapperClickable = creativeType !== 'iframe' && Boolean(adUnit?.clickUrl);

  return (
    <div
      ref={containerRef}
      className={rootClassName}
      onClick={handleContainerClick}
      onKeyDown={handleKeyDown}
      role={isWrapperClickable ? 'button' : undefined}
      tabIndex={isWrapperClickable ? 0 : undefined}
    >
      {(creativeType === 'image' || creativeType === 'html') && (
        <div className={`responsive-ad__surface ${isWrapperClickable ? 'responsive-ad__surface--clickable' : ''}`}>
          {creativeType === 'image' && (
            <img
              src={adUnit.imageUrl}
              alt={adUnit.name}
              className="responsive-ad__image"
            />
          )}
          {creativeType === 'html' && (
            <div
              className="responsive-ad__html"
              dangerouslySetInnerHTML={{ __html: adUnit.htmlCreative }}
            />
          )}
        </div>
      )}

      {creativeType === 'iframe' && (
        <div className="responsive-ad__iframe-shell">
          <iframe
            src={adUnit.iframeUrl}
            title={adUnit.name}
            className="responsive-ad__iframe"
            loading="lazy"
          />
          {adUnit.clickUrl && (
            <button
              type="button"
              className="responsive-ad__iframe-overlay"
              aria-label={`Open ${adUnit.name}`}
              onClick={handleIframeOverlayClick}
            />
          )}
        </div>
      )}

      {creativeType === 'empty' && (
        <div className="responsive-ad__empty">
          No creative available for this ad unit.
        </div>
      )}
    </div>
  );
}

export default AdUnit;
