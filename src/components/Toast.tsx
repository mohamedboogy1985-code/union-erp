import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 left-5 z-50 flex flex-col gap-2 max-w-md w-full">
      {toasts.map((toast) => {
        const bg =
          toast.type === 'success'
            ? 'bg-emerald-800/95 text-white border-emerald-600'
            : toast.type === 'error'
            ? 'bg-rose-800/95 text-white border-rose-600'
            : toast.type === 'warning'
            ? 'bg-amber-800/95 text-white border-amber-600'
            : 'bg-blue-800/95 text-white border-blue-600';

        const Icon =
          toast.type === 'success'
            ? CheckCircle2
            : toast.type === 'error'
            ? XCircle
            : toast.type === 'warning'
            ? AlertTriangle
            : Info;

        return (
          <div
            key={toast.id}
            id={`toast-${toast.id}`}
            className={`flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur transition-all duration-300 animate-in slide-in-from-bottom-5 ${bg}`}
          >
            <Icon className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm font-medium leading-relaxed">{toast.message}</div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
