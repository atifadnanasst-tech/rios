import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Loader2, Check } from 'lucide-react';
import { searchRelationships, RelationshipSearchResult } from '../../lib/domain/search';
import { logInteraction } from '../../lib/domain/interactions';

interface LogInteractionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogged?: () => void; // call this to trigger a refresh of the store after a successful save
  initialContact?: RelationshipSearchResult; // if provided, skips search and pre-fills this contact
}

// Shared classes so every field looks consistent and has a genuinely
// visible border + focus state (previous version was too faint).
const fieldClasses =
  'w-full bg-zinc-900 border border-white/15 rounded-lg text-xs text-white placeholder-zinc-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-rios-purple/60 focus:border-rios-purple/60 transition-all';

export const LogInteractionModal: React.FC<LogInteractionModalProps> = ({ isOpen, onClose, onLogged, initialContact }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RelationshipSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<RelationshipSearchResult | null>(null);
  const [showResults, setShowResults] = useState(false);

  const [direction, setDirection] = useState<'Sent' | 'Received'>('Received');
  const [channel, setChannel] = useState<'LinkedIn' | 'Email' | 'WhatsApp' | 'Phone'>('LinkedIn');
  const [messageDate, setMessageDate] = useState(new Date().toISOString().slice(0, 10));
  const [messageText, setMessageText] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Esc closes this modal exactly like clicking the X.
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') resetAndClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // If opened with a contact already known (e.g. one relationship active in
  // the Advisor panel), pre-fill it so nothing needs to be re-searched.
  useEffect(() => {
    if (isOpen && initialContact) {
      setSelected(initialContact);
      setQuery(initialContact.name);
      if (initialContact.lastChannel) setChannel(initialContact.lastChannel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
        setShowResults(true);
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

  function handleSelectContact(r: RelationshipSearchResult) {
    setSelected(r);
    setQuery(r.name);
    setShowResults(false);
    if (r.lastChannel) setChannel(r.lastChannel); // default to whatever channel was actually last used with them
  }

  function handleChangeContact() {
    setSelected(null);
    setQuery('');
    setResults([]);
  }

  function resetAndClose() {
    setQuery('');
    setResults([]);
    setShowResults(false);
    setSelected(null);
    setDirection('Received');
    setChannel('LinkedIn');
    setMessageDate(new Date().toISOString().slice(0, 10));
    setMessageText('');
    setError(null);
    onClose();
  }

  async function handleSave() {
    if (!selected) {
      setError('Search for and select a contact first.');
      return;
    }
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
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
          onClick={resetAndClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-zinc-950 border border-white/15 rounded-[18px] p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-sm font-semibold">Paste Reply</h2>
              <button onClick={resetAndClose} className="text-zinc-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Contact search — always visible, never hides the rest of the form */}
              <div className="relative">
                <label className="text-[10px] text-zinc-400 block mb-1">Contact</label>
                <div className="relative">
                  {selected ? (
                    <Check className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  ) : (
                    <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  )}
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      if (selected) setSelected(null); // typing again means picking someone new
                    }}
                    onFocus={() => results.length > 0 && setShowResults(true)}
                    placeholder="Search any contact by name..."
                    className={`h-9 pl-9 pr-16 ${fieldClasses}`}
                  />
                  {searching && (
                    <Loader2 className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
                  )}
                  {selected && !searching && (
                    <button
                      onClick={handleChangeContact}
                      className="text-[10px] text-rios-purple-glow hover:underline absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      Change
                    </button>
                  )}
                </div>

                {showResults && results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full border border-white/15 bg-zinc-900 rounded-lg overflow-hidden max-h-48 overflow-y-auto shadow-xl">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => handleSelectContact(r)}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-800 transition-colors border-b border-white/10 last:border-b-0"
                      >
                        <div className="text-xs font-medium text-white">{r.name}</div>
                        <div className="text-[10px] text-zinc-400">
                          {r.position} {r.position && r.company ? '·' : ''} {r.company}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {query.length >= 2 && !searching && !selected && results.length === 0 && (
                  <div className="mt-1 text-[11px] text-zinc-500">No matches found.</div>
                )}
              </div>

              {/* Everything below is visible from the start — nothing hidden behind contact selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">Direction</label>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as 'Sent' | 'Received')}
                    className={`h-9 px-2 ${fieldClasses}`}
                  >
                    <option value="Received">They contacted me</option>
                    <option value="Sent">I contacted them</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">Channel</label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as any)}
                    className={`h-9 px-2 ${fieldClasses}`}
                  >
                    <option>LinkedIn</option>
                    <option>Email</option>
                    <option>WhatsApp</option>
                    <option>Phone</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 block mb-1">Date</label>
                <input
                  type="date"
                  value={messageDate}
                  onChange={(e) => setMessageDate(e.target.value)}
                  className={`h-9 px-2 ${fieldClasses}`}
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 block mb-1">What was said</label>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={4}
                  placeholder="Paste or type the message..."
                  className={`px-2 py-2 resize-none ${fieldClasses}`}
                />
              </div>

              {error && <div className="text-[11px] text-red-400">{error}</div>}

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full h-9 rounded-lg bg-rios-purple text-white text-xs font-semibold hover:bg-rios-purple/90 transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-rios-purple/60"
              >
                {saving ? 'Saving...' : 'Save Interaction'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
