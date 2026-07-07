import React, { useState } from 'react';
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
  ClipboardPaste,
  Sparkles,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface SidebarProps {
  activeView?: string;
  onNavigate?: (view: string) => void;
  onAddRelationship?: () => void;
  onPasteReply?: () => void;
  onImportInteractions?: () => void;
  id?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView = 'command-center',
  onNavigate,
  onAddRelationship,
  onPasteReply,
  onImportInteractions,
  id
}) => {
  const [collapsed, setCollapsed] = useState(false);

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
    {
      label: 'Add Relationship',
      icon: UserPlus,
      action: onAddRelationship,
      hint: 'Manually create a new relationship from scratch.'
    },
    {
      label: 'Paste Reply',
      icon: ClipboardPaste,
      action: onPasteReply,
      hint: 'Log one message — pick the contact, channel, date, and paste what was said.'
    },
    {
      label: 'Import Interactions',
      icon: Sparkles,
      action: onImportInteractions,
      hint: 'Paste a whole conversation history (email thread, LinkedIn chat, WhatsApp export). AI splits it into individual messages and logs them all at once.'
    },
    {
      label: 'Create Task',
      icon: CheckSquare,
      action: () => alert('Create Task shortcut clicked'),
      hint: 'Coming soon.'
    },
    {
      label: 'Import CSV',
      icon: FileSpreadsheet,
      action: () => alert('Import CSV shortcut clicked'),
      hint: 'Coming soon — bulk contact import from a spreadsheet.'
    }
  ];

  return (
    <div
      id={id || 'rios-sidebar'}
      className={`${collapsed ? 'w-[68px]' : 'w-[240px]'} h-screen bg-rios-sidebar border-r border-rios-border flex flex-col justify-between shrink-0 font-sans text-[#F4F4F5] transition-all duration-200 relative`}
    >
      {/* Collapse/expand toggle — same pattern as ChatGPT/Claude's sidebar */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 z-20 w-6 h-6 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {/* Brand Header */}
      <div className={`p-6 pb-4 flex flex-col gap-1 select-none ${collapsed ? 'items-center px-2' : ''}`}>
        <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rios-purple to-indigo-500 flex items-center justify-center shadow-[0_0_12px_rgba(124,58,237,0.4)] shrink-0">
            <div className="w-4 h-4 border-2 border-white rotate-45 transform" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-white leading-none">RIOS</span>
              <span className="text-[9px] text-rios-text-muted font-medium mt-0.5 tracking-wider uppercase">
                Relationship OS
              </span>
            </div>
          )}
        </div>
        {!collapsed && (
          <p className="text-[10px] text-rios-text-secondary leading-normal mt-2 pr-2">
            Relationship Intelligence Operating System
          </p>
        )}
      </div>

      {/* Main Navigation Scroll Area */}
      <div className={`flex-1 overflow-y-auto py-2 flex flex-col gap-6 ${collapsed ? 'px-2' : 'px-3'}`}>
        {/* Nav Items */}
        <div className="flex flex-col gap-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeView;

            return (
              <div key={item.id} className="relative group/tooltip">
                <button
                  onClick={() => onNavigate?.(item.id)}
                  className={`relative flex items-center gap-3 w-full px-3 py-2.5 rounded-[10px] text-xs font-medium transition-all duration-150 text-left select-none outline-none group ${
                    collapsed ? 'justify-center px-0' : ''
                  } ${isActive ? 'text-white font-semibold' : 'text-rios-text-secondary hover:text-white hover:bg-white/5'}`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeNavBackground"
                      className="absolute inset-0 bg-white/[0.04] border border-white/[0.08] rounded-[10px]"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    >
                      {!collapsed && <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-rios-purple" />}
                    </motion.div>
                  )}
                  <Icon
                    className={`w-4.5 h-4.5 transition-colors relative z-10 shrink-0 ${
                      isActive ? 'text-rios-purple' : 'text-rios-text-secondary group-hover:text-white'
                    }`}
                  />
                  {!collapsed && <span className="relative z-10">{item.label}</span>}
                </button>

                {collapsed && (
                  <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 w-max z-50 opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-150">
                    <div className="bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-200 shadow-xl">
                      {item.label}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Shortcuts Section */}
        <div className="flex flex-col gap-2">
          {!collapsed && (
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
          )}

          <div className="flex flex-col gap-0.5">
            {shortcuts.map((sc, i) => {
              const Icon = sc.icon;
              return (
                <div key={i} className="relative group/tooltip">
                  <button
                    onClick={sc.action}
                    className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[11px] text-rios-text-secondary hover:text-white hover:bg-white/5 transition-colors text-left ${
                      collapsed ? 'justify-center px-0' : ''
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 text-rios-text-muted shrink-0" />
                    {!collapsed && <span>{sc.label}</span>}
                  </button>

                  <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 w-56 z-50 opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-150">
                    <div className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-[10.5px] leading-snug text-zinc-300 shadow-xl">
                      {collapsed ? <span className="font-semibold text-white block mb-0.5">{sc.label}</span> : null}
                      {sc.hint}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Version Info */}
      <div className={`p-4 border-t border-rios-border bg-zinc-950/20 flex items-center select-none ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && <span className="text-[10px] font-mono text-rios-text-muted tracking-wider">RIOS v1.3.1</span>}
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="System Connected" />
      </div>
    </div>
  );
};
