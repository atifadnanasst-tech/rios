import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Loader2 } from 'lucide-react';
import { searchRelationships, RelationshipSearchResult } from '../../lib/domain/search';
import { logInteraction } from '../../lib/domain/interactions';

interface LogInteractionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogged?: () => void; // call this to trigger a refresh of the store after a successful save
}

export const LogInteractionModal: React.FC<LogInteractionModalProps> = ({ isOpen, onClose, onLogged }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RelationshipSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<RelationshipSearchResult | null>(null);

  const [direction, setDirection] = useState<'Sent' | 'Received'>('Received');
  const [channel, setChannel] = useState<'LinkedIn' | 'Email' | 'WhatsApp' | 'Phone'>('LinkedIn');
  const [messageDate, setMessageDate] = useState(new Date().toISOString().slice(0, 10));
  const [messageText, setMessageText] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search-as-you-type against all of Supabase, not just loaded relationships.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || selected) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchRelationships(query);
        setResults(found);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected]);

  function resetAndClose() {
    setQuery('');
    setResults([]);
    setSelected(null);
    setDirection('Received');
    setChannel('LinkedIn');
    setMessageDate(new Date().toISOString().slice(0, 10));
    setMessageText('');
    setError(null);
    onClose();
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await logInteraction({
        relationshipId: selected.id,
        direction,
        channel,
        messageDate,
        messageText,
      });
      onLogged?.();
      resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save interaction');
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
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onClick={resetAndClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-rios-bg border border-rios-border rounded-[18px] p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-sm font-semibold">Log Interaction</h2>
              <button onClick={resetAndClose} className="text-rios-text-muted hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {!selected ? (
              <div className="relative">
                <Search className="w-4 h-4 text-rios-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search any contact by name..."
                  className="w-full h-9 pl-9 pr-3 bg-zinc-900/60 border border-white/5 rounded-lg text-xs text-white placeholder-rios-text-muted focus:outline-none focus:border-rios-purple/40 focus:bg-zinc-900 transition-all"
                />
                {searching && (
                  <Loader2 className="w-3.5 h-3.5 text-rios-text-muted absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
                )}

                {results.length > 0 && (
                  <div className="mt-2 border border-rios-border rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-800/60 transition-colors border-b border-rios-border last:border-b-0"
                      >
                        <div className="text-xs font-medium text-white">{r.name}</div>
                        <div className="text-[10px] text-rios-text-muted">
                          {r.position} {r.position && r.company ? '·' : ''} {r.company}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {query.length >= 2 && !searching && results.length === 0 && (
                  <div className="mt-2 text-[11px] text-rios-text-muted">No matches found.</div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-zinc-900/60 border border-white/5 rounded-lg px-3 py-2">
                  <div>
                    <div className="text-xs font-medium text-white">{selected.name}</div>
                    <div className="text-[10px] text-rios-text-muted">{selected.company}</div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-[10px] text-rios-purple-glow hover:underline"
                  >
                    Change
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-rios-text-muted block mb-1">Direction</label>
                    <select
                      value={direction}
                      onChange={(e) => setDirection(e.target.value as 'Sent' | 'Received')}
                      className="w-full h-9 px-2 bg-zinc-900/60 border border-white/5 rounded-lg text-xs text-white focus:outline-none focus:border-rios-purple/40"
                    >
                      <option value="Received">They contacted me</option>
                      <option value="Sent">I contacted them</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-rios-text-muted block mb-1">Channel</label>
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value as any)}
                      className="w-full h-9 px-2 bg-zinc-900/60 border border-white/5 rounded-lg text-xs text-white focus:outline-none focus:border-rios-purple/40"
                    >
                      <option>LinkedIn</option>
                      <option>Email</option>
                      <option>WhatsApp</option>
                      <option>Phone</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-rios-text-muted block mb-1">Date</label>
                  <input
                    type="date"
                    value={messageDate}
                    onChange={(e) => setMessageDate(e.target.value)}
                    className="w-full h-9 px-2 bg-zinc-900/60 border border-white/5 rounded-lg text-xs text-white focus:outline-none focus:border-rios-purple/40"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-rios-text-muted block mb-1">What was said</label>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    rows={4}
                    placeholder="Paste or type the message..."
                    className="w-full px-2 py-2 bg-zinc-900/60 border border-white/5 rounded-lg text-xs text-white placeholder-rios-text-muted focus:outline-none focus:border-rios-purple/40 resize-none"
                  />
                </div>

                {error && <div className="text-[11px] text-red-400">{error}</div>}

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full h-9 rounded-lg bg-rios-purple text-white text-xs font-semibold hover:bg-rios-purple/90 transition-all disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Interaction'}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
