import { create } from "zustand";

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: (() => void) | null;
  onCancel: (() => void) | null;
  open: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }) => void;
  close: () => void;
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  isOpen: false,
  title: "",
  message: "",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  onConfirm: null,
  onCancel: null,
  open: (opts) =>
    set({
      isOpen: true,
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? "Confirm",
      cancelLabel: opts.cancelLabel ?? "Cancel",
      onConfirm: opts.onConfirm,
      onCancel: opts.onCancel ?? null,
    }),
  close: () =>
    set({
      isOpen: false,
      title: "",
      message: "",
      onConfirm: null,
      onCancel: null,
    }),
}));
