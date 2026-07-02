import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CircleNotch, X } from "@phosphor-icons/react";

interface FormSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
  children: React.ReactNode;
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
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, saving]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-6 pt-16 backdrop-blur-sm sm:items-center"
          onClick={saving ? undefined : onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-sheet-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-surface-1 p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 id="form-sheet-title" className="text-base font-semibold text-text-primary">
                {title}
              </h3>
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                aria-label="Close"
                className="focus-ring rounded-lg p-1.5 text-text-muted transition hover:bg-surface-2 hover:text-text-primary disabled:opacity-50"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="space-y-3">{children}</div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="focus-ring flex-1 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-surface-3 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={onSave}
                className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-surface-0 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? <CircleNotch size={16} className="animate-spin" /> : null}
                {saveLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export const sheetInputClass =
  "focus-ring w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted";