import React from 'react';
import { motion } from 'motion/react';
import {
  Inbox,
  Users,
  Compass,
  CheckSquare,
  MessageSquare,
  Download,
  Database,
  BarChart2,
  Settings,
  Plus,
  UserPlus,
  FileSpreadsheet,
  FileText,
  ClipboardPaste
} from 'lucide-react';

interface SidebarProps {
  activeView?: string;
  onNavigate?: (view: string) => void;
  onAddRelationship?: () => void;
  id?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView = 'command-center',
  onNavigate,
  onAddRelationship,
  id
}) => {
  const menuItems = [
    { id: 'command-center', label: 'Command Center', icon: Inbox },
    { id: 'relationships', label: 'Relationships', icon: Users },
    { id: 'campaigns', label: 'Campaigns', icon: Compass },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'interactions', label: 'Interactions', icon: MessageSquare },
    { id: 'imports', label: 'Imports', icon: Download },
    { id: 'knowledge-base', label: 'Knowledge Base', icon: Database },
    { id: 'reports', label: 'Reports', icon: BarChart2 },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const shortcuts = [
    { label: 'Add Relationship', icon: UserPlus, action: onAddRelationship },
    { label: 'Log Interaction', icon: MessageSquare, action: () => alert('Logged Interaction shortcut clicked') },
    { label: 'Paste Reply', icon: ClipboardPaste, action: () => alert('Paste Reply shortcut clicked') },
    { label: 'Create Task', icon: CheckSquare, action: () => alert('Create Task shortcut clicked') },
    { label: 'Import CSV', icon: FileSpreadsheet, action: () => alert('Import CSV shortcut clicked') }
  ];

  return (
    <div
      id={id || 'rios-sidebar'}
      className="w-[240px] h-screen bg-rios-sidebar border-r border-rios-border flex flex-col justify-between shrink-0 font-sans text-[#F4F4F5]"
    >
      {/* Brand Header */}
      <div className="p-6 pb-4 flex flex-col gap-1 select-none">
        <div className="flex items-center gap-2.5">
          {/* Cubic brand logo using Tailwind and Framer motion */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rios-purple to-indigo-500 flex items-center justify-center shadow-[0_0_12px_rgba(124,58,237,0.4)]">
            <div className="w-4 h-4 border-2 border-white rotate-45 transform" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight text-white leading-none">RIOS</span>
            <span className="text-[9px] text-rios-text-muted font-medium mt-0.5 tracking-wider uppercase">
              Relationship OS
            </span>
          </div>
        </div>
        <p className="text-[10px] text-rios-text-secondary leading-normal mt-2 pr-2">
          Relationship Intelligence Operating System
        </p>
      </div>

      {/* Main Navigation Scroll Area */}
      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-6">
        {/* Nav Items */}
        <div className="flex flex-col gap-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeView;

            return (
              <button
                key={item.id}
                onClick={() => onNavigate?.(item.id)}
                className={`relative flex items-center gap-3 w-full px-3 py-2.5 rounded-[10px] text-xs font-medium transition-all duration-150 text-left select-none outline-none group ${
                  isActive
                    ? 'text-white font-semibold'
                    : 'text-rios-text-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                {/* Custom glowing background on active item */}
                {isActive && (
                  <motion.div
                    layoutId="activeNavBackground"
                    className="absolute inset-0 bg-white/[0.04] border border-white/[0.08] rounded-[10px]"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  >
                    {/* Left edge purple line accent */}
                    <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-rios-purple" />
                  </motion.div>
                )}
                
                <Icon
                  className={`w-4.5 h-4.5 transition-colors ${
                    isActive ? 'text-rios-purple' : 'text-rios-text-secondary group-hover:text-white'
                  }`}
                />
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Shortcuts Section */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rios-text-muted">
              Shortcuts
            </span>
            <button
              onClick={onAddRelationship}
              className="p-1 rounded-md text-rios-text-muted hover:text-white hover:bg-white/5 transition-colors"
              title="Add Relationship"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-0.5">
            {shortcuts.map((sc, i) => {
              const Icon = sc.icon;
              return (
                <button
                  key={i}
                  onClick={sc.action}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[11px] text-rios-text-secondary hover:text-white hover:bg-white/5 transition-colors text-left"
                >
                  <Icon className="w-3.5 h-3.5 text-rios-text-muted" />
                  <span>{sc.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Version Info */}
      <div className="p-4 border-t border-rios-border bg-zinc-950/20 flex items-center justify-between select-none">
        <span className="text-[10px] font-mono text-rios-text-muted tracking-wider">
          RIOS v1.0.0
        </span>
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="System Connected" />
      </div>
    </div>
  );
};
