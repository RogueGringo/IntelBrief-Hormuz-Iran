import { useState, useCallback, createContext, useContext } from "react";
import { COLORS } from "./theme.js";

const ToastContext = createContext(null);

const TOAST_TYPES = {
  success: { bg: `${COLORS.green}15`, border: `${COLORS.green}40`, color: COLORS.green, icon: "\u2713" },
  error: { bg: `${COLORS.red}15`, border: `${COLORS.red}40`, color: COLORS.red, icon: "\u2717" },
  info: { bg: `${COLORS.blue}15`, border: `${COLORS.blue}40`, color: COLORS.blue, icon: "\u2139" },
  warning: { bg: "#e0c04015", border: "#e0c04040", color: "#e0c040", icon: "\u26A0" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info", duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div style={{
        position: "fixed", top: 16, right: 16, zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 8, maxWidth: 360,
      }}>
        {toasts.map(t => {
          const style = TOAST_TYPES[t.type] || TOAST_TYPES.info;
          return (
            <div key={t.id} style={{
              background: style.bg,
              border: `1px solid ${style.border}`,
              borderRadius: 6,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              animation: "fadeIn 0.2s ease-out",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }} onClick={() => removeToast(t.id)}>
              <span style={{ fontSize: 14, color: style.color, fontWeight: 700 }}>{style.icon}</span>
              <span style={{ fontSize: 12, color: style.color, flex: 1 }}>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
