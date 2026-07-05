import React, { useEffect, useState, useRef } from 'react';
import { Search, Sparkles, Sun, Moon } from 'lucide-react';
import { useStore } from '../../store/useStore.ts';
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
  const [timeStr, setTimeStr] = useState('08:15 AM (PKT)');
  const [dateStr, setDateStr] = useState('Tuesday, 14 July 2025');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Set up real clock starting with the exact mockup date/time, but updating dynamically
  useEffect(() => {
    // Initial static representation from the mockup, but then syncing to active local time
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
      
      // Let's combine standard formatted strings to look like the mockup's layout
      setTimeStr(`${timeFormatter.format(now)} (UTC)`);
      setDateStr(dateFormatter.format(now));
    };

    updateTime();
    const interval = setInterval(updateTime, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut listener for CMD+K or CTRL+K
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
      <div className="flex-1 max-w-md mx-6 relative">
        <Search className="w-4 h-4 text-rios-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search relationships, people, companies..."
          className="w-full h-9 pl-9 pr-12 bg-zinc-900/60 border border-white/5 rounded-lg text-xs text-white placeholder-rios-text-muted focus:outline-none focus:border-rios-purple/40 focus:bg-zinc-900 transition-all font-sans"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-zinc-800 border border-white/5 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium text-rios-text-muted pointer-events-none select-none">
          <span>⌘</span>
          <span>K</span>
        </div>
      </div>

      {/* Right Toolbar */}
      <div className="flex items-center gap-3">
        {/* Interactive AI Briefing Trigger Button */}
        <button
          onClick={onShowAIBriefing}
          className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-zinc-900 border border-rios-purple/20 text-rios-purple-glow text-xs font-semibold hover:border-rios-purple/40 hover:bg-zinc-800 transition-all text-[#A78BFA]"
        >
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span>AI Briefing</span>
        </button>

        {/* Calendar dropdown menu */}
        <CalendarDropdown />

        {/* Notification bell menu */}
        <NotificationMenu />

        {/* Divider */}
        <div className="w-[1px] h-6 bg-rios-border" />

        {/* User profile dropdown menu */}
        <UserMenu />
      </div>
    </div>
  );
};
