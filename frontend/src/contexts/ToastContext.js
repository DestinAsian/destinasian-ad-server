import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import "../styles/Toast.css";

const ToastContext = createContext(null);

const toastDurations = {
  success: 3000,
  error: 6000,
  info: 4000,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message, type = "info", options = {}) => {
      const normalizedMessage = String(message || "").trim();
      if (!normalizedMessage) return null;

      const id = ++nextIdRef.current;
      const duration = options.duration ?? toastDurations[type] ?? toastDurations.info;
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
      setToasts([{ id, message: normalizedMessage, type }]);

      if (duration > 0) {
        const timer = setTimeout(() => dismissToast(id), duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [dismissToast],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      notifySuccess: (message, options) => showToast(message, "success", options),
      notifyError: (message, options) => showToast(message, "error", options),
      notifyInfo: (message, options) => showToast(message, "info", options),
      dismissToast,
    }),
    [dismissToast, showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-viewport" aria-live="polite" aria-atomic="false">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`app-toast app-toast-${toast.type}`}
              role={toast.type === "error" ? "alert" : "status"}
            >
              <div className="app-toast-content">
                <strong className="app-toast-title">
                  {toast.type === "error"
                    ? "Error"
                    : toast.type === "success"
                      ? "Success"
                      : "Notice"}
                </strong>
                <span className="app-toast-message">{toast.message}</span>
              </div>
              <button
                type="button"
                className="app-toast-close"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
              >
                x
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
