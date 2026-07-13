import React, { useEffect, useState, useRef } from 'react';
import { Search, Sparkles, Sun, Loader2 } from 'lucide-react';
import { useStore } from '../../store/useStore.ts';
import { searchRelationships, RelationshipSearchResult } from '../../lib/domain/search.ts';
import { NotificationMenu } from '../ui/NotificationMenu.tsx';
import { CalendarDropdown } from '../ui/CalendarDropdown.tsx';
import { UserMenu } from '../ui/UserMenu.tsx';

interface HeaderProps {
  onShowAIBriefing?: () => void;
  id?: string;
}

export const Header: React.FC<HeaderProps> = ({ onShowAIBriefing, id }) => {
  const searchQuery = useStore((state) => state.searchQuery);
  const setSearchQuery = useStore((state) => state.setSearchQuery);
  const openRelationshipById = useStore((state) => state.openRelationshipById);
  const [timeStr, setTimeStr] = useState('08:15 AM (PKT)');
  const [dateStr, setDateStr] = useState('Tuesday, 14 July 2025');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Real Supabase-wide search — this used to only filter the ~25 already-
  // loaded work-queue items client-side, so anyone outside that set (e.g.
  // someone who fell out of the queue after going opted-out) was
  // genuinely unfindable here, even though they still exist and are
  // findable in Paste Reply/Import Interactions' search.
  const [results, setResults] = useState<RelationshipSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      const dateFormatter = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      setTimeStr(`${timeFormatter.format(now)} (UTC)`);
      setDateStr(dateFormatter.format(now));
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced real search, same pattern as Paste Reply/Import Interactions.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchRelationships(searchQuery);
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
  }, [searchQuery]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    if (showResults) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showResults]);

  async function handleSelectResult(r: RelationshipSearchResult) {
    setShowResults(false);
    setSearchQuery('');
    await openRelationshipById(r.id);
  }

  return (
    <div
      id={id || 'rios-header'}
      className="h-[64px] border-b border-rios-border bg-rios-bg px-6 flex items-center justify-between font-sans shrink-0"
    >
      {/* Left Greeting & Date */}
      <div className="flex items-center gap-3 select-none">
        <div className="p-2 bg-amber-500/10 border border-amber-500/25 rounded-xl text-amber-500">
          <Sun className="w-5 h-5 animate-pulse" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-white leading-tight">
            Good Morning, Atif.
          </span>
          <span className="text-[10px] text-rios-text-muted mt-0.5 font-medium leading-none">
            {dateStr} <span className="mx-1 text-zinc-800">|</span> {timeStr}
          </span>
        </div>
      </div>

      {/* Center Search Input */}
      <div ref={searchContainerRef} className="flex-1 max-w-md mx-6 relative">
        <Search className="w-4 h-4 text-rios-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Search relationships, people, companies..."
          className="w-full h-9 pl-9 pr-16 bg-zinc-900/60 border border-white/5 rounded-lg text-xs text-white placeholder-rios-text-muted focus:outline-none focus:border-rios-purple/40 focus:bg-zinc-900 transition-all font-sans"
        />
        {searching ? (
          <Loader2 className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
        ) : (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-zinc-800 border border-white/5 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium text-rios-text-muted pointer-events-none select-none">
            <span>⌘</span>
            <span>K</span>
          </div>
        )}

        {showResults && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-zinc-900 border border-white/15 rounded-lg overflow-hidden max-h-72 overflow-y-auto shadow-2xl z-50">
            {results.length > 0 ? (
              results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleSelectResult(r)}
                  className="w-full text-left px-3 py-2.5 hover:bg-zinc-800 transition-colors border-b border-white/5 last:border-b-0"
                >
                  <div className="flex items-center gap-1.5">
                    <div className="text-xs font-medium text-white">{r.name}</div>
                    {r.isArchived && (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500 bg-zinc-800 border border-white/10 px-1.5 py-0.5 rounded">
                        Archived
                      </span>
                    )}
                    {!r.isArchived && r.isSnoozed && (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-500/80 bg-amber-950/30 border border-amber-500/20 px-1.5 py-0.5 rounded">
                        Snoozed
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    {r.position} {r.position && r.company ? '·' : ''} {r.company}
                  </div>
                </button>
              ))
            ) : (
              !searching && <div className="px-3 py-3 text-[11px] text-zinc-500">No matches found.</div>
            )}
          </div>
        )}
      </div>

      {/* Right Toolbar */}
      <div className="flex items-center gap-3">
        <button
          onClick={onShowAIBriefing}
          className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-zinc-900 border border-rios-purple/20 text-rios-purple-glow text-xs font-semibold hover:border-rios-purple/40 hover:bg-zinc-800 transition-all text-[#A78BFA]"
        >
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span>AI Briefing</span>
        </button>

        <CalendarDropdown />
        <NotificationMenu />

        <div className="w-[1px] h-6 bg-rios-border" />

        <UserMenu />
      </div>
    </div>
  );
};
