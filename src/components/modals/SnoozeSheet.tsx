import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Clock, Check, Loader2 } from 'lucide-react';
import { snoozeContacts } from '../../lib/domain/outreach';

interface SnoozeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  relationshipIds: string[];
  onSnoozed: (ids: string[]) => void;
}

const QUICK_OPTIONS = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
];

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const SnoozeSheet: React.FC<SnoozeSheetProps> = ({
  isOpen, onClose, relationshipIds, onSnoozed,
}) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Frozen the moment the sheet opens — see ArchiveSheet.tsx for why:
  // the parent clears relationshipIds right after success, which would
  // otherwise flash the header/success text to 0 the instant it appears.
  const [displayCount, setDisplayCount] = useState(0);

  useEffect(() => {
    if (isOpen) setDisplayCount(relationshipIds.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const minDate = addDays(1);

  function handleClose() {
    setSelectedDate('');
    setReason('');
    setDone(false);
    onClose();
  }

  async function handleSnooze() {
    if (!selectedDate) return;
    setSaving(true);
    try {
      await snoozeContacts(relationshipIds, selectedDate, reason.trim() || undefined);
      onSnoozed(relationshipIds);
      setDone(true);
    } catch (err) {
      console.error('Snooze failed:', err);
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
                <Clock className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-semibold text-white">Snooze Until</span>
                <span className="text-xs text-zinc-500">· {displayCount} contact{displayCount !== 1 ? 's' : ''}</span>
              </div>
              <button onClick={handleClose} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {done ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <span className="text-sm font-semibold text-white">Snoozed until {selectedDate}</span>
                <span className="text-xs text-zinc-500">Contacts will resurface automatically on that date</span>
                <button onClick={handleClose} className="mt-1 px-4 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-300 hover:text-white transition-colors">
                  Close
                </button>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">

                {/* Quick options */}
                <div>
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-2">Quick select</div>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_OPTIONS.map((opt) => {
                      const date = addDays(opt.days);
                      const isSelected = selectedDate === date;
                      return (
                        <button
                          key={opt.days}
                          onClick={() => setSelectedDate(date)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                            isSelected
                              ? 'bg-rios-purple/20 border-rios-purple/40 text-rios-purple'
                              : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom date */}
                <div>
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-2">Or pick a date</div>
                  <input
                    type="date"
                    min={minDate}
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-zinc-900 border border-white/10 rounded-lg text-xs text-zinc-200 px-3 py-2 focus:outline-none focus:border-rios-purple/40 transition-all"
                  />
                </div>

                {/* Optional reason */}
                <div>
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-2">
                    Reason <span className="text-zinc-600 normal-case font-normal">— optional</span>
                  </div>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. On vacation, Budget freeze, Come back after Eid"
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg text-xs text-zinc-200 placeholder-zinc-600 px-3 py-2 focus:outline-none focus:border-rios-purple/40 transition-all"
                  />
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleClose}
                    className="flex-1 h-9 rounded-lg border border-white/10 text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSnooze}
                    disabled={saving || !selectedDate}
                    className="flex-1 h-9 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Snoozing…</>
                      : <><Clock className="w-3.5 h-3.5" /> Snooze</>
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
