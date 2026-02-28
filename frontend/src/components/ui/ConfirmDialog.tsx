import { useConfirmStore } from "../../stores/confirmStore";
import { AlertTriangle } from "lucide-react";

export default function ConfirmDialog() {
  const {
    isOpen,
    title,
    message,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    close,
  } = useConfirmStore();

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm?.();
    close();
  };

  const handleCancel = () => {
    onCancel?.();
    close();
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleCancel}
      />
      {/* Dialog */}
      <div className="relative bg-[#1a1a24] border border-[#2d2d3a] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <p className="text-sm text-gray-400 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-[#23232f] hover:bg-[#2d2d3a] rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
