import { useToastStore } from "../../stores/toastStore";
import type { ToastType } from "../../stores/toastStore";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

const iconMap: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap: Record<
  ToastType,
  { border: string; icon: string; bg: string }
> = {
  success: {
    border: "border-emerald-500/30",
    icon: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  error: {
    border: "border-red-500/30",
    icon: "text-red-400",
    bg: "bg-red-500/10",
  },
  warning: {
    border: "border-yellow-500/30",
    icon: "text-yellow-400",
    bg: "bg-yellow-500/10",
  },
  info: {
    border: "border-blue-500/30",
    icon: "text-blue-400",
    bg: "bg-blue-500/10",
  },
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => {
        const Icon = iconMap[t.type];
        const colors = colorMap[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 bg-[#1a1a24] border ${colors.border} rounded-xl shadow-2xl shadow-black/40 animate-slide-in`}
          >
            <div
              className={`w-8 h-8 ${colors.bg} rounded-lg flex items-center justify-center shrink-0`}
            >
              <Icon className={`w-4 h-4 ${colors.icon}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{t.title}</p>
              {t.message && (
                <p className="text-xs text-gray-400 mt-0.5">{t.message}</p>
              )}
            </div>
            <button
              aria-label="Close notification"
              onClick={() => removeToast(t.id)}
              className="p-1 text-gray-500 hover:text-white transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
