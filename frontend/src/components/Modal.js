import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const openModalStack = [];
let bodyLockDepth = 0;
let originalBodyOverflow = '';
let originalBodyPaddingRight = '';

const lockBodyScroll = () => {
  if (bodyLockDepth === 0) {
    originalBodyOverflow = document.body.style.overflow;
    originalBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      const currentPaddingRight = Number.parseFloat(
        window.getComputedStyle(document.body).paddingRight
      ) || 0;
      document.body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`;
    }
  }
  bodyLockDepth += 1;
};

const unlockBodyScroll = () => {
  bodyLockDepth = Math.max(0, bodyLockDepth - 1);
  if (bodyLockDepth === 0) {
    document.body.style.overflow = originalBodyOverflow;
    document.body.style.paddingRight = originalBodyPaddingRight;
  }
};

const getFocusableElements = (container) => Array.from(
  container?.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ) || []
);

function Modal({
  isOpen,
  title,
  children,
  onClose,
  contentClassName = '',
  closeOnEscape = true,
  closeOnOverlay = true
}) {
  const titleId = useId();
  const modalTokenRef = useRef(Symbol('modal'));
  const contentRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;

    const modalToken = modalTokenRef.current;
    const previouslyFocused = document.activeElement;
    openModalStack.push(modalToken);
    lockBodyScroll();

    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event) => {
      if (openModalStack[openModalStack.length - 1] !== modalToken) return;

      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusableElements = getFocusableElements(contentRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        contentRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      const stackIndex = openModalStack.lastIndexOf(modalToken);
      if (stackIndex >= 0) openModalStack.splice(stackIndex, 1);
      document.removeEventListener('keydown', handleKeyDown);
      unlockBodyScroll();
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen, closeOnEscape]);

  if (!isOpen) return null;

  const modal = (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (closeOnOverlay && event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={contentRef}
        className={`modal-content ${contentClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
}

export default Modal;
