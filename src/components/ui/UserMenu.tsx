import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Settings, LogOut, ChevronDown, Check } from 'lucide-react';
import { Avatar } from './Avatar.tsx';

export const UserMenu: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const user = {
    name: 'Atif A.',
    role: 'Owner',
    email: 'atif.a@orascom.com',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80'
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Pill */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full bg-zinc-900 border border-white/5 hover:bg-zinc-800 transition-all duration-150 text-left select-none"
      >
        <Avatar src={user.avatar} name={user.name} size="sm" />
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-zinc-100 leading-none">{user.name}</span>
          <span className="text-[10px] text-zinc-500 font-medium leading-none mt-0.5">{user.role}</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-56 bg-zinc-950 border border-white/10 rounded-[14px] shadow-[0_10px_25px_rgba(0,0,0,0.5)] z-50 overflow-hidden"
          >
            {/* User Meta */}
            <div className="p-4 border-b border-white/5 bg-zinc-900/20">
              <span className="text-xs font-semibold text-zinc-200 block">{user.name}</span>
              <span className="text-[10px] text-zinc-500 block truncate mt-0.5">{user.email}</span>
            </div>

            {/* Actions */}
            <div className="p-1">
              <button className="flex items-center gap-2 w-full px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left font-medium">
                <Shield className="w-4 h-4 text-rios-purple" />
                <span>Relationship Guard On</span>
                <Check className="w-3.5 h-3.5 ml-auto text-emerald-400" />
              </button>
              
              <button className="flex items-center gap-2 w-full px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left font-medium">
                <Settings className="w-4 h-4 text-zinc-500" />
                <span>Account Settings</span>
              </button>
            </div>

            {/* Logout */}
            <div className="p-1 border-t border-white/5">
              <button className="flex items-center gap-2 w-full px-3 py-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors text-left font-medium">
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
