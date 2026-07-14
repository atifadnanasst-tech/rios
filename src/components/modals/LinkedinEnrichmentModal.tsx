import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Check, Loader2, Linkedin, Building2, Users, ChevronRight, AlertCircle } from 'lucide-react';
import { searchRelationships, RelationshipSearchResult } from '../../lib/domain/search';
import {
  parseLinkedinEnrichment,
  applyLinkedinEnrichment,
  checkCompanyBeforeCreate,
  ParsedEnrichment,
} from '../../lib/domain/linkedinEnrichment';

interface LinkedinEnrichmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEnriched?: (relationshipId: string) => void;
  onEnrichAndLog?: (contact: RelationshipSearchResult) => void;
  initialContact?: RelationshipSearchResult;
}

type Step = 'input' | 'parsing' | 'preview' | 'confirming' | 'done';

type CompanyDecision = {
  rawName: string;
  suggestedMatch: { id: string; name: string; similarity: number } | null;
  decision: 'use_existing' | 'create_new' | 'pending';
  existingId: string | null;
};

export const LinkedinEnrichmentModal: React.FC<LinkedinEnrichmentModalProps> = ({
  isOpen,
  onClose,
  onEnriched,
  onEnrichAndLog,
  initialContact,
}) => {
  const [step, setStep] = useState<Step>('input');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RelationshipSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<RelationshipSearchResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [profileText, setProfileText] = useState('');
  const [companyText, setCompanyText] = useState('');
  const [mutualText, setMutualText] = useState('');
  const [secondDegreeText, setSecondDegreeText] = useState('');

  const [parsed, setParsed] = useState<ParsedEnrichment | null>(null);
  const [companyDecisions, setCompanyDecisions] = useState<CompanyDecision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // "Not found — add them?" fallback, since search only ever finds people
  // already in RIOS. Lets enrichment handle a brand-new contact instead
  // of being a dead end.
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newContactCompany, setNewContactCompany] = useState('');
  const [creatingNewContact, setCreatingNewContact] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') resetAndClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && initialContact) {
      setSelected(initialContact);
      setQuery(initialContact.name);
    }
  }, [isOpen, initialContact]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || selected) { setResults([]); return; }
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
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, selected]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    if (showResults) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showResults]);

  function resetAndClose() {
    setStep('input');
    setQuery('');
    setSelected(null);
    setResults([]);
    setProfileText('');
    setCompanyText('');
    setMutualText('');
    setSecondDegreeText('');
    setParsed(null);
    setCompanyDecisions([]);
    setError(null);
    setShowCreateNew(false);
    setNewContactCompany('');
    onClose();
  }

  // Creates a brand-new contact right here, then proceeds into the exact
  // same paste/parse/preview flow as if they'd been found via search —
  // enriching someone who didn't exist in RIOS yet, in one motion.
  async function handleCreateNewContact() {
    const trimmedName = query.trim();
    if (!trimmedName) return;
    setCreatingNewContact(true);
    setError(null);
    try {
      const { createContactAndRelationship } = await import('../../lib/domain/relationships');
      const nameParts = trimmedName.split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || null;

      const result = await createContactAndRelationship(firstName, lastName, newContactCompany.trim() || null, null);
      if (!result) {
        setError('Failed to create this contact — please try again.');
        return;
      }

      const newSelected: RelationshipSearchResult = {
        id: result.relationshipId,
        contactId: result.contactId,
        name: trimmedName,
        company: newContactCompany.trim() || null,
        position: null,
        lastChannel: null,
        isArchived: false,
        isSnoozed: false,
      };
      setSelected(newSelected);
      setShowResults(false);
      setShowCreateNew(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create this contact.');
    } finally {
      setCreatingNewContact(false);
    }
  }

  async function handleParse() {
    if (!selected) { setError('Select a contact first.'); return; }
    setError(null);
    setStep('parsing');
    try {
      const result = await parseLinkedinEnrichment(
        selected.name,
        profileText,
        companyText || undefined,
        mutualText || undefined,
        secondDegreeText || undefined
      );
      console.log('RAW AI PARSE RESULT mutual_connections:', JSON.stringify(result.mutual_connections?.slice(0, 3)));
      setParsed(result);

      // Check each company in employment history for fuzzy matches before
      // showing the preview — this is the dedup-confirmation flow
      const decisions: CompanyDecision[] = [];
      const seen = new Set<string>();
      for (const job of result.employment_history || []) {
        if (seen.has(job.company_name)) continue;
        seen.add(job.company_name);
        const match = await checkCompanyBeforeCreate(job.company_name);
        decisions.push({
          rawName: job.company_name,
          suggestedMatch: match,
          decision: match ? 'pending' : 'create_new',
          existingId: match ? match.id : null,
        });
      }
      setCompanyDecisions(decisions);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parsing failed');
      setStep('input');
    }
  }

  async function handleApply(chainToLog: boolean = false) {
    if (!parsed || !selected) return;
    const pendingDecisions = companyDecisions.filter((d) => d.decision === 'pending');
    if (pendingDecisions.length > 0) {
      setError('Please confirm all company matches before saving.');
      return;
    }

    setApplying(true);
    setStep('confirming');
    try {
      const overrides: Record<string, string | null> = {};
      for (const d of companyDecisions) {
        if (d.decision === 'use_existing') overrides[d.rawName] = d.existingId;
        else if (d.decision === 'create_new') overrides[d.rawName] = null;
      }
      const result = await applyLinkedinEnrichment(selected.id, selected.contactId, parsed, overrides);
      console.log('Enrichment write result:', JSON.stringify(result));

      if (chainToLog) {
        // Skip the 'done' screen entirely — the natural next step (logging
        // the interaction) already confirms the save succeeded, so showing
        // an intermediate screen just to click through it is pure friction.
        const contactToLog = selected;
        onEnrichAndLog?.(contactToLog);
        resetAndClose();
      } else {
        onEnriched?.(selected.id);
        setStep('done');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Enrichment write failed:', message);
      setError(`Save failed: ${message}`);
      setStep('preview');
    } finally {
      setApplying(false);
    }
  }

  function resolveCompany(rawName: string, decision: 'use_existing' | 'create_new') {
    setCompanyDecisions((prev) =>
      prev.map((d) => d.rawName === rawName ? { ...d, decision } : d)
    );
  }

  const fieldClass =
    'w-full bg-zinc-900 border border-white/10 rounded-lg text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-rios-purple/40 transition-all resize-none';

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
            className="w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-[18px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2.5">
                <Linkedin className="w-4 h-4 text-sky-400" />
                <span className="text-sm font-semibold text-white">Enrich Contact from LinkedIn</span>
              </div>
              <button onClick={resetAndClose} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* === INPUT STEP === */}
              {(step === 'input' || step === 'parsing') && (
                <div className="p-6 space-y-5">
                  {/* Section 1 — Contact */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">Section 1</span>
                      <span className="text-xs font-semibold text-zinc-200">Contact</span>
                    </div>
                    <div ref={searchContainerRef} className="relative">
                      <div className="relative">
                        {selected ? <Check className="w-3.5 h-3.5 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2" /> : <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />}
                        <input
                          type="text"
                          value={query}
                          onChange={(e) => { setQuery(e.target.value); if (selected) setSelected(null); }}
                          onFocus={() => results.length > 0 && setShowResults(true)}
                          placeholder="Search for a contact..."
                          className={`h-9 pl-9 pr-4 ${fieldClass}`}
                        />
                        {searching && <Loader2 className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />}
                      </div>
                      {showResults && results.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-zinc-900 border border-white/10 rounded-lg overflow-hidden max-h-44 overflow-y-auto shadow-xl">
                          {results.map((r) => (
                            <button key={r.id} onClick={() => { setSelected(r); setQuery(r.name); setShowResults(false); }}
                              className="w-full text-left px-3 py-2 hover:bg-zinc-800 transition-colors border-b border-white/5 last:border-0">
                              <div className="text-xs font-medium text-white">{r.name}</div>
                              <div className="text-[10px] text-zinc-400">{r.company}</div>
                            </button>
                          ))}
                        </div>
                      )}
                      {showResults && !searching && query.trim().length >= 2 && results.length === 0 && !selected && (
                        <div className="absolute z-10 mt-1 w-full bg-zinc-900 border border-white/10 rounded-lg shadow-xl p-3 space-y-2">
                          {!showCreateNew ? (
                            <button
                              onClick={() => setShowCreateNew(true)}
                              className="w-full text-left text-xs text-rios-purple hover:text-white transition-colors"
                            >
                              + Add "{query.trim()}" as a new contact
                            </button>
                          ) : (
                            <div className="space-y-2">
                              <div className="text-[10px] text-zinc-500">
                                Creating <span className="text-zinc-300 font-medium">{query.trim()}</span> as a new contact
                              </div>
                              <input
                                type="text"
                                value={newContactCompany}
                                onChange={(e) => setNewContactCompany(e.target.value)}
                                placeholder="Company (optional)"
                                autoFocus
                                className="w-full h-8 px-2 bg-zinc-950 border border-white/10 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rios-purple/40"
                              />
                              <button
                                onClick={handleCreateNewContact}
                                disabled={creatingNewContact}
                                className="w-full h-8 rounded-lg bg-rios-purple text-white text-xs font-semibold hover:bg-opacity-90 transition-all disabled:opacity-50"
                              >
                                {creatingNewContact ? 'Creating…' : `Create & Continue`}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section 2 — LinkedIn Profile */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">Section 2</span>
                      <span className="text-xs font-semibold text-zinc-200">LinkedIn Profile Text</span>
                      <span className="text-[10px] text-zinc-500 font-semibold">Optional</span>
                    </div>
                    <textarea
                      value={profileText}
                      onChange={(e) => setProfileText(e.target.value)}
                      rows={7}
                      placeholder="Paste everything from their LinkedIn profile — About, Experience, Education, Certifications, Skills..."
                      className={`${fieldClass} p-3 leading-relaxed`}
                    />
                  </div>

                  {/* Section 3 — Company Page */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">Section 3</span>
                      <span className="text-xs font-semibold text-zinc-200">Company Page Text</span>
                      <span className="text-[10px] text-zinc-500">Optional</span>
                    </div>
                    <textarea
                      value={companyText}
                      onChange={(e) => setCompanyText(e.target.value)}
                      rows={4}
                      placeholder="Paste their current employer's LinkedIn company page — Overview, About, Specialties..."
                      className={`${fieldClass} p-3 leading-relaxed`}
                    />
                  </div>

                  {/* Section 4 — 1st Degree Connections */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">Section 4</span>
                      <span className="text-xs font-semibold text-zinc-200">1st Degree Connections</span>
                      <span className="text-[10px] text-zinc-500">Optional</span>
                    </div>
                    <textarea
                      value={mutualText}
                      onChange={(e) => setMutualText(e.target.value)}
                      rows={3}
                      placeholder="Paste only 1st degree connections (• 1st) from their profile page..."
                      className={`${fieldClass} p-3 leading-relaxed`}
                    />
                  </div>

                  {/* Section 5 — 2nd Degree Connections */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">Section 5</span>
                      <span className="text-xs font-semibold text-zinc-200">2nd Degree Connections</span>
                      <span className="text-[10px] text-zinc-500">Optional</span>
                    </div>
                    <textarea
                      value={secondDegreeText}
                      onChange={(e) => setSecondDegreeText(e.target.value)}
                      rows={3}
                      placeholder="Paste only 2nd degree connections (• 2nd) from their profile page..."
                      className={`${fieldClass} p-3 leading-relaxed`}
                    />
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-red-400 text-xs">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              )}

              {/* === PREVIEW STEP === */}
              {step === 'preview' && parsed && (
                <div className="p-6 space-y-5">
                  {/* ICP Analysis */}
                  <div className="p-4 rounded-xl bg-rios-purple/10 border border-rios-purple/20 space-y-2">
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">Strategic Read</div>
                    <p className="text-xs text-zinc-200 leading-relaxed">{parsed.icp_analysis?.overall_reasoning}</p>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {[
                        { label: 'Role Authority', value: parsed.icp_analysis?.role_authority },
                        { label: 'Technical Depth', value: parsed.icp_analysis?.technical_depth },
                        { label: 'Buying Influence', value: parsed.icp_analysis?.buying_influence },
                      ].map((item) => (
                        <div key={item.label} className="bg-zinc-900/50 rounded-lg p-2">
                          <div className="text-[9px] text-zinc-500 uppercase tracking-wide">{item.label}</div>
                          <div className="text-[11px] text-zinc-200 font-medium mt-0.5 leading-snug">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Company dedup decisions */}
                  {companyDecisions.some((d) => d.suggestedMatch) && (
                    <div>
                      <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-2">Company Match Confirmation</div>
                      <div className="space-y-2">
                        {companyDecisions.filter((d) => d.suggestedMatch).map((d) => (
                          <div key={d.rawName} className="p-3 rounded-lg bg-zinc-900 border border-amber-500/20">
                            <p className="text-xs text-zinc-200 mb-2">
                              <span className="font-semibold text-white">"{d.rawName}"</span>
                              {' '}looks similar to existing company{' '}
                              <span className="font-semibold text-amber-400">"{d.suggestedMatch!.name}"</span>
                              {' '}({Math.round(d.suggestedMatch!.similarity * 100)}% match). Same company?
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => resolveCompany(d.rawName, 'use_existing')}
                                className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${d.decision === 'use_existing' ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                              >
                                ✓ Yes, same company
                              </button>
                              <button
                                onClick={() => resolveCompany(d.rawName, 'create_new')}
                                className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${d.decision === 'create_new' ? 'bg-zinc-700 border border-white/20 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                              >
                                ✗ No, create new
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Employment history preview */}
                  {parsed.employment_history?.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-2">
                        Employment History ({parsed.employment_history.length} companies)
                      </div>
                      <div className="space-y-1.5">
                        {parsed.employment_history.map((job, i) => (
                          <div key={i} className="flex items-start gap-2 px-3 py-2 bg-zinc-900/40 rounded-lg">
                            <Building2 className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                            <div>
                              <span className="text-xs font-medium text-zinc-200">{job.company_name}</span>
                              {job.position && <span className="text-[11px] text-zinc-400 ml-1">· {job.position}</span>}
                              {job.is_current && <span className="ml-1.5 text-[9px] text-emerald-400 font-bold uppercase tracking-wide">Current</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Facts preview */}
                  {parsed.extracted_facts?.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-2">
                        Facts to Remember ({parsed.extracted_facts.length})
                      </div>
                      <div className="space-y-1">
                        {parsed.extracted_facts.map((f, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0 mt-0.5" />
                            <span className="text-zinc-400 shrink-0">({f.fact_type})</span>
                            <span className="text-zinc-300">{f.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mutual connections preview */}
                  {parsed.mutual_connections?.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-2">
                        Mutual Connections ({parsed.mutual_connections.length})
                        {' · '}
                        <span className="text-emerald-500">{parsed.mutual_connections.filter((m: any) => m.connection_degree === '1st').length} 1st</span>
                        {' · '}
                        <span className="text-blue-400">{parsed.mutual_connections.filter((m: any) => m.connection_degree === '2nd').length} 2nd</span>
                      </div>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {parsed.mutual_connections.map((m: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                              m.connection_degree === '1st'
                                ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-500/20'
                                : m.connection_degree === '2nd'
                                ? 'bg-blue-950/50 text-blue-400 border border-blue-500/20'
                                : 'bg-zinc-800 text-zinc-500'
                            }`}>
                              {m.connection_degree || '?'}
                            </span>
                            <span className="text-zinc-200 font-medium">{m.name}</span>
                            {m.current_role && <span className="text-zinc-500 truncate">· {m.current_role}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="flex items-center gap-2 text-red-400 text-xs">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              )}

              {/* === DONE STEP === */}
              {step === 'done' && (
                <div className="p-6 flex flex-col items-center justify-center gap-3 py-16">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                    <Check className="w-5 h-5 text-emerald-400" />
                  </div>
                  <span className="text-sm font-semibold text-white">Enrichment saved</span>
                  <span className="text-xs text-zinc-500 text-center max-w-xs">
                    Contact facts, employment history, and mutual connections have been added to the graph.
                  </span>
                  <button onClick={resetAndClose} className="mt-2 px-4 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-300 hover:text-white transition-colors">
                    Close
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            {(step === 'input' || step === 'parsing') && (
              <div className="px-6 py-4 border-t border-white/[0.06] shrink-0">
                <div className="flex gap-3">
                  <button onClick={resetAndClose} className="flex-1 h-9 rounded-lg border border-white/10 text-xs text-zinc-400 hover:text-white transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleParse}
                    disabled={step === 'parsing' || !selected}
                    className="flex-1 h-9 rounded-lg bg-rios-purple text-white text-xs font-semibold hover:bg-rios-purple/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {step === 'parsing' ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analysing...</>
                    ) : (
                      'Parse with AI'
                    )}
                  </button>
                </div>
              </div>
            )}

            {step === 'preview' && (
              <div className="px-6 py-4 border-t border-white/[0.06] shrink-0 space-y-2">
                <div className="flex gap-3">
                  <button onClick={() => setStep('input')} className="flex-1 h-9 rounded-lg border border-white/10 text-xs text-zinc-400 hover:text-white transition-colors">
                    Back
                  </button>
                  <button
                    onClick={() => handleApply(false)}
                    disabled={applying || companyDecisions.some((d) => d.decision === 'pending')}
                    className="flex-1 h-9 rounded-lg bg-rios-purple text-white text-xs font-semibold hover:bg-rios-purple/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {applying ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                    ) : (
                      'Save Enrichment'
                    )}
                  </button>
                </div>
                <button
                  onClick={() => handleApply(true)}
                  disabled={applying || companyDecisions.some((d) => d.decision === 'pending')}
                  className="w-full h-9 rounded-lg border border-rios-purple/30 text-rios-purple text-xs font-semibold hover:bg-rios-purple/10 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {applying ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                  ) : (
                    'Save & Log Interaction'
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
