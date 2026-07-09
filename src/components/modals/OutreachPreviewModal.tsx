import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Loader2, Send } from 'lucide-react';
import { generateOutreachRows, exportOutreachToXlsx, markAsOutreached, OutreachRow } from '../../lib/domain/outreach';

interface OutreachPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  relationshipIds: string[];
  onOutreached: (ids: string[]) => void;
}

export const OutreachPreviewModal: React.FC<OutreachPreviewModalProps> = ({
  isOpen, onClose, relationshipIds, onOutreached,
}) => {
  const [rows, setRows] = useState<OutreachRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || relationshipIds.length === 0) return;
    setLoading(true);
    setDone(false);
    setRows([]);
    generateOutreachRows(relationshipIds)
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, relationshipIds.join(',')]);

  async function handleExportAndMark() {
    setExporting(true);
    try {
      exportOutreachToXlsx(rows);
      await markAsOutreached(rows);
      onOutreached(rows.map(r => r.relationship_id));
      setDone(true);
    } catch (err) {
      console.error('Outreach export failed:', err);
    } finally {
      setExporting(false);
    }
  }

  function handleClose() {
    setRows([]);
    setDone(false);
    onClose();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center"
          onClick={handleClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl bg-zinc-950 border-t border-white/10 rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-rios-purple" />
                  <span className="text-sm font-semibold text-white">Outreach Preview</span>
                  {rows.length > 0 && <span className="text-xs text-zinc-500">· {rows.length} contacts</span>}
                </div>
                <p className="text-[10px] text-zinc-500 mt-0.5">Template messages generated — review before downloading</p>
              </div>
              <button onClick={handleClose} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
                  <span className="text-xs text-zinc-500 ml-2">Generating messages…</span>
                </div>
              )}

              {done && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                    <Download className="w-5 h-5 text-emerald-400" />
                  </div>
                  <span className="text-sm font-semibold text-white">Downloaded & marked as outreached</span>
                  <span className="text-xs text-zinc-500">Cadence started — next follow-up in 7 days</span>
                  <button onClick={handleClose} className="mt-2 px-4 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-300 hover:text-white transition-colors">
                    Close
                  </button>
                </div>
              )}

              {!loading && !done && rows.length > 0 && (
                <div className="divide-y divide-white/[0.04]">
                  {rows.map((row, i) => (
                    <div key={i} className="px-6 py-3">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-rios-purple/20 text-rios-purple text-[10px] font-bold flex items-center justify-center shrink-0">
                            {i + 1}
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-zinc-200">{row.name}</span>
                            {row.designation && <span className="text-[10px] text-zinc-500 ml-1.5">· {row.designation}</span>}
                            {row.company && <span className="text-[10px] text-zinc-500 ml-1">@ {row.company}</span>}
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-600">{expandedRow === i ? 'collapse' : 'preview'}</span>
                      </div>

                      <AnimatePresence>
                        {expandedRow === i && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden mt-3 space-y-3"
                          >
                            <div className="bg-zinc-900/50 rounded-lg p-3">
                              <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Message 1</div>
                              <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{row.message_1}</p>
                            </div>
                            <div className="bg-zinc-900/50 rounded-lg p-3">
                              <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Message 2</div>
                              <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{row.message_2}</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {!loading && !done && rows.length > 0 && (
              <div className="px-6 py-4 border-t border-white/[0.06] shrink-0 flex items-center justify-between">
                <p className="text-[10px] text-zinc-500">
                  Downloading marks all {rows.length} contacts as outreached and starts their 7-day cadence.
                </p>
                <button
                  onClick={handleExportAndMark}
                  disabled={exporting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rios-purple text-white text-xs font-semibold hover:bg-rios-purple/90 transition-all disabled:opacity-50"
                >
                  {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Download .xlsx & Mark Outreached
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
