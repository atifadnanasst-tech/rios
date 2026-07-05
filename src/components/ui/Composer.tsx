import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, Check, Sparkles, Send, ArrowRight, RefreshCw, X } from 'lucide-react';

interface ComposerProps {
  initialValue: string;
  isGenerating: boolean;
  onSave?: (text: string) => void;
  onClose?: () => void;
  onSend?: (text: string) => void;
  id?: string;
}

export const Composer: React.FC<ComposerProps> = ({
  initialValue,
  isGenerating,
  onSave,
  onClose,
  onSend,
  id
}) => {
  const [text, setText] = useState(initialValue);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setText(initialValue);
  }, [initialValue]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <div
      id={id || ' Rios-composer'}
      className="bg-zinc-950/90 border border-white/10 rounded-[14px] p-4 flex flex-col gap-3 font-sans relative overflow-hidden"
    >
      {/* Dynamic Background Sparkle Effect for AI Workspace */}
      <div className="absolute inset-0 bg-gradient-to-br from-rios-purple/5 to-transparent pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between z-10">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-rios-purple animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-rios-text-primary">
            AI Generated Draft
          </span>
        </div>
        
        {onClose && (
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-full hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Text Area or Loader */}
      <div className="relative min-h-[140px] z-10">
        <AnimatePresence mode="wait">
          {isGenerating ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 py-6"
            >
              <div className="relative flex items-center justify-center">
                <motion.div
                  className="w-10 h-10 rounded-full border border-dashed border-rios-purple"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                />
                <Sparkles className="w-4 h-4 text-rios-purple absolute" />
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xs text-zinc-300 font-medium">Chief Advisor Thinking</span>
                <span className="text-[10px] text-zinc-500 mt-1">Evaluating relationship history...</span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  onSave?.(e.target.value);
                }}
                className="w-full h-full min-h-[140px] bg-zinc-900/50 border border-white/5 rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-rios-purple/40 resize-none font-sans"
                placeholder="Drafting message..."
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Composer Action Handles */}
      {!isGenerating && text && (
        <div className="flex items-center justify-between pt-2 border-t border-white/5 z-10">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-zinc-900 border border-white/5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all duration-150"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Draft</span>
              </>
            )}
          </button>

          <button
            onClick={() => onSend?.(text)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] bg-rios-purple text-white hover:bg-opacity-90 text-xs font-semibold transition-all duration-150 shadow-[0_2px_8px_rgba(124,58,237,0.3)]"
          >
            <span>Send Message</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
