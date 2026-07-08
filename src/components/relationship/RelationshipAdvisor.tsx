import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Star,
  Flame,
  X,
  Plus,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Clock,
  Check,
  MoreHorizontal,
  Mail,
  Linkedin,
  MessageCircle,
  MessageSquare,
  Loader2,
  RefreshCw,
  Trash2,
  HelpCircle,
  AlertCircle
} from 'lucide-react';
import { WorkItem, RelationshipStage, CommunicationChannel } from '../../types/index.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { StageIndicator } from '../ui/StageIndicator.tsx';
import { Composer } from '../ui/Composer.tsx';
import { fetchRelationshipHistory, updateHistoryEntry, deleteHistoryEntry, RelationshipHistoryEntry } from '../../lib/domain/history';
import { getReplySuggestion } from '../../lib/domain/replyAssistant';
import { sendAndLogMessage } from '../../lib/domain/sendMessage';
import { logInteraction } from '../../lib/domain/interactions';
import { recordAiFeedback } from '../../lib/domain/aiFeedback';
import { dismissSuggestedStage } from '../../lib/domain/relationships';

interface RelationshipAdvisorProps {
  item: WorkItem | null;
  onClose: () => void;
  onComplete: (id: string) => void;
  onSnooze: (id: string) => void;
  onUpdateStage: (relationshipId: string, stage: RelationshipStage) => void;
  onRecomputed?: (relationshipId: string) => void;
  id?: string;
}

// One row in the History timeline. Truncated to ~3 lines by default with a
// per-entry expand/collapse chevron — not all-or-nothing, since one long
// pasted email shouldn't force every other entry to also stay expanded.
const CHANNEL_TO_DB: Record<CommunicationChannel, 'Email' | 'LinkedIn' | 'WhatsApp' | 'Phone'> = {
  email: 'Email',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  phone: 'Phone',
};


