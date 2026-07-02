import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CircleNotch, Warning } from "@phosphor-icons/react";
import clsx from "clsx";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void | Promise<void>;
}

export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [loading, setLoading] = useState(false);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next);
  }, []);

  const close = useCallback(() => {
    if (loading) return;
    setOptions(null);
  }, [loading]);

  const handleConfirm = useCallback(async () => {
    if (!options) return;
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
      open={!!options}
      title={options?.title ?? ""}
      message={options?.message ?? ""}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      variant={options?.variant}
      loading={loading}
      onConfirm={handleConfirm}
      onCancel={close}
    />
  );

  return { confirm, dialog };
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
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
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            className="w-full max-w-xs rounded-xl border border-border bg-surface-1 p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start gap-2.5">
              <div
                className={clsx(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  variant === "danger" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent",
                )}
              >
                <Warning size={16} weight="fill" />
              </div>
              <div>
                <h3 id="confirm-title" className="text-sm font-semibold text-text-primary">
                  {title}
                </h3>
                <p id="confirm-message" className="mt-1 text-xs leading-relaxed text-text-secondary">
                  {message}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={onCancel}
                className="focus-ring flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-medium text-text-primary transition hover:bg-surface-3 disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={onConfirm}
                className={clsx(
                  "focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition active:scale-[0.98] disabled:opacity-50",
                  variant === "danger"
                    ? "bg-danger text-white hover:brightness-110"
                    : "bg-accent text-surface-0 hover:brightness-110",
                )}
              >
                {loading ? <CircleNotch size={14} className="animate-spin" /> : null}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}