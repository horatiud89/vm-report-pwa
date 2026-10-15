import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const TOAST_MS = 4000;
/** A toast with an action stays longer: reading it and then tapping takes time. */
const TOAST_WITH_ACTION_MS = 8000;

/** One button next to the message (e.g. Open for a push); tapping it also closes the toast. */
export interface ToastAction { label: string; onClick: () => void }
type ShowToast = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<ShowToast | null>(null);

/** Shows one short message at the bottom of the screen; a new message replaces the current one. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; action: ToastAction | undefined } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback<ShowToast>((message, action) => {
    clearTimeout(timer.current);
    setToast({ message, action });
    timer.current = setTimeout(() => setToast(null), action ? TOAST_WITH_ACTION_MS : TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  function runAction(action: ToastAction) {
    clearTimeout(timer.current);
    setToast(null);
    action.onClick();
  }

  const value = useMemo(() => show, [show]);
  const action = toast?.action;
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status">
        {toast && (
          <div className="toast">
            <span>{toast.message}</span>
            {action && <button type="button" className="toast-action" onClick={() => runAction(action)}>{action.label}</button>}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside ToastProvider');
  return show;
}
