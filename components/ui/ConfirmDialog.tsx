"use client";

import { Modal } from "./Modal";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  variant = "danger",
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={variant}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="flex items-center gap-0.5" role="status" aria-label="Working">
                  {[0, 1, 2].map((dot) => (
                    <span key={dot} aria-hidden="true" className="animate-loading-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: `${dot * 120}ms` }} />
                  ))}
                </span>
                {confirmLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
