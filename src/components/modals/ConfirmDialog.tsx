import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// A themed stand-in for the browser's native window.confirm() — same dark
// zinc/rounded look as ArchiveSheet/SnoozeSheet, just a small centered
// dialog instead of a bottom sheet, since this is a plain yes/no question
// with no form fields.
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center px-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl p-6"
          >
            <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
            <p className="text-xs text-zinc-400 leading-relaxed mb-5">{message}</p>
            <div className="flex items-center gap-3">
              <button
                onClick={onCancel}
                className="flex-1 h-9 rounded-lg border border-white/10 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 h-9 rounded-lg bg-zinc-700 text-white text-xs font-semibold hover:bg-zinc-600 transition-all"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