const HistoryEntryRow: React.FC<{
  entry: RelationshipHistoryEntry;
  contactFirstName: string;
  expandAll: boolean;
  onDeleted: (id: string) => void;
}> = ({ entry, contactFirstName, expandAll, onDeleted }) => {
  const [expanded, setExpanded] = useState(false);
  const [localDate, setLocalDate] = useState(entry.messageDate || '');
  const [localChannel, setLocalChannel] = useState(entry.channel || '');
  const [deleting, setDeleting] = useState(false);
  const text = entry.messageText || '';
  const isLong = text.length > 140 || text.split('\n').length > 3;

  React.useEffect(() => {
    setExpanded(expandAll);
  }, [expandAll]);

  async function handleDateChange(newDate: string) {
    setLocalDate(newDate);
    try {
      await updateHistoryEntry(entry.id, { messageDate: newDate || null });
    } catch (err) {
      console.error('Failed to update date:', err);
    }
  }

  async function handleChannelChange(newChannel: string) {
    setLocalChannel(newChannel);
    try {
      await updateHistoryEntry(entry.id, { channel: newChannel || null });
    } catch (err) {
      console.error('Failed to update channel:', err);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this history entry? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteHistoryEntry(entry.id);
      onDeleted(entry.id);
    } catch (err) {
      console.error('Failed to delete entry:', err);
      alert('Failed to delete this entry.');
      setDeleting(false);
    }
  }

  return (
    <div className="bg-zinc-900/40 border border-white/10 rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
            entry.direction === 'Sent' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'
          }`}
        >
          {entry.direction === 'Sent' ? 'You' : contactFirstName}
        </span>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={localDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="h-6 px-1 bg-zinc-800 border border-white/10 rounded text-[10px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-rios-purple/60 w-[112px]"
          />
          <select
            value={localChannel}
            onChange={(e) => handleChannelChange(e.target.value)}
            className="h-6 px-1 bg-zinc-800 border border-white/10 rounded text-[10px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-rios-purple/60"
          >
            <option value="">No channel</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="Email">Email</option>
            <option value="WhatsApp">WhatsApp</option>
            <option value="Phone">Phone</option>
          </select>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
            title="Delete this entry"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {text && (
        <>
          <p className={`text-[13px] text-zinc-100 leading-relaxed whitespace-pre-wrap ${!expanded ? 'line-clamp-3' : ''}`}>
            {text}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-0.5 text-[11px] font-semibold text-violet-300 hover:text-violet-200 hover:underline mt-1"
            >
              {expanded ? (
                <>
                  Show less <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  Show more <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export const RelationshipAdvisor: React.FC<RelationshipAdvisorProps> = ({
  item,
  onClose,
  onComplete,
  onSnooze,
  onUpdateStage,
  onRecomputed,
  id
}) => {
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [currentChannel, setCurrentChannel] = useState<CommunicationChannel | null>(null);
  const [history, setHistory] = useState<RelationshipHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [allHistoryExpanded, setAllHistoryExpanded] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const historyScrollRef = React.useRef<HTMLDivElement>(null);

  // Reply Assistant state — the real, knowledge-grounded replacement for
  // the old hardcoded canned-template "Generate Message" button.
  const [incomingMessage, setIncomingMessage] = useState('');
  const [userGuidance, setUserGuidance] = useState('');
  const [suggestedReply, setSuggestedReply] = useState('');
  const [replyReasoning, setReplyReasoning] = useState('');
  const [isGettingReply, setIsGettingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Resizable panel width — drag the left edge, same pattern as VS Code's
  // sidebar or an Excel column border.
  const [panelWidth, setPanelWidth] = useState(360);
  const isDraggingRef = React.useRef(false);

  React.useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!isDraggingRef.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setPanelWidth(Math.min(640, Math.max(300, newWidth)));
    }
    function handleMouseUp() {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  function startResize() {
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  // Sync internal state with props when relationship changes.
  // Deliberately keyed on the relationship's actual ID, NOT the whole
  // `item` object — refreshRelationshipFields (and other surgical
  // updates) create a new object reference for the SAME relationship on
  // every background correction, which previously caused this effect to
  // misfire and wipe an in-progress reply draft the user hadn't sent yet,
  // even though they never switched to a different person. Only a genuine
  // switch (a different relationship ID) should ever reset this state.
  React.useEffect(() => {
    if (item) {
      setLocalTags(item.relationship.tags);
      setCurrentChannel(item.channel);
      setIncomingMessage('');
      setUserGuidance('');
      setSuggestedReply('');
      setReplyReasoning('');
      setReplyError(null);
    }
  }, [item?.relationship.id]);

  // Refetches history whenever the item object changes — including when
  // the SAME relationship's underlying data changes (e.g. right after
  // logging a new interaction against it), not just when switching to a
  // different relationship. Costs an extra fetch on unrelated store
  // updates, but that's far cheaper than History silently going stale
  // immediately after you just logged something against it.
  React.useEffect(() => {
    if (!item) return;
    setHistory([]);
    setHistoryOffset(0);
    setHasMoreOlder(false);
    setHistoryLoading(true);
    fetchRelationshipHistory(item.relationship.id)
      .then((page) => {
        setHistory(page.entries);
        setHasMoreOlder(page.hasMore);
      })
      .catch((err) => console.error('Failed to load relationship history:', err))
      .finally(() => setHistoryLoading(false));
  }, [item]);

  // Auto-scroll to the bottom (most recent message) once a fresh load
  // completes — matches every real chat app's default, and puts the
  // latest message right next to the reply composer below it. Only fires
  // on a genuine reload (historyLoading flipping to false), not on every
  // render, so it doesn't fight the user's own scrolling afterward.
  React.useEffect(() => {
    if (!historyLoading && historyScrollRef.current) {
      historyScrollRef.current.scrollTop = historyScrollRef.current.scrollHeight;
    }
  }, [historyLoading]);

  async function handleLoadOlderHistory() {
    if (!historyScrollRef.current || loadingOlder) return;
    setLoadingOlder(true);
    const prevScrollHeight = historyScrollRef.current.scrollHeight;
    const prevScrollTop = historyScrollRef.current.scrollTop;
    try {
      const nextOffset = historyOffset + 50;
      const page = await fetchRelationshipHistory(rel.id, 50, nextOffset);
      setHistory((prev) => [...page.entries, ...prev]);
      setHistoryOffset(nextOffset);
      setHasMoreOlder(page.hasMore);
      // Preserve scroll position so loading older messages doesn't yank
      // the view — same pattern WhatsApp/Slack use when loading history upward.
      requestAnimationFrame(() => {
        if (historyScrollRef.current) {
          const newScrollHeight = historyScrollRef.current.scrollHeight;
          historyScrollRef.current.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop;
        }
      });
    } catch (err) {
      console.error('Failed to load older history:', err);
    } finally {
      setLoadingOlder(false);
    }
  }

  if (!item) {
    return (
      <div
        id={id || 'rios-advisor-empty'}
        style={{ width: panelWidth }}
        className="h-full bg-rios-sidebar border-l border-rios-border flex flex-col items-center justify-center p-8 text-center select-none font-sans shrink-0 relative"
      >
        <div
          onMouseDown={startResize}
          className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-rios-purple/40 transition-colors z-10"
        />
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

  async function handleGetReply() {
    if (incomingMessage.trim().length < 2) {
      setReplyError('Paste the message that needs a reply first.');
      return;
    }
    setIsGettingReply(true);
    setReplyError(null);
    const channelForDb = CHANNEL_TO_DB[currentChannel || 'linkedin'];
    try {
      // Log the incoming message FIRST — this happened regardless of
      // whether the AI successfully drafts a reply. Previously this was
      // only ever sent to the AI as ephemeral context and never actually
      // saved, so it silently never appeared in History.
      await logInteraction({
        relationshipId: rel.id,
        direction: 'Received',
        channel: channelForDb,
        messageDate: new Date().toISOString().slice(0, 10),
        messageText: incomingMessage,
        onRecomputed: () => {
          onRecomputed?.(rel.id);
          fetchRelationshipHistory(rel.id).then((page) => {
            setHistory(page.entries);
            setHasMoreOlder(page.hasMore);
          });
        },
      });
      const refreshed = await fetchRelationshipHistory(rel.id);
      setHistory(refreshed.entries);
      setHasMoreOlder(refreshed.hasMore);
      setHistoryOffset(0);

      const result = await getReplySuggestion(rel.id, incomingMessage, userGuidance);
      setSuggestedReply(result.reply);
      setReplyReasoning(result.reasoning);

      // Capture guidance as a feedback signal — right now it only steers
      // this one reply, but it's a real, explicit signal about how you
      // want things handled, worth keeping for whenever a "learned
      // preferences" system reads this table.
      if (userGuidance.trim()) {
        recordAiFeedback({
          relationshipId: rel.id,
          feedbackType: 'guidance_given',
          aiOutput: incomingMessage,
          userCorrection: userGuidance.trim(),
        });
      }
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to get a suggested reply');
    } finally {
      setIsGettingReply(false);
    }
  }

  async function handleSendMessage(text: string, channelOverride?: CommunicationChannel) {
    const channel = channelOverride || currentChannel;
    if (!channel) return;

    // If what's actually being sent differs from the AI's original
    // suggestion, that's a real correction worth capturing — this is the
    // actual data collection step for a future "learn from overrides"
    // system, not yet used to change any AI behavior.
    if (suggestedReply && text.trim() !== suggestedReply.trim()) {
      recordAiFeedback({
        relationshipId: rel.id,
        feedbackType: 'reply_edited',
        aiOutput: suggestedReply,
        userCorrection: text,
      });
    }

    try {
      const result = await sendAndLogMessage(rel.id, channel, text);
      if (result.opened) {
        const updated = await fetchRelationshipHistory(rel.id);
        setHistory(updated.entries);
        setHasMoreOlder(updated.hasMore);
        setHistoryOffset(0);
        setSuggestedReply('');
        setReplyReasoning('');
        setIncomingMessage('');
        setUserGuidance('');
      } else {
        alert(result.reason || 'Could not open this channel.');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send message');
    }
  }

  return (
    <div
      id={id || 'rios-advisor-panel'}
      style={{ width: panelWidth }}
      className="h-screen bg-rios-sidebar border-l border-rios-border flex flex-col justify-between shrink-0 font-sans text-white relative select-none"
    >
      <div
        onMouseDown={startResize}
        className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-rios-purple/40 transition-colors z-10"
      />
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
          {rel.status === 'Warm' && (
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-950/40 border border-amber-500/20 text-amber-400 text-[10px] font-bold">
              <span>Warm</span>
            </div>
          )}
          {rel.status === 'Cold' && (
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-950/40 border border-blue-500/20 text-blue-400 text-[10px] font-bold">
              <span>Cold</span>
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
          <p className="text-sm text-zinc-100 leading-relaxed font-normal bg-zinc-900/30 border border-white/[0.02] p-3 rounded-xl">
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

          {rel.suggestedStage && (
            <div className="p-3 rounded-xl bg-rios-purple/10 border border-rios-purple/25 flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-rios-purple shrink-0" />
                <span className="text-[11px] text-zinc-200">
                  AI suggests moving to <span className="font-bold text-white">{rel.suggestedStage}</span>
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    onUpdateStage(rel.id, rel.suggestedStage!);
                    await dismissSuggestedStage(rel.id);
                    recordAiFeedback({
                      relationshipId: rel.id,
                      feedbackType: 'stage_suggestion_accepted',
                      aiOutput: `Suggested stage advance: ${rel.suggestedStage}`,
                      userCorrection: 'Accepted — the AI\'s stage judgment was correct.',
                    });
                    onRecomputed?.(rel.id);
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-rios-purple text-white text-[11px] font-semibold hover:bg-rios-purple/90 transition-all"
                >
                  Accept
                </button>
                <button
                  onClick={async () => {
                    const dismissedStage = rel.suggestedStage;
                    await dismissSuggestedStage(rel.id);
                    recordAiFeedback({
                      relationshipId: rel.id,
                      feedbackType: 'stage_suggestion_dismissed',
                      aiOutput: `Suggested stage advance: ${dismissedStage}`,
                      userCorrection: 'Dismissed — the AI\'s stage judgment was wrong or premature.',
                    });
                    onRecomputed?.(rel.id);
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-zinc-800 border border-white/10 text-zinc-300 text-[11px] font-semibold hover:bg-zinc-700 transition-all"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
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
          <p className="text-sm text-white font-semibold leading-normal bg-zinc-900/50 p-3 rounded-xl border border-white/5">
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

        {/* HISTORY */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-rios-text-muted block">
              History
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setHistoryLoading(true);
                  fetchRelationshipHistory(rel.id)
                    .then((page) => {
                      setHistory(page.entries);
                      setHasMoreOlder(page.hasMore);
                      setHistoryOffset(0);
                    })
                    .catch((err) => console.error('Failed to refresh history:', err))
                    .finally(() => setHistoryLoading(false));
                }}
                className="text-zinc-500 hover:text-white transition-colors"
                title="Refresh history"
              >
                <RefreshCw className={`w-3 h-3 ${historyLoading ? 'animate-spin' : ''}`} />
              </button>
              {history.length > 0 && (
                <button
                  onClick={() => setAllHistoryExpanded(!allHistoryExpanded)}
                  className="flex items-center gap-0.5 text-[10px] font-semibold text-violet-300 hover:text-violet-200 transition-colors"
                  title={allHistoryExpanded ? 'Collapse all' : 'Expand all'}
                >
                  {allHistoryExpanded ? (
                    <>
                      Collapse all <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      Expand all <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
          {historyLoading ? (
            <div className="text-[11px] text-zinc-500">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-[11px] text-zinc-500">No interactions logged yet.</div>
          ) : (
            <div ref={historyScrollRef} className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {hasMoreOlder && (
                <button
                  onClick={handleLoadOlderHistory}
                  disabled={loadingOlder}
                  className="w-full text-center text-[10px] font-semibold text-violet-300 hover:text-violet-200 py-1.5 disabled:opacity-50"
                >
                  {loadingOlder ? 'Loading...' : 'View Older Messages'}
                </button>
              )}
              <div className="text-[9px] uppercase tracking-wider text-zinc-600 text-center pb-1">
                Older Communication
              </div>
              {history.map((entry) => (
                <HistoryEntryRow
                  key={entry.id}
                  entry={entry}
                  contactFirstName={rel.name.split(' ')[0]}
                  expandAll={allHistoryExpanded}
                  onDeleted={(id) => setHistory((prev) => prev.filter((h) => h.id !== id))}
                />
              ))}
              <div className="text-[9px] uppercase tracking-wider text-zinc-600 text-center pt-1">
                Recent Communication
              </div>
            </div>
          )}
        </div>

        {/* REPLY ASSISTANT */}
        <div className="pt-2 space-y-3">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-rios-text-muted block">
            Advisor
          </span>

          <AnimatePresence mode="wait">
            {suggestedReply ? (
              <motion.div
                key="suggestion"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                transition={{ duration: 0.2 }}
                className="space-y-2"
              >
                <div className="bg-rios-purple/5 border border-rios-purple/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3 h-3 text-rios-purple" />
                    <span className="text-[10px] font-semibold text-violet-300">Why this approach</span>
                  </div>
                  <p className="text-sm text-zinc-100 leading-relaxed">{replyReasoning}</p>
                </div>
                <Composer
                  initialValue={suggestedReply}
                  isGenerating={false}
                  defaultChannel={currentChannel || undefined}
                  onClose={() => {
                    setSuggestedReply('');
                    setReplyReasoning('');
                  }}
                  onSend={(text, channel) => handleSendMessage(text, channel)}
                />
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-2"
              >
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">Message they sent, that needs a reply</label>
                  <textarea
                    value={incomingMessage}
                    onChange={(e) => setIncomingMessage(e.target.value)}
                    rows={3}
                    placeholder="Paste what they said..."
                    className="w-full px-2.5 py-2 bg-zinc-900 border border-white/15 rounded-lg text-xs text-white placeholder-zinc-500 resize-y focus:outline-none focus:ring-2 focus:ring-rios-purple/60 focus:border-rios-purple/60 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">Your guidance (optional)</label>
                  <input
                    type="text"
                    value={userGuidance}
                    onChange={(e) => setUserGuidance(e.target.value)}
                    placeholder="e.g. keep it brief, don't discuss pricing yet..."
                    className="w-full h-8 px-2.5 bg-zinc-900 border border-white/15 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rios-purple/60 focus:border-rios-purple/60 transition-all"
                  />
                </div>

                {replyError && <div className="text-[11px] text-red-400">{replyError}</div>}

                <div className="flex gap-1">
                  <button
                    onClick={handleGetReply}
                    disabled={isGettingReply}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-rios-purple text-white hover:bg-opacity-90 transition-all duration-150 text-xs font-bold shadow-[0_4px_16px_rgba(124,58,237,0.3)] select-none shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {isGettingReply ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Get Suggested Reply</span>
                      </>
                    )}
                  </button>
                  <button
                    className="px-3 rounded-xl bg-zinc-900 border border-white/5 hover:bg-zinc-800 transition-all text-zinc-400 hover:text-white cursor-pointer"
                    onClick={() => alert('Coaching Conversation — a full multi-turn strategy discussion with your AI advisor. Coming next.')}
                    title="Start Coaching Conversation"
                  >
                    <MessageSquare className="w-4 h-4" />
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
