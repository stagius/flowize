import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { TONE_STYLES } from '../../designSystem';

export type DialogTone = 'info' | 'warning' | 'error';

export interface AlertDialogState {
  title: string;
  message: string;
  tone: DialogTone;
  actionLabel?: string;
  actionTone?: DialogTone;
}

export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: DialogTone;
}

interface AlertDialogProps {
  dialog: AlertDialogState | null;
  onClose: () => void;
  onAction?: () => void;
  actionBusy?: boolean;
}

export const AlertDialog: React.FC<AlertDialogProps> = ({ dialog, onClose, onAction, actionBusy = false }) => {
  if (!dialog) {
    return null;
  }

  const actionTone = dialog.actionTone || dialog.tone;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-lg rounded-xl border p-5 shadow-2xl ${TONE_STYLES[dialog.tone].border} ${TONE_STYLES[dialog.tone].bg}`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className={`w-5 h-5 mt-0.5 ${TONE_STYLES[dialog.tone].text}`} />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-100">{dialog.title}</h3>
            <p className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">{dialog.message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {dialog.actionLabel && onAction && (
            <button
              onClick={onAction}
              disabled={actionBusy}
              className={`px-3 py-1.5 rounded-lg border text-sm text-white disabled:opacity-70 disabled:cursor-not-allowed ${TONE_STYLES[actionTone].button}`}
            >
              {actionBusy ? 'Running...' : dialog.actionLabel}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm text-slate-100"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

interface ConfirmDialogProps {
  dialog: ConfirmDialogState | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ dialog, onCancel, onConfirm }) => {
  if (!dialog) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onCancel} />
      <div className={`relative w-full max-w-lg rounded-xl border p-5 shadow-2xl ${TONE_STYLES[dialog.tone].border} ${TONE_STYLES[dialog.tone].bg}`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className={`w-5 h-5 mt-0.5 ${TONE_STYLES[dialog.tone].text}`} />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-100">{dialog.title}</h3>
            <p className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">{dialog.message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm text-slate-100"
          >
            {dialog.cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 rounded-lg border text-sm text-white ${TONE_STYLES[dialog.tone].button}`}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
