import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { TONE_STYLES } from '../../designSystem';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

const toastStyles: Record<ToastTone, { wrapper: string; icon: React.ReactNode; ariaRole: 'status' | 'alert' }> = {
  info: {
    wrapper: `border-sky-200 bg-sky-50 text-sky-900 dark:${TONE_STYLES.info.border} dark:${TONE_STYLES.info.bg} dark:text-sky-100`,
    icon: <Info className="w-4 h-4 text-sky-600 dark:text-sky-300" aria-hidden="true" />,
    ariaRole: 'status'
  },
  success: {
    wrapper: `border-emerald-200 bg-emerald-50 text-emerald-900 dark:${TONE_STYLES.success.border} dark:${TONE_STYLES.success.bg} dark:text-emerald-100`,
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />,
    ariaRole: 'status'
  },
  warning: {
    wrapper: `border-amber-200 bg-amber-50 text-amber-900 dark:${TONE_STYLES.warning.border} dark:${TONE_STYLES.warning.bg} dark:text-amber-100`,
    icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-300" aria-hidden="true" />,
    ariaRole: 'alert'
  },
  error: {
    wrapper: `border-red-200 bg-red-50 text-red-900 dark:${TONE_STYLES.error.border} dark:${TONE_STYLES.error.bg} dark:text-red-100`,
    icon: <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-300" aria-hidden="true" />,
    ariaRole: 'alert'
  }
};

interface ToastStackProps {
  toasts: ToastItem[];
}

export const ToastStack: React.FC<ToastStackProps> = ({ toasts }) => {
  return (
    <div 
      className="fixed z-[130] top-4 right-4 space-y-2 max-w-lg w-[calc(100vw-2rem)] pointer-events-none"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const style = toastStyles[toast.tone];
        return (
          <div
            key={toast.id}
            role={style.ariaRole}
            aria-live={style.ariaRole === 'alert' ? 'assertive' : 'polite'}
            aria-atomic="true"
            className={`pointer-events-auto border rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm flex items-start gap-2 ${style.wrapper}`}
          >
            {style.icon}
            <p className="text-sm leading-relaxed">{toast.message}</p>
          </div>
        );
      })}
    </div>
  );
};
