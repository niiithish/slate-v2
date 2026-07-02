import { CircleNotch, Warning } from "@phosphor-icons/react";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface ConfirmOptions {
  cancelLabel?: string;
  confirmLabel?: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  title: string;
  variant?: "danger" | "default";
}

export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [loading, setLoading] = useState(false);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next);
  }, []);

  const close = useCallback(() => {
    if (loading) {
      return;
    }
    setOptions(null);
  }, [loading]);

  const handleConfirm = useCallback(async () => {
    if (!options) {
      return;
    }
    setLoading(true);
    try {
      await options.onConfirm();
      setOptions(null);
    } finally {
      setLoading(false);
    }
  }, [options]);

  const dialog = (
    <ConfirmDialog
      cancelLabel={options?.cancelLabel}
      confirmLabel={options?.confirmLabel}
      loading={loading}
      message={options?.message ?? ""}
      onCancel={close}
      onConfirm={handleConfirm}
      open={!!options}
      title={options?.title ?? ""}
      variant={options?.variant}
    />
  );

  return { confirm, dialog };
}

interface ConfirmDialogProps {
  cancelLabel?: string;
  confirmLabel?: string;
  loading?: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
  variant?: "danger" | "default";
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={onCancel}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-describedby="confirm-message"
            aria-labelledby="confirm-title"
            aria-modal="true"
            className="w-full max-w-xs rounded-xl border border-border bg-surface-1 p-4 shadow-2xl"
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            onClick={(event) => event.stopPropagation()}
            role="alertdialog"
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-3 flex items-start gap-2.5">
              <div
                className={clsx(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  variant === "danger"
                    ? "bg-danger-soft text-danger"
                    : "bg-accent-soft text-accent"
                )}
              >
                <Warning size={16} weight="fill" />
              </div>
              <div>
                <h3
                  className="font-semibold text-sm text-text-primary"
                  id="confirm-title"
                >
                  {title}
                </h3>
                <p
                  className="mt-1 text-text-secondary text-xs leading-relaxed"
                  id="confirm-message"
                >
                  {message}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className="focus-ring flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-medium text-text-primary text-xs transition hover:bg-surface-3 disabled:opacity-50"
                disabled={loading}
                onClick={onCancel}
                type="button"
              >
                {cancelLabel}
              </button>
              <button
                className={clsx(
                  "focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-medium text-xs transition active:scale-[0.98] disabled:opacity-50",
                  variant === "danger"
                    ? "bg-danger text-white hover:brightness-110"
                    : "bg-accent text-surface-0 hover:brightness-110"
                )}
                disabled={loading}
                onClick={onConfirm}
                type="button"
              >
                {loading ? (
                  <CircleNotch className="animate-spin" size={14} />
                ) : null}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
