import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Loader2, Check, Sparkles, Trash2, Lock } from 'lucide-react';
import { searchRelationships, RelationshipSearchResult } from '../../lib/domain/search';
import { parseConversationWithAI, ParsedConversation, ParsedMessage } from '../../lib/domain/importInteractions';
import { importParsedConversation } from '../../lib/domain/bulkInteractions';

interface ImportInteractionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: () => void;
  initialContact?: RelationshipSearchResult; // pre-fills the contact field, still editable until Parse is clicked
}

const fieldClasses =
  'w-full bg-zinc-900 border border-white/20 rounded-lg text-sm text-white placeholder-zinc-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-rios-purple/60 focus:border-rios-purple/60 transition-all';

export const ImportInteractionsModal: React.FC<ImportInteractionsModalProps> = ({ isOpen, onClose, onImported, initialContact }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RelationshipSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<RelationshipSearchResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [rawText, setRawText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [meta, setMeta] = useState<Pick<ParsedConversation, 'overallClassification' | 'overallBuyingStage' | 'summary'> | null>(null);
  const [messages, setMessages] = useState<ParsedMessage[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Contact is only locked once parsing has actually started (or succeeded) —
  // a failed parse re-opens it, since nothing was actually saved yet.
  const isLocked = parsing || meta !== null;
  const isParsed = meta !== null;

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') resetAndClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Pre-fill on open, but this is just a starting point — still fully
  // searchable/editable until Parse with AI is clicked.
  useEffect(() => {
    if (isOpen && initialContact) {
      setSelected(initialContact);
      setQuery(initialContact.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || selected || isLocked) {
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
  }, [query, selected, isLocked]);

  function handleSelectContact(r: RelationshipSearchResult) {
    setSelected(r);
    setQuery(r.name);
    setShowResults(false);
  }

  function resetForm() {
    // Clears everything except isOpen — used by both full close and "Save & New".
    setQuery('');
    setResults([]);
    setShowResults(false);
    setSelected(null);
    setRawText('');
    setMeta(null);
    setMessages([]);
    setError(null);
  }

  function resetAndClose() {
    resetForm();
    onClose();
  }

  async function handleParse() {
    if (!selected) {
      setError('Search for and select a contact first.');
      return;
    }
    if (rawText.trim().length < 10) {
      setError('Paste a real conversation first.');
      return;
    }
    setParsing(true);
    setError(null);
    try {
      const result = await parseConversationWithAI(selected.name, rawText);
      setMeta({
        overallClassification: result.overallClassification,
        overallBuyingStage: result.overallBuyingStage,
        summary: result.summary,
      });
      setMessages(result.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse conversation');
    } finally {
      setParsing(false);
    }
  }

  function updateMessage(index: number, patch: Partial<ParsedMessage>) {
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function removeMessage(index: number) {
    setMessages((prev) => prev.filter((_, i) => i !== index));
  }

  async function doImport(): Promise<boolean> {
    if (!selected || !meta) return false;
    if (messages.length === 0) {
      setError('At least one message is required to import.');
      return false;
    }
    setImporting(true);
    setError(null);
    try {
      await importParsedConversation(selected.id, { ...meta, messages });
      onImported?.();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save imported conversation');
      return false;
    } finally {
      setImporting(false);
    }
  }

  async function handleSave() {
    if (await doImport()) resetAndClose();
  }

  async function handleSaveAndNew() {
    if (await doImport()) resetForm(); // stays open, ready for the next contact
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={resetAndClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-zinc-950 border border-white/20 rounded-[18px] p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-rios-purple" />
                <h2 className="text-white text-base font-semibold">Import Interactions</h2>
              </div>
              <button onClick={resetAndClose} className="text-zinc-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Contact — always visible, editable until locked by parsing */}
              <div className="relative">
                <label className="text-xs text-zinc-400 flex items-center gap-1.5 mb-1.5">
                  Contact
                  {isLocked && <Lock className="w-3 h-3 text-zinc-500" />}
                </label>
                <div className="relative">
                  {selected ? (
                    <Check className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  ) : (
                    <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  )}
                  <input
                    type="text"
                    value={query}
                    disabled={isLocked}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      if (selected) setSelected(null);
                    }}
                    onFocus={() => results.length > 0 && setShowResults(true)}
                    placeholder="Search any contact by name..."
                    className={`h-10 pl-9 pr-3 ${fieldClasses} ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                  />
                  {searching && (
                    <Loader2 className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 animate-spin pointer-events-none" />
                  )}
                  {selected && !searching && !isLocked && (
                    <button
                      onClick={() => {
                        setSelected(null);
                        setQuery('');
                        setResults([]);
                      }}
                      className="text-xs text-rios-purple-glow hover:underline absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      Change
                    </button>
                  )}
                </div>
                {showResults && !isLocked && results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full border border-white/20 bg-zinc-900 rounded-lg overflow-hidden max-h-56 overflow-y-auto shadow-xl">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => handleSelectContact(r)}
                        className="w-full text-left px-3 py-2.5 hover:bg-zinc-800 transition-colors border-b border-white/10 last:border-b-0"
                      >
                        <div className="text-sm font-medium text-white">{r.name}</div>
                        <div className="text-xs text-zinc-400">
                          {r.position} {r.position && r.company ? '·' : ''} {r.company}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Paste + Parse — hidden once parsed, to keep the view focused on review */}
              {!isParsed && (
                <>
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1.5">
                      Paste the whole conversation — email thread, LinkedIn chat, WhatsApp export, or even a ChatGPT session about this contact
                    </label>
                    <textarea
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      rows={10}
                      placeholder="Paste anything — AI will split it into individual messages..."
                      className={`px-3 py-2.5 resize-y font-mono text-xs leading-relaxed ${fieldClasses}`}
                    />
                    <div className="text-xs text-zinc-500 mt-1">{rawText.length.toLocaleString()} characters</div>
                  </div>

                  {error && <div className="text-xs text-red-400">{error}</div>}

                  <button
                    onClick={handleParse}
                    disabled={parsing || rawText.trim().length < 10}
                    className="w-full h-10 rounded-lg bg-rios-purple text-white text-sm font-semibold hover:bg-rios-purple/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {parsing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Parsing with AI...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" /> Parse with AI
                      </>
                    )}
                  </button>
                </>
              )}

              {/* Preview + save — appears once parsed */}
              {isParsed && selected && meta && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-zinc-900 border border-white/20 rounded-lg px-3 py-2.5">
                      <div className="text-[11px] uppercase tracking-wider text-zinc-500">Classification</div>
                      <div className="text-sm text-white mt-0.5">{meta.overallClassification || 'Unknown'}</div>
                    </div>
                    <div className="bg-zinc-900 border border-white/20 rounded-lg px-3 py-2.5">
                      <div className="text-[11px] uppercase tracking-wider text-zinc-500">Buying Stage</div>
                      <div className="text-sm text-white mt-0.5">{meta.overallBuyingStage || 'Unknown'}</div>
                    </div>
                  </div>

                  <div className="bg-zinc-900 border border-white/20 rounded-lg px-3 py-2.5">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Summary</div>
                    <div className="text-sm text-zinc-300 leading-relaxed">{meta.summary}</div>
                  </div>

                  {messages.length === 0 && (
                    <div className="bg-amber-950/20 border border-amber-500/20 rounded-lg px-3 py-2.5 text-[11px] text-amber-300 leading-relaxed">
                      Import Interactions is built for multi-message conversations with clear structure
                      (email threads, chat exports, back-and-forth history). A single unlabeled line
                      often can't be parsed this way — for logging one message, use <strong>Paste Reply</strong> instead.
                    </div>
                  )}

                  <div>
                    <div className="text-xs text-zinc-400 mb-1.5">
                      {messages.length} message{messages.length !== 1 ? 's' : ''} — edit anything that looks wrong before saving
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {messages.map((m, i) => (
                        <div key={i} className="border border-white/20 rounded-lg p-3 bg-zinc-900 space-y-2">
                          <div className="flex items-center gap-2">
                            <select
                              value={m.direction}
                              onChange={(e) => updateMessage(i, { direction: e.target.value as 'Sent' | 'Received' })}
                              className="h-8 px-2 bg-zinc-800 border border-white/20 rounded-md text-xs text-white focus:outline-none focus:ring-2 focus:ring-rios-purple/60"
                            >
                              <option value="Sent">You (Sent)</option>
                              <option value="Received">{selected.name.split(' ')[0]} (Received)</option>
                            </select>
                            <input
                              type="date"
                              value={m.date || ''}
                              onChange={(e) => updateMessage(i, { date: e.target.value || null })}
                              className="h-8 px-2 bg-zinc-800 border border-white/20 rounded-md text-xs text-white focus:outline-none focus:ring-2 focus:ring-rios-purple/60"
                            />
                            <select
                              value={m.channel || ''}
                              onChange={(e) => updateMessage(i, { channel: (e.target.value || null) as any })}
                              className="h-8 px-2 bg-zinc-800 border border-white/20 rounded-md text-xs text-white focus:outline-none focus:ring-2 focus:ring-rios-purple/60"
                            >
                              <option value="">No channel</option>
                              <option value="LinkedIn">LinkedIn</option>
                              <option value="Email">Email</option>
                              <option value="WhatsApp">WhatsApp</option>
                              <option value="Phone">Phone</option>
                            </select>
                            <button
                              onClick={() => removeMessage(i)}
                              className="ml-auto h-8 w-8 flex items-center justify-center rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Remove this message"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <textarea
                            value={m.text}
                            onChange={(e) => updateMessage(i, { text: e.target.value })}
                            rows={3}
                            className="w-full px-2 py-1.5 bg-zinc-800 border border-white/20 rounded-md text-xs text-zinc-200 resize-y focus:outline-none focus:ring-2 focus:ring-rios-purple/60"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {error && <div className="text-xs text-red-400">{error}</div>}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleSave}
                      disabled={importing || messages.length === 0}
                      className="h-10 rounded-lg bg-rios-purple text-white text-sm font-semibold hover:bg-rios-purple/90 transition-all disabled:opacity-50"
                    >
                      {importing ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleSaveAndNew}
                      disabled={importing || messages.length === 0}
                      className="h-10 rounded-lg bg-zinc-800 border border-white/20 text-white text-sm font-semibold hover:bg-zinc-700 transition-all disabled:opacity-50"
                    >
                      {importing ? 'Saving...' : 'Save & New'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
