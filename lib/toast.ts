type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let listeners: Listener[] = [];
let nextId = 0;

function emit() {
  listeners.forEach((l) => l([...toasts]));
}

function add(message: string, variant: ToastVariant, duration = 4000) {
  const id = String(++nextId);
  toasts = [...toasts, { id, message, variant }];
  emit();
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }
}

function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (message: string) => add(message, "success"),
  error: (message: string) => add(message, "error"),
  info: (message: string) => add(message, "info"),
  warning: (message: string) => add(message, "warning"),
  dismiss,
  subscribe: (listener: Listener) => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
  getToasts: () => [...toasts],
};

export type { ToastItem, ToastVariant };
