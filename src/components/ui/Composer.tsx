import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, Check, Sparkles, Send, ChevronUp, X, Mail, Linkedin, MessageCircle, Phone } from 'lucide-react';

export type ComposerChannel = 'email' | 'linkedin' | 'whatsapp' | 'phone';

const CHANNEL_META: Record<ComposerChannel, { label: string; icon: React.ElementType }> = {
  email: { label: 'Email', icon: Mail },
  linkedin: { label: 'LinkedIn', icon: Linkedin },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  phone: { label: 'Phone', icon: Phone },
};

interface ComposerProps {
  initialValue: string;
  isGenerating: boolean;
  onSave?: (text: string) => void;
  onClose?: () => void;
  // Channel-aware send — only shown as a split-button-with-dropdown when
  // `defaultChannel` is provided. Falls back to a plain Send button
  // otherwise, so existing/future non-channel usages of Composer are unaffected.
  onSend?: (text: string, channel?: ComposerChannel) => void;
  defaultChannel?: ComposerChannel;
  id?: string;
}

export const Composer: React.FC<ComposerProps> = ({
  initialValue,
  isGenerating,
  onSave,
  onClose,
  onSend,
  defaultChannel,
  id
}) => {
  const [text, setText] = useState(initialValue);
  const [copied, setCopied] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ComposerChannel | undefined>(defaultChannel);
  const [showChannelMenu, setShowChannelMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(initialValue);
  }, [initialValue]);

  // Keep in sync if the underlying default channel changes (e.g. switching
  // to a relationship whose conversation is on a different channel).
  useEffect(() => {
    setSelectedChannel(defaultChannel);
  }, [defaultChannel]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowChannelMenu(false);
      }
    }
    if (showChannelMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showChannelMenu]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const isChannelAware = !!defaultChannel;
  const ActiveIcon = selectedChannel ? CHANNEL_META[selectedChannel].icon : Send;

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

          {isChannelAware ? (
            <div ref={menuRef} className="relative flex">
              {/* Channel options menu — opens upward since this sits near the bottom of the panel */}
              <AnimatePresence>
                {showChannelMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.12 }}
                    className="absolute bottom-full right-0 mb-1.5 w-40 bg-zinc-900 border border-white/15 rounded-lg overflow-hidden shadow-xl z-20"
                  >
                    {(Object.keys(CHANNEL_META) as ComposerChannel[]).map((ch) => {
                      const Meta = CHANNEL_META[ch];
                      const Icon = Meta.icon;
                      return (
                        <button
                          key={ch}
                          onClick={() => {
                            setSelectedChannel(ch);
                            setShowChannelMenu(false);
                            onSend?.(text, ch);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-zinc-800 transition-colors ${
                            selectedChannel === ch ? 'text-white bg-zinc-800/60' : 'text-zinc-300'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>Send {Meta.label}</span>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={() => onSend?.(text, selectedChannel)}
                className="flex items-center gap-1.5 pl-3.5 pr-2.5 py-1.5 rounded-l-[8px] bg-rios-purple text-white hover:bg-opacity-90 text-xs font-semibold transition-all duration-150 shadow-[0_2px_8px_rgba(124,58,237,0.3)]"
              >
                <ActiveIcon className="w-3.5 h-3.5" />
                <span>Send {selectedChannel ? CHANNEL_META[selectedChannel].label : 'Message'}</span>
              </button>
              <button
                onClick={() => setShowChannelMenu((v) => !v)}
                className="flex items-center px-2 py-1.5 rounded-r-[8px] bg-rios-purple text-white hover:bg-opacity-90 border-l border-white/20 transition-all duration-150 shadow-[0_2px_8px_rgba(124,58,237,0.3)]"
                title="Choose a different channel"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onSend?.(text)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] bg-rios-purple text-white hover:bg-opacity-90 text-xs font-semibold transition-all duration-150 shadow-[0_2px_8px_rgba(124,58,237,0.3)]"
            >
              <span>Send Message</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
