import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Sparkles, AlertCircle, Calendar, MessageSquare } from 'lucide-react';

export const NotificationMenu: React.FC = () => {
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

  const notifications = [
    {
      id: 1,
      type: 'critical',
      title: 'Quotation Promised',
      description: 'You committed to send Metro Line 6 quotation to Ahmed El-Mansy today.',
      time: '10 mins ago',
      icon: AlertCircle,
      color: 'text-rios-critical bg-red-950/30 border-red-500/20'
    },
    {
      id: 2,
      type: 'ai',
      title: 'AI Smart Observation',
      description: 'Sarah Patel liked your urban transit LinkedIn update. Highly contextual.',
      time: '1 hour ago',
      icon: Sparkles,
      color: 'text-rios-purple bg-purple-950/30 border-purple-500/20'
    },
    {
      id: 3,
      type: 'calendar',
      title: 'Meeting Scheduled',
      description: 'Review with Ravi Menon is scheduled for next Monday at 14:00 PM.',
      time: '2 hours ago',
      icon: Calendar,
      color: 'text-rios-commercial bg-amber-950/30 border-amber-500/20'
    }
  ];

  return (
    <div className="relative" ref={menuRef}>
      {/* Bell Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-[10px] bg-zinc-900 border border-white/5 text-zinc-400 hover:text-white transition-all duration-150 hover:bg-zinc-800"
      >
        <Bell className="w-5 h-5" />
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rios-critical border-2 border-rios-bg flex items-center justify-center text-[10px] font-bold text-white font-mono">
          3
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 bg-zinc-950 border border-white/10 rounded-[14px] shadow-[0_10px_25px_rgba(0,0,0,0.5)] z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Relationship Notifications
              </span>
              <button className="text-[10px] text-rios-purple hover:underline">
                Mark all read
              </button>
            </div>

            {/* List */}
            <div className="max-h-72 overflow-y-auto">
              {notifications.map((n) => {
                const Icon = n.icon;
                return (
                  <div
                    key={n.id}
                    className="p-4 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer flex gap-3"
                  >
                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${n.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-zinc-200">{n.title}</span>
                      <p className="text-[11px] text-zinc-400 leading-normal">{n.description}</p>
                      <span className="text-[9px] text-zinc-600 font-mono mt-1">{n.time}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-2 border-t border-white/5 text-center bg-zinc-900/50">
              <button className="text-xs text-zinc-400 hover:text-white transition-colors w-full py-1">
                View all activities
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
