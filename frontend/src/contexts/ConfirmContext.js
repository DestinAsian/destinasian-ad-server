import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import "../styles/ConfirmDialog.css";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);
  const cancelButtonRef = useRef(null);

  const closeDialog = useCallback((confirmed) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    if (resolve) resolve(confirmed);
  }, []);

  const confirmAction = useCallback((options = {}) => {
    if (resolverRef.current) {
      resolverRef.current(false);
    }

    setDialog({
      title: options.title || "Confirm action",
      message: options.message || "Are you sure you want to continue?",
      confirmLabel: options.confirmLabel || "Confirm",
      cancelLabel: options.cancelLabel || "Cancel",
    });

    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeDialog(false);
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDialog, dialog]);

  useEffect(() => {
    return () => {
      if (resolverRef.current) resolverRef.current(false);
    };
  }, []);

  return (
    <ConfirmContext.Provider value={confirmAction}>
      {children}
      {dialog &&
        createPortal(
          <div
            className="confirm-dialog-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeDialog(false);
            }}
          >
            <div
              className="confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              aria-describedby="confirm-dialog-message"
            >
              <div className="confirm-dialog-marker" aria-hidden="true">
                !
              </div>
              <div className="confirm-dialog-content">
                <h2 id="confirm-dialog-title">{dialog.title}</h2>
                <p id="confirm-dialog-message">{dialog.message}</p>
              </div>
              <div className="confirm-dialog-actions">
                <button
                  ref={cancelButtonRef}
                  type="button"
                  className="app-nav-button is-active"
                  onClick={() => closeDialog(false)}
                >
                  {dialog.cancelLabel}
                </button>
                <button
                  type="button"
                  className="app-logout-button"
                  onClick={() => closeDialog(true)}
                >
                  {dialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return context;
}
