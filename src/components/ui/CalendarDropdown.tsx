import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Clock, ArrowRight } from 'lucide-react';

export const CalendarDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const events = [
    {
      id: 1,
      time: '09:30 AM',
      title: 'Quotation Deadline',
      with: 'Ahmed El-Mansy'
    },
    {
      id: 2,
      time: '10:15 AM',
      title: 'Proposal Follow Up',
      with: 'Sarah Patel'
    },
    {
      id: 3,
      time: '11:00 AM',
      title: 'Product Demo Review',
      with: 'Ravi Menon'
    },
    {
      id: 4,
      time: '04:00 PM',
      title: 'Executive Sync',
      with: 'DMRC Directors'
    }
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Calendar trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-[10px] bg-zinc-900 border border-white/5 text-zinc-400 hover:text-white transition-all duration-150 hover:bg-zinc-800"
      >
        <Calendar className="w-5 h-5" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-72 bg-zinc-950 border border-white/10 rounded-[14px] shadow-[0_10px_25px_rgba(0,0,0,0.5)] z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-zinc-900/40">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Today's Timeline
              </span>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Tuesday, 14 July 2025</p>
            </div>

            {/* List of times */}
            <div className="p-2 flex flex-col gap-1 max-h-64 overflow-y-auto">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="p-2.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer flex justify-between items-center"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-zinc-200">{ev.title}</span>
                    <span className="text-[11px] text-zinc-500">with {ev.with}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-mono text-rios-text-secondary bg-zinc-900 px-2 py-1 rounded border border-white/5">
                    <Clock className="w-3 h-3 text-rios-purple" />
                    <span>{ev.time}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-white/5 text-center bg-zinc-900/50">
              <button className="text-[11px] text-rios-purple hover:underline flex items-center justify-center gap-1.5 w-full font-medium">
                <span>View Full Calendar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
