import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Loader2, FileText } from 'lucide-react';
import { logBulkActivity } from '../../lib/domain/outreach';

interface LogActivitySheetProps {
  isOpen: boolean;
  onClose: () => void;
  relationshipIds: string[];
  onLogged: (ids: string[]) => void;
}

export const LogActivitySheet: React.FC<LogActivitySheetProps> = ({
  isOpen, onClose, relationshipIds, onLogged,
}) => {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  function handleClose() {
    setNote('');
    setDone(false);
    onClose();
  }

  async function handleLog() {
    setSaving(true);
    try {
      await logBulkActivity(
        relationshipIds,
        note.trim() || null,
        'gpt-4o-mini'
      );
      onLogged(relationshipIds);
      setDone(true);
    } catch (err) {
      console.error('Log activity failed:', err);
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
                <FileText className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-semibold text-white">Log Activity</span>
                <span className="text-xs text-zinc-500">· {relationshipIds.length} contact{relationshipIds.length !== 1 ? 's' : ''}</span>
              </div>
              <button onClick={handleClose} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {done ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <Check className="w-4 h-4 text-emerald-400" />
                </div>
                <span className="text-sm font-semibold text-white">Activity logged</span>
                <span className="text-xs text-zinc-500">Cadence advanced · next touch dates updated</span>
                <button onClick={handleClose} className="mt-1 px-4 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-300 hover:text-white transition-colors">
                  Close
                </button>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block mb-2">
                    Add a note <span className="text-zinc-600 normal-case font-normal">— optional</span>
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder={`e.g. "Had a call, they mentioned to follow up by the 15th of next month"`}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg text-xs text-zinc-200 placeholder-zinc-600 p-3 focus:outline-none focus:border-rios-purple/40 transition-all resize-none leading-relaxed"
                  />
                  {note.trim() && (
                    <p className="text-[10px] text-zinc-500 mt-1.5">
                      Note will be logged on all {relationshipIds.length} contacts · one AI call will suggest next best action
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleClose}
                    className="flex-1 h-9 rounded-lg border border-white/10 text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLog}
                    disabled={saving}
                    className="flex-1 h-9 rounded-lg bg-rios-purple text-white text-xs font-semibold hover:bg-rios-purple/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Logging…</>
                      : <><Check className="w-3.5 h-3.5" /> Mark Complete</>
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
