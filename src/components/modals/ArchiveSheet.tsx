import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Archive as ArchiveIcon, Check, Loader2 } from 'lucide-react';
import { archiveRelationshipsBulk } from '../../lib/domain/relationships';

interface ArchiveSheetProps {
  isOpen: boolean;
  onClose: () => void;
  relationshipIds: string[];
  onArchived: (ids: string[]) => void;
}

// Preset reasons — per Atif's answer: fixed dropdown + capability to type
// a custom one. "Other" reveals a free-text input below.
const REASON_OPTIONS = [
  'Not ICP',
  'Duplicate',
  'Opted Out',
  'Bad Fit',
  'Other',
];

export const ArchiveSheet: React.FC<ArchiveSheetProps> = ({
  isOpen, onClose, relationshipIds, onArchived,
}) => {
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const isOther = selectedReason === 'Other';
  const finalReason = isOther ? customReason.trim() : selectedReason;
  const canConfirm = isOther ? customReason.trim().length > 0 : selectedReason.length > 0;

  function handleClose() {
    setSelectedReason('');
    setCustomReason('');
    setDone(false);
    onClose();
  }

  async function handleArchive() {
    if (!canConfirm) return;
    setSaving(true);
    try {
      await archiveRelationshipsBulk(relationshipIds, finalReason);
      onArchived(relationshipIds);
      setDone(true);
    } catch (err) {
      console.error('Archive failed:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
          onClick={handleClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-zinc-950 border-t border-white/10 rounded-t-2xl shadow-2xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <ArchiveIcon className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-semibold text-white">Archive</span>
                <span className="text-xs text-zinc-500">· {relationshipIds.length} contact{relationshipIds.length !== 1 ? 's' : ''}</span>
              </div>
              <button onClick={handleClose} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {done ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-9 h-9 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center">
                  <ArchiveIcon className="w-4 h-4 text-zinc-300" />
                </div>
                <span className="text-sm font-semibold text-white">
                  Archived {relationshipIds.length} contact{relationshipIds.length !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-zinc-500">They're hidden from your queues — find them anytime in the Archived tab</span>
                <button onClick={handleClose} className="mt-1 px-4 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-300 hover:text-white transition-colors">
                  Close
                </button>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">

                {/* Reason — required, one click, or type your own */}
                <div>
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-2">
                    Why are you archiving {relationshipIds.length !== 1 ? 'these contacts' : 'this contact'}?
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {REASON_OPTIONS.map((option) => {
                      const isSelected = selectedReason === option;
                      return (
                        <button
                          key={option}
                          onClick={() => setSelectedReason(option)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                            isSelected
                              ? 'bg-rios-purple/20 border-rios-purple/40 text-rios-purple'
                              : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom reason — only shown when "Other" is picked */}
                {isOther && (
                  <div>
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-2">
                      Type a reason
                    </div>
                    <input
                      type="text"
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="e.g. Competitor, No longer at company"
                      autoFocus
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg text-xs text-zinc-200 placeholder-zinc-600 px-3 py-2 focus:outline-none focus:border-rios-purple/40 transition-all"
                    />
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleClose}
                    className="flex-1 h-9 rounded-lg border border-white/10 text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleArchive}
                    disabled={saving || !canConfirm}
                    className="flex-1 h-9 rounded-lg bg-zinc-700 text-white text-xs font-semibold hover:bg-zinc-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Archiving…</>
                      : <><Check className="w-3.5 h-3.5" /> Archive</>
                    }
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
