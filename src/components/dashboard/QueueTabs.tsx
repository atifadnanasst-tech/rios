import React from 'react';
import { motion } from 'motion/react';

type QueueTabId = 'work-queue' | 'all' | 'starred' | 'commitments' | 'completed' | 'archived' | 'snoozed';

interface QueueTabOption {
  id: QueueTabId;
  label: string;
  count?: number;
}

interface QueueTabsProps {
  activeTab: QueueTabId;
  onChangeTab: (tab: QueueTabId) => void;
  options?: QueueTabOption[];
  className?: string;
  id?: string;
}

export const QueueTabs: React.FC<QueueTabsProps> = ({
  activeTab,
  onChangeTab,
  options = [
    { id: 'work-queue', label: 'Daily Work Queue' },
    { id: 'all', label: 'All Contacts' },
    { id: 'starred', label: 'Starred' },
    { id: 'commitments', label: 'Committed' },
    { id: 'completed', label: 'Completed Today' },
    { id: 'archived', label: 'Archived' },
    { id: 'snoozed', label: 'Snoozed' },
  ] as QueueTabOption[],
  className = '',
  id
}) => {
  return (
    <div
      id={id || 'rios-queue-tabs'}
      className={`flex items-center gap-6 border-b border-rios-border font-sans select-none ${className}`}
    >
      {options.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onChangeTab(tab.id)}
            className={`relative pb-3 text-xs font-semibold tracking-wide transition-colors outline-none focus:outline-none ${
              isActive ? 'text-white' : 'text-rios-text-secondary hover:text-white'
            }`}
          >
            <span className="relative z-10">{tab.label}</span>
            {tab.count !== undefined && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">
                {tab.count}
              </span>
            )}
            {isActive && (
              <motion.div
                layoutId="activeQueueTabIndicator"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-rios-purple rounded-full shadow-[0_-2px_6px_rgba(124,58,237,0.5)]"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
