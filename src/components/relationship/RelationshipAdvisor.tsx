import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Star,
  Flame,
  X,
  Plus,
  ChevronRight,
  Sparkles,
  Clock,
  Check,
  MoreHorizontal,
  Mail,
  Linkedin,
  MessageCircle,
  HelpCircle,
  AlertCircle
} from 'lucide-react';
import { WorkItem, RelationshipStage, CommunicationChannel } from '../../types/index.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { StageIndicator } from '../ui/StageIndicator.tsx';
import { Composer } from '../ui/Composer.tsx';

interface RelationshipAdvisorProps {
  item: WorkItem | null;
  onClose: () => void;
  onComplete: (id: string) => void;
  onSnooze: (id: string) => void;
  onUpdateStage: (relationshipId: string, stage: RelationshipStage) => void;
  onGenerateMessage: (id: string) => Promise<void>;
  isGeneratingMessage: boolean;
  generatedMessage: string;
  onClearGenerated: () => void;
  id?: string;
}

export const RelationshipAdvisor: React.FC<RelationshipAdvisorProps> = ({
  item,
  onClose,
  onComplete,
  onSnooze,
  onUpdateStage,
  onGenerateMessage,
  isGeneratingMessage,
  generatedMessage,
  onClearGenerated,
  id
}) => {
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [currentChannel, setCurrentChannel] = useState<CommunicationChannel | null>(null);

  // Sync internal state with props when relationship changes
  React.useEffect(() => {
    if (item) {
      setLocalTags(item.relationship.tags);
      setCurrentChannel(item.channel);
      onClearGenerated();
    }
  }, [item]);

  if (!item) {
    return (
      <div
        id={id || 'rios-advisor-empty'}
        className="w-[360px] h-full bg-rios-sidebar border-l border-rios-border flex flex-col items-center justify-center p-8 text-center select-none font-sans shrink-0"
      >
        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center text-rios-text-muted mb-4">
          <Sparkles className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-300">Select a Relationship</h3>
        <p className="text-xs text-rios-text-secondary mt-1 max-w-[200px] leading-relaxed">
          Click on any card in your active work queue to activate your Chief Advisor teammate.
        </p>
      </div>
    );
  }

  const rel = item.relationship;

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTag.trim() && !localTags.includes(newTag.trim())) {
      const updated = [...localTags, newTag.trim()];
      setLocalTags(updated);
      rel.tags = updated; // Sync back to model in-memory
      setNewTag('');
      setShowTagInput(false);
    }
  };

  const handleChangeChannel = () => {
    const channels: CommunicationChannel[] = ['email', 'whatsapp', 'linkedin', 'phone'];
    const currentIdx = channels.indexOf(currentChannel || 'email');
    const nextIdx = (currentIdx + 1) % channels.length;
    setCurrentChannel(channels[nextIdx]);
    item.channel = channels[nextIdx]; // Sync back
  };

  const getChannelLabel = () => {
    switch (currentChannel) {
      case 'email':
        return 'Email';
      case 'linkedin':
        return 'LinkedIn';
      case 'whatsapp':
        return 'WhatsApp';
      case 'phone':
        return 'Phone';
      default:
        return 'Email';
    }
  };

  return (
    <div
      id={id || 'rios-advisor-panel'}
      className="w-[360px] h-screen bg-rios-sidebar border-l border-rios-border flex flex-col justify-between shrink-0 font-sans text-white relative select-none"
    >
      {/* 1. Header (Static metadata + score) */}
      <div className="p-5 border-b border-rios-border flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="flex gap-3">
            <Avatar src={rel.avatar} name={rel.name} size="lg" status={rel.status} />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-white leading-none">{rel.name}</h2>
                {rel.starred && (
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                )}
              </div>
              <span className="text-[11px] text-rios-text-secondary mt-1 font-semibold leading-none">
                {rel.company}
              </span>
              <span className="text-[10px] text-rios-text-muted mt-1 leading-none">
                {rel.location}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Score & Fire Status Pill Row */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rios-text-muted">
            Relationship Score
          </span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-white/5">
            <span className="text-xs font-bold text-white font-mono">{rel.score}</span>
          </div>

          {rel.status === 'Hot' && (
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-950/40 border border-red-500/20 text-[#EF4444] text-[10px] font-bold">
              <Flame className="w-3 h-3 fill-red-500" />
              <span>Hot</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Scrollable Advisor Body Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* WHY TODAY? */}
        <div className="space-y-1.5">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-rios-text-muted block">
            Why Today?
          </span>
          <p className="text-xs text-zinc-300 leading-relaxed font-normal bg-zinc-900/30 border border-white/[0.02] p-3 rounded-xl">
            {rel.whyToday}
          </p>
        </div>

        {/* COMMERCIAL GOAL */}
        <div className="space-y-1.5">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-rios-text-muted block">
            Commercial Goal
          </span>
          <button className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-900 border border-white/5 hover:bg-zinc-800 hover:border-white/10 transition-all text-left text-xs font-semibold text-zinc-200">
            <span>{rel.commercialGoal}</span>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
          </button>
        </div>

        {/* RELATIONSHIP STAGE */}
        <div className="space-y-2">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-rios-text-muted block">
            Relationship Stage
          </span>
          <div className="p-3.5 rounded-xl bg-zinc-900/30 border border-white/[0.02] flex flex-col gap-2">
            <span className="text-xs font-bold text-zinc-200 leading-none">{rel.currentStage}</span>
            <StageIndicator
              currentStage={rel.currentStage}
              onChangeStage={(stage) => onUpdateStage(rel.id, stage)}
              interactive={true}
              className="mt-1"
            />
          </div>
        </div>

        {/* SUGGESTED CHANNEL */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-rios-text-muted block">
              Suggested Channel
            </span>
            <button
              onClick={handleChangeChannel}
              className="text-[10px] text-rios-purple hover:underline font-semibold"
            >
              Change Channel
            </button>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-white/5">
            {currentChannel === 'email' && <Mail className="w-3.5 h-3.5 text-zinc-400" />}
            {currentChannel === 'linkedin' && <Linkedin className="w-3.5 h-3.5 text-sky-400" />}
            {currentChannel === 'whatsapp' && <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />}
            <span className="text-xs font-semibold text-zinc-300">{getChannelLabel()}</span>
          </div>
        </div>

        {/* NEXT BEST ACTION */}
        <div className="space-y-1.5">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-rios-text-muted block">
            Next Best Action
          </span>
          <p className="text-xs text-zinc-200 font-semibold leading-normal bg-zinc-900/50 p-3 rounded-xl border border-white/5">
            {rel.nextBestAction}
          </p>
        </div>

        {/* AI CONFIDENCE */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-rios-text-muted block">
              AI Confidence
            </span>
            <span className="text-xs font-bold font-mono text-emerald-400">{rel.aiConfidence}%</span>
          </div>
          <div className="space-y-1">
            <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-white/[0.03]">
              <motion.div
                className="h-full bg-gradient-to-r from-rios-purple to-emerald-400"
                initial={{ width: 0 }}
                animate={{ width: `${rel.aiConfidence}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <span className="text-[9px] text-rios-text-muted font-medium">Verified by model guidelines.</span>
          </div>
        </div>

        {/* TAGS */}
        <div className="space-y-2">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-rios-text-muted block">
            Tags
          </span>
          <div className="flex flex-wrap gap-1.5">
            {localTags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-zinc-900 border border-white/5 text-zinc-400 hover:text-white hover:border-white/10 cursor-default transition-all"
              >
                {tag}
              </span>
            ))}

            {showTagInput ? (
              <form onSubmit={handleAddTag} className="inline-flex shrink-0">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="New tag..."
                  className="bg-zinc-900 border border-rios-purple/40 rounded-md text-[10px] font-mono px-2 py-0.5 text-white max-w-[80px] focus:outline-none"
                  autoFocus
                  onBlur={() => setShowTagInput(false)}
                />
              </form>
            ) : (
              <button
                onClick={() => setShowTagInput(true)}
                className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-md bg-zinc-950 border border-dashed border-white/10 text-zinc-500 hover:text-white hover:border-white/20 transition-all cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Tag</span>
              </button>
            )}
          </div>
        </div>

        {/* AI Generator Draft Section */}
        <div className="pt-2">
          <AnimatePresence mode="wait">
            {generatedMessage ? (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                transition={{ duration: 0.2 }}
              >
                <Composer
                  initialValue={generatedMessage}
                  isGenerating={isGeneratingMessage}
                  onClose={onClearGenerated}
                  onSend={(text) => alert(`Message Sent:\n\n${text}`)}
                />
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
              >
                <div className="flex gap-1">
                  <button
                    onClick={() => onGenerateMessage(item.id)}
                    disabled={isGeneratingMessage}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-rios-purple text-white hover:bg-opacity-90 transition-all duration-150 text-xs font-bold shadow-[0_4px_16px_rgba(124,58,237,0.3)] select-none shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Message</span>
                  </button>
                  <button
                    className="px-3 rounded-xl bg-zinc-900 border border-white/5 hover:bg-zinc-800 transition-all text-zinc-400 hover:text-white cursor-pointer"
                    onClick={() => alert('Additional templates available.')}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 3. Footer Action Controls Row (Mark Complete, Snooze, More) */}
      <div className="p-4 border-t border-rios-border bg-zinc-950/40 flex items-center gap-2 select-none shrink-0">
        <button
          onClick={() => onComplete(item.id)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-white/5 hover:border-white/10 hover:bg-zinc-900 transition-all text-xs font-semibold text-zinc-200 cursor-pointer"
        >
          <Check className="w-4 h-4 text-emerald-400" />
          <span>Mark Complete</span>
        </button>

        <button
          onClick={() => onSnooze(item.id)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-white/5 hover:border-white/10 hover:bg-zinc-900 transition-all text-xs font-semibold text-zinc-200 cursor-pointer"
        >
          <Clock className="w-4 h-4 text-zinc-400" />
          <span>Snooze</span>
        </button>

        <button
          className="p-2.5 rounded-lg border border-white/5 hover:border-white/10 hover:bg-zinc-900 transition-all text-zinc-500 hover:text-white cursor-pointer"
          onClick={() => alert('Extended options: Log custom call, Reassign lead, Delete')}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
