import { CircleNotch, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId } from "react";
import { createPortal } from "react-dom";

interface FormSheetProps {
  children: React.ReactNode;
  onClose: () => void;
  onSave: () => void;
  open: boolean;
  saveLabel?: string;
  saving?: boolean;
  title: string;
}

export function FormSheet({
  open,
  title,
  onClose,
  onSave,
  saving = false,
  saveLabel = "Save",
  children,
}: FormSheetProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, saving]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pt-16 pb-6 backdrop-blur-sm sm:items-center"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={saving ? undefined : onClose}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            aria-labelledby={titleId}
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-border bg-surface-1 p-4 shadow-2xl"
            exit={{ opacity: 0, y: 24 }}
            initial={{ opacity: 0, y: 24 }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3
                className="font-semibold text-base text-text-primary"
                id={titleId}
              >
                {title}
              </h3>
              <button
                aria-label="Close"
                className="focus-ring rounded-lg p-1.5 text-text-muted transition hover:bg-surface-2 hover:text-text-primary disabled:opacity-50"
                disabled={saving}
                onClick={onClose}
                type="button"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="space-y-3">{children}</div>

            <div className="mt-5 flex gap-2">
              <button
                className="focus-ring flex-1 rounded-xl border border-border bg-surface-2 px-4 py-2.5 font-medium text-sm text-text-primary transition hover:bg-surface-3 disabled:opacity-50"
                disabled={saving}
                onClick={onClose}
                type="button"
              >
                Cancel
              </button>
              <button
                className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-medium text-sm text-surface-0 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                disabled={saving}
                onClick={onSave}
                type="button"
              >
                {saving ? (
                  <CircleNotch className="animate-spin" size={16} />
                ) : null}
                {saveLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

export const sheetInputClass =
  "focus-ring w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted";
