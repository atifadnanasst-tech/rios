import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  SlidersHorizontal,
  ChevronDown,
  Sparkles,
  Plus,
  Users,
  CheckSquare,
  Globe,
  ChevronLeft,
  ChevronRight,
  Inbox,
  AlertTriangle,
  Info,
  Calendar,
  X,
  Clock
} from 'lucide-react';
import { useStore, getFilteredWorkItems } from './store/useStore.ts';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { Header } from './components/layout/Header.tsx';
import { KPICard } from './components/dashboard/KPICard.tsx';
import { QueueTabs } from './components/dashboard/QueueTabs.tsx';
import { CategoryPill } from './components/dashboard/CategoryPill.tsx';
import { RelationshipMissionCard } from './components/relationship/RelationshipMissionCard.tsx';
import { RelationshipAdvisor } from './components/relationship/RelationshipAdvisor.tsx';
import { BulkToolbar } from './components/relationship/BulkToolbar.tsx';
import { LogInteractionModal } from './components/modals/LogInteractionModal.tsx';
import { ImportInteractionsModal } from './components/modals/ImportInteractionsModal.tsx';
import { LinkedinEnrichmentModal } from './components/modals/LinkedinEnrichmentModal.tsx';
import { Relationship, RelationshipCategory, RelationshipStage, PriorityLevel, CommunicationChannel } from './types/index.ts';

// Converts the frontend's lowercase channel format ('email') to the
// database's capitalized format ('Email') — a mismatch here previously
// caused the channel dropdown to silently hold an invalid value that got
// rejected on save, even though it visually looked correct.
function mapFrontendChannelToDb(channel: string | null): 'LinkedIn' | 'Email' | 'WhatsApp' | 'Phone' | null {
  switch (channel) {
    case 'email':
      return 'Email';
    case 'linkedin':
      return 'LinkedIn';
    case 'whatsapp':
      return 'WhatsApp';
    case 'phone':
      return 'Phone';
    default:
      return null;
  }
}

export default function App() {
  const store = useStore();
  const [activeView, setActiveView] = useState('command-center');
  
  // Modals / Overlays
  const [showBriefing, setShowBriefing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPasteReply, setShowPasteReply] = useState(false);
  const [showImportInteractions, setShowImportInteractions] = useState(false);
  const [showEnrichment, setShowEnrichment] = useState(false);

  // New relationship form fields
  const [newRelName, setNewRelName] = useState('');
  const [newRelCompany, setNewRelCompany] = useState('');
  const [newRelLocation, setNewRelLocation] = useState('');
  const [newRelCategory, setNewRelCategory] = useState<RelationshipCategory>('building');
  const [newRelStage, setNewRelStage] = useState<RelationshipStage>('Discovered');
  const [newRelPriority, setNewRelPriority] = useState<PriorityLevel>('Medium');
  const [newRelChannel, setNewRelChannel] = useState<CommunicationChannel>('email');

  // Filter lists using the Zustand store selectors
  const filteredWorkItems = getFilteredWorkItems(store);
  const selectedWorkItem = store.workItems.find(item => item.id === store.selectedWorkItemId) || null;

  // Pagination — the page controls used to be static decoration (hardcoded
  // "1 2 3 ... 9" text with no click handlers) while the full list rendered
  // unsliced underneath regardless of what was "selected." This makes it real.
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showPerPageMenu, setShowPerPageMenu] = useState(false);

  const totalPages = Math.max(1, Math.ceil(filteredWorkItems.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = filteredWorkItems.length === 0 ? 0 : (safePage - 1) * itemsPerPage + 1;
  const pageEnd = Math.min(safePage * itemsPerPage, filteredWorkItems.length);
  const paginatedWorkItems = filteredWorkItems.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  // Reset to page 1 whenever the underlying filter/search/tab changes —
  // otherwise you could land on a stale page number that's now empty or
  // out of range for a newly-narrowed result set.
  useEffect(() => {
    setCurrentPage(1);
  }, [store.activeQueueTab, store.activeCategoryFilter, store.searchQuery]);

  // If exactly one relationship is currently active in the Advisor panel,
  // both hotkeys and the sidebar shortcuts skip straight past search and
  // pre-fill it — re-searching someone you're already looking at is pure friction.
  const activeContactForModals = selectedWorkItem ? {
    id: selectedWorkItem.relationship.id,
    name: selectedWorkItem.relationship.name,
    company: selectedWorkItem.relationship.company,
    position: null,
    lastChannel: mapFrontendChannelToDb(selectedWorkItem.relationship.suggestedChannel),
  } : undefined;

  // Global hotkeys: I = Import Interactions, R = Paste Reply.
  // Disabled while typing in any input/textarea/select so normal typing
  // (including inside these same modals) is never hijacked.
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      const active = document.activeElement as HTMLInputElement | null;
      const tag = (active?.tagName || '').toLowerCase();
      // A focused checkbox/radio doesn't mean the user is typing — only
      // block hotkeys for genuine text-entry elements. Discovered via a
      // real bug: clicking a card's bulk-select checkbox left it focused,
      // which incorrectly blocked I/R afterward.
      const nonTextInputTypes = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range'];
      const isTextEntry =
        tag === 'textarea' ||
        tag === 'select' ||
        active?.isContentEditable ||
        (tag === 'input' && !nonTextInputTypes.includes(active?.type || 'text'));
      if (isTextEntry || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setShowImportInteractions(true);
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setShowPasteReply(true);
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setShowEnrichment(true);
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Counts of each category
  const getCategoryCount = (cat: RelationshipCategory) => {
    // Return mock-realistic numbers matching the screenshot if no modifications are made
    const baseCounts = {
      critical: 12,
      commitment: 5,
      commercial: 7,
      building: 31,
      nurture: 42
    };
    
    // Supplement with any real dynamic calculations for added elements
    const activeAdded = store.workItems.filter(item => !item.completed && item.category === cat).length;
    const initialBase = baseCounts[cat];
    // Return relative count
    return activeAdded > 0 ? initialBase + (activeAdded - 7) : initialBase;
  };

  // Select all checkbox handler
  const isAllChecked = filteredWorkItems.length > 0 && filteredWorkItems.every(item => store.selectedWorkItemIds.includes(item.id));
  const handleSelectAllChange = () => {
    store.selectAllWorkItems(!isAllChecked);
  };

  // New relationship creator submission
  const handleCreateRelationship = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRelName || !newRelCompany) return;

    const relId = `rel-${Date.now()}`;
    const workId = `work-${Date.now()}`;

    const newRelationship: Relationship = {
      id: relId,
      name: newRelName,
      avatar: '', // Fallback initials
      company: newRelCompany,
      position: '', // no dedicated input field in this form yet
      suggestedStage: null, // no AI suggestion exists yet for a brand-new manual entry
      location: newRelLocation || 'Remote',
      starred: false,
      score: 60,
      status: 'Stable',
      commercialGoal: 'Introduction Alignment',
      currentStage: newRelStage,
      suggestedChannel: newRelChannel,
      nextBestAction: `Reach out via ${newRelChannel} and introduce product capabilities.`,
      aiConfidence: 80,
      tags: ['New Account'],
      whyToday: `${newRelName} was recently added to RIOS. Perfect timing to establish a professional line of communication.`
    };

    const newWorkItem = {
      id: workId,
      relationshipId: relId,
      relationship: newRelationship,
      category: newRelCategory,
      description: `Initiate communication on ${newRelCategory} objective`,
      priority: newRelPriority,
      dueTime: '04:30 PM',
      channel: newRelChannel,
      completed: false,
      starred: false
    };

    store.addRelationship(newRelationship);
    store.addWorkItem(newWorkItem);

    // Reset fields
    setNewRelName('');
    setNewRelCompany('');
    setNewRelLocation('');
    setShowAddModal(false);
  };

  if (store.isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-rios-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-rios-purple/30 border-t-rios-purple rounded-full animate-spin" />
          <span className="text-xs text-zinc-500 font-medium">Loading your relationships...</span>
        </div>
      </div>
    );
  }

  if (store.loadError) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-rios-bg">
        <div className="flex flex-col items-center gap-2 text-center max-w-sm px-4">
          <span className="text-sm text-red-400 font-semibold">Failed to load data</span>
          <span className="text-xs text-zinc-500">{store.loadError}</span>
        </div>
      </div>
    );
  }

  return (
    <div id="rios-app-container" className="flex h-screen bg-rios-bg font-sans overflow-hidden select-none">
      
      {/* COLUMN 1: LEFT SIDEBAR NAVIGATION */}
      <Sidebar
        activeView={activeView}
        onNavigate={(view) => {
          if (view === 'command-center') {
            setActiveView(view);
          } else {
            // Placeholder routes as requested in the goal guidelines
            alert(`"${view.charAt(0).toUpperCase() + view.slice(1)}" is set as a navigation placeholder in this Command Center build.`);
          }
        }}
        onAddRelationship={() => setShowAddModal(true)}
        onPasteReply={() => setShowPasteReply(true)}
        onImportInteractions={() => setShowImportInteractions(true)}
        onEnrichContact={() => setShowEnrichment(true)}
      />

      {/* MAIN LAYOUT WRAPPER (COLUMN 2 & COLUMN 3 CONTAINER) */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* UPPER HEADER */}
        <Header onShowAIBriefing={() => setShowBriefing(true)} />

        {/* BOTTOM WORKSPACE */}
        <div className="flex-1 flex min-w-0 overflow-hidden">
          
          {/* COLUMN 2: CENTER WORK QUEUE CONTENT */}
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto px-6 py-6 space-y-6">
            
            {/* KPI STATS ROW */}
            <div className="flex gap-4 select-none">
              <KPICard
                title="Today's Mission"
                value="87"
                subtext="Work Items"
                icon={CheckSquare}
              />
              <KPICard
                title="Est. Time"
                value="2h 15m"
                subtext="Focus Time"
                icon={Clock}
              />
              <KPICard
                title="Advance"
                value="23"
                subtext="Relationships"
                icon={Users}
              />
              <KPICard
                title="Reply Rate"
                value="42%"
                subtext="Last 7 Days"
                icon={Globe}
              />
            </div>

            {/* QUEUE NAVIGATION & TABS */}
            <QueueTabs
              activeTab={store.activeQueueTab}
              onChangeTab={(tab) => store.setQueueTab(tab)}
            />

            {/* SEMANTIC CATEGORY FILTER PILLES ROW */}
            <div className="grid grid-cols-5 gap-3">
              <CategoryPill
                category="critical"
                label="Critical"
                count={getCategoryCount('critical')}
                isActive={store.activeCategoryFilter === 'critical'}
                onClick={() => store.setCategoryFilter('critical')}
              />
              <CategoryPill
                category="commitment"
                label="Commitments"
                count={getCategoryCount('commitment')}
                isActive={store.activeCategoryFilter === 'commitment'}
                onClick={() => store.setCategoryFilter('commitment')}
              />
              <CategoryPill
                category="commercial"
                label="Commercial"
                count={getCategoryCount('commercial')}
                isActive={store.activeCategoryFilter === 'commercial'}
                onClick={() => store.setCategoryFilter('commercial')}
              />
              <CategoryPill
                category="building"
                label="Relationship Building"
                count={getCategoryCount('building')}
                isActive={store.activeCategoryFilter === 'building'}
                onClick={() => store.setCategoryFilter('building')}
              />
              <CategoryPill
                category="nurture"
                label="Nurture"
                count={getCategoryCount('nurture')}
                isActive={store.activeCategoryFilter === 'nurture'}
                onClick={() => store.setCategoryFilter('nurture')}
              />
            </div>

            {/* QUEUE CONTROLS HEADER BAR */}
            <div className="flex items-center justify-between py-2 border-b border-white/[0.03] select-none">
              {/* Sort selector */}
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
                <span>Sort: Priority & Next Action</span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
              </button>

              {/* Check All Actions Bar */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-400 hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={isAllChecked}
                    onChange={handleSelectAllChange}
                    className="rounded border-white/10 text-rios-purple bg-zinc-950/40 focus:ring-0 focus:outline-none focus:ring-offset-0"
                  />
                  <span>Select All</span>
                </label>

                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                  onClick={() => store.selectedWorkItemIds.length > 0 ? alert('Open bulk action details') : alert('Please select cards first.')}
                >
                  <Inbox className="w-3.5 h-3.5" />
                  <span>Bulk Actions</span>
                </button>

                <button className="p-2 rounded-lg bg-zinc-900 border border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* ACTIVE LIST OF MISSION CARDS */}
            <div className="flex flex-col gap-3 relative">
              <AnimatePresence initial={false} mode="popLayout">
                {paginatedWorkItems.length > 0 ? (
                  paginatedWorkItems.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.18 }}
                    >
                      <RelationshipMissionCard
                        item={item}
                        isSelected={store.selectedWorkItemId === item.id}
                        isChecked={store.selectedWorkItemIds.includes(item.id)}
                        onSelect={() => store.selectWorkItem(item.id)}
                        onToggleCheck={(e) => {
                          e.stopPropagation();
                          store.toggleSelectWorkItemForBulk(item.id);
                        }}
                        onChangeStage={(stage) => store.updateStage(item.relationshipId, stage)}
                        onToggleStar={() => store.toggleStarred(item.relationshipId)}
                        onQuickSent={() => store.initialize()}
                      />
                    </motion.div>
                  ))
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center py-20 text-center select-none min-h-[300px]">
                    <Inbox className="w-10 h-10 text-zinc-700 mb-3" />
                    <span className="text-sm font-semibold text-zinc-400">No active work items</span>
                    <p className="text-xs text-zinc-500 max-w-xs mt-1 leading-normal">
                      Try clearing filters, selecting another queue tab, or adding a new client.
                    </p>
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* QUEUE PAGINATION TABLE FOOTER */}
            <div className="flex items-center justify-between pt-4 pb-8 select-none border-t border-white/[0.03]">
              <span className="text-[11px] font-mono text-rios-text-muted">
                Showing {pageStart} to {pageEnd} of {filteredWorkItems.length} work items
              </span>

              <div className="flex items-center gap-4">
                {/* Numeric Pagination Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="p-1.5 rounded-md hover:bg-white/5 text-zinc-500 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {(() => {
                    // Show all page numbers if few enough; otherwise show
                    // first, last, current ± 1, with ellipsis for gaps —
                    // same pattern as the original static "1 2 3 ... 9" mockup,
                    // just computed from the real page count now.
                    const pages: (number | 'ellipsis')[] = [];
                    if (totalPages <= 7) {
                      for (let i = 1; i <= totalPages; i++) pages.push(i);
                    } else {
                      pages.push(1);
                      if (safePage > 3) pages.push('ellipsis');
                      for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) {
                        pages.push(i);
                      }
                      if (safePage < totalPages - 2) pages.push('ellipsis');
                      pages.push(totalPages);
                    }
                    return pages.map((p, i) =>
                      p === 'ellipsis' ? (
                        <span key={`ellipsis-${i}`} className="text-zinc-600 text-xs px-1">
                          ...
                        </span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={`w-7 h-7 rounded-md text-xs font-semibold flex items-center justify-center transition-all ${
                            p === safePage
                              ? 'bg-rios-purple text-white font-bold'
                              : 'hover:bg-white/5 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    );
                  })()}

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="p-1.5 rounded-md hover:bg-white/5 text-zinc-500 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Per page Select Option */}
                <div className="relative">
                  <button
                    onClick={() => setShowPerPageMenu((v) => !v)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/5 text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    <span>{itemsPerPage} / page</span>
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                  </button>
                  {showPerPageMenu && (
                    <div className="absolute bottom-full right-0 mb-1 w-24 bg-zinc-900 border border-white/15 rounded-lg overflow-hidden shadow-xl z-10">
                      {[10, 25, 50].map((n) => (
                        <button
                          key={n}
                          onClick={() => {
                            setItemsPerPage(n);
                            setCurrentPage(1);
                            setShowPerPageMenu(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 transition-colors ${
                            n === itemsPerPage ? 'text-white bg-zinc-800/60' : 'text-zinc-400'
                          }`}
                        >
                          {n} / page
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 3: RIGHT RELATIONSHIP ADVISOR PANEL */}
          <RelationshipAdvisor
            item={selectedWorkItem}
            onClose={() => store.selectWorkItem(null)}
            onComplete={(id) => {
              store.completeWorkItem(id);
              // Auto-select next available item if list is populated
              const remaining = filteredWorkItems.filter(item => item.id !== id);
              if (remaining.length > 0) {
                store.selectWorkItem(remaining[0].id);
              } else {
                store.selectWorkItem(null);
              }
            }}
            onSnooze={(id) => {
              store.snoozeWorkItem(id);
              alert('Work item scheduled action snoozed for 2 hours.');
            }}
            onUpdateStage={(relId, stage) => store.updateStage(relId, stage)}
            onRecomputed={(relId) => store.refreshRelationshipFields(relId)}
            onOpenContact={async (contactId) => {
              const { findOrCreateRelationshipForContact: createRel } = await import('./lib/domain/relationships');
              const relId = await createRel(contactId);
              if (relId) await store.openRelationshipById(relId);
            }}
          />
        </div>
      </div>

      {/* FLOATING ACTION BULK TOOLBAR POPUP */}
      <BulkToolbar
        selectedCount={store.selectedWorkItemIds.length}
        onGenerate={() => {
          alert(`Triggering automated AI Message drafting for ${store.selectedWorkItemIds.length} relationships.`);
          store.clearBulkSelection();
        }}
        onSnooze={() => {
          store.bulkSnooze();
          alert('Selected items snoozed until tomorrow morning.');
        }}
        onComplete={() => {
          store.bulkComplete();
          alert('Bulk completed selected work items successfully!');
        }}
        onChangeStage={(stage) => {
          store.bulkChangeStage(stage);
          alert(`Successfully transitioned all selected client cards to "${stage}" stage.`);
        }}
        onClear={() => store.clearBulkSelection()}
      />

      {/* MODAL OVERLAY 1: AI BRIEFING PANEL */}
      <AnimatePresence>
        {showBriefing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBriefing(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-xl bg-zinc-950 border border-white/10 rounded-2xl p-6 shadow-2xl z-10 text-zinc-100 font-sans"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-rios-purple" />
                  <h3 className="text-base font-bold">Your Relationship Briefing</h3>
                </div>
                <button
                  onClick={() => setShowBriefing(false)}
                  className="p-1 rounded-full text-zinc-500 hover:text-white transition-colors hover:bg-white/5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Briefing Text Content */}
              <div className="py-6 space-y-4 max-h-[400px] overflow-y-auto pr-2">
                <div className="p-3.5 bg-rios-purple-glow bg-rios-purple/5 border border-rios-purple/10 rounded-xl flex gap-3">
                  <Info className="w-5 h-5 text-[#A78BFA] shrink-0 mt-0.5" />
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    <strong className="text-white">General Alignment Summary:</strong> Today you have <strong className="text-white">12 Critical items</strong> and <strong className="text-white">5 Active Commitments</strong>. Focus on sending the Metro project quotation to Ahmed El-Mansy first.
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rios-text-muted">Today's Priorities</h4>
                  
                  <div className="p-3 bg-zinc-900 border border-white/5 rounded-xl flex justify-between items-center">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold">Ahmed El-Mansy</span>
                      <span className="text-[11px] text-rios-text-secondary">Quotation promised yesterday. Highly active.</span>
                    </div>
                    <span className="text-[10px] font-mono bg-red-950/40 text-rios-critical px-2 py-0.5 rounded border border-red-500/10">09:30 AM</span>
                  </div>

                  <div className="p-3 bg-zinc-900 border border-white/5 rounded-xl flex justify-between items-center">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold">James Kim</span>
                      <span className="text-[11px] text-rios-text-secondary">Contract MSA stalled in legal review for 6 days.</span>
                    </div>
                    <span className="text-[10px] font-mono bg-amber-950/40 text-rios-commercial px-2 py-0.5 rounded border border-amber-500/10">11:30 AM</span>
                  </div>
                </div>

                <div className="pt-2">
                  <p className="text-[11px] text-rios-text-muted leading-relaxed italic">
                    "Maintain peer-level high integrity. Sending personalized, precise updates today will expand Orascom and L&T commercial parameters by 15%." — RIOS Intelligent Agent
                  </p>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-4 border-t border-white/5 flex justify-end gap-3">
                <button
                  onClick={() => setShowBriefing(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-900 border border-white/5 hover:bg-zinc-800 text-xs font-semibold text-zinc-300 transition-colors cursor-pointer"
                >
                  Close Briefing
                </button>
                <button
                  onClick={() => setShowBriefing(false)}
                  className="px-4 py-2 rounded-lg bg-rios-purple hover:bg-opacity-90 text-xs font-bold text-white transition-colors cursor-pointer"
                >
                  Got It
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL OVERLAY 2: ADD NEW RELATIONSHIP FORM */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-zinc-950 border border-white/10 rounded-2xl p-6 shadow-2xl z-10 text-zinc-100 font-sans"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Inbox className="w-5 h-5 text-rios-purple" />
                  <h3 className="text-base font-bold">Add Relationship Mission</h3>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1 rounded-full text-zinc-500 hover:text-white transition-colors hover:bg-white/5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Fields */}
              <form onSubmit={handleCreateRelationship} className="py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-rios-text-muted block">Client Name</label>
                    <input
                      type="text"
                      required
                      value={newRelName}
                      onChange={(e) => setNewRelName(e.target.value)}
                      placeholder="e.g. Liam Sterling"
                      className="w-full bg-zinc-900 border border-white/5 p-2.5 rounded-lg text-xs text-white focus:outline-none focus:border-rios-purple/40 placeholder-zinc-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-rios-text-muted block">Company</label>
                    <input
                      type="text"
                      required
                      value={newRelCompany}
                      onChange={(e) => setNewRelCompany(e.target.value)}
                      placeholder="e.g. Al-Futtaim Group"
                      className="w-full bg-zinc-900 border border-white/5 p-2.5 rounded-lg text-xs text-white focus:outline-none focus:border-rios-purple/40 placeholder-zinc-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-rios-text-muted block">Location</label>
                    <input
                      type="text"
                      value={newRelLocation}
                      onChange={(e) => setNewRelLocation(e.target.value)}
                      placeholder="e.g. Dubai | UAE"
                      className="w-full bg-zinc-900 border border-white/5 p-2.5 rounded-lg text-xs text-white focus:outline-none focus:border-rios-purple/40 placeholder-zinc-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-rios-text-muted block">Suggested Channel</label>
                    <select
                      value={newRelChannel}
                      onChange={(e) => setNewRelChannel(e.target.value as CommunicationChannel)}
                      className="w-full bg-zinc-900 border border-white/5 p-2.5 rounded-lg text-xs text-white focus:outline-none focus:border-rios-purple/40 cursor-pointer"
                    >
                      <option value="email">Email</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="phone">Phone</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-rios-text-muted block">Category</label>
                    <select
                      value={newRelCategory}
                      onChange={(e) => setNewRelCategory(e.target.value as RelationshipCategory)}
                      className="w-full bg-zinc-900 border border-white/5 p-2 rounded-lg text-xs text-white focus:outline-none focus:border-rios-purple/40 cursor-pointer"
                    >
                      <option value="critical">Critical</option>
                      <option value="commitment">Commitment</option>
                      <option value="commercial">Commercial</option>
                      <option value="building">Building</option>
                      <option value="nurture">Nurture</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-rios-text-muted block">Stage</label>
                    <select
                      value={newRelStage}
                      onChange={(e) => setNewRelStage(e.target.value as RelationshipStage)}
                      className="w-full bg-zinc-900 border border-white/5 p-2 rounded-lg text-xs text-white focus:outline-none focus:border-rios-purple/40 cursor-pointer"
                    >
                      <option value="Discovered">Discovered</option>
                      <option value="Connected">Connected</option>
                      <option value="Recognized">Recognized</option>
                      <option value="Rapport">Rapport</option>
                      <option value="Trust">Trust</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-rios-text-muted block">Priority</label>
                    <select
                      value={newRelPriority}
                      onChange={(e) => setNewRelPriority(e.target.value as PriorityLevel)}
                      className="w-full bg-zinc-900 border border-white/5 p-2 rounded-lg text-xs text-white focus:outline-none focus:border-rios-purple/40 cursor-pointer"
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-lg bg-zinc-900 border border-white/5 hover:bg-zinc-800 text-xs font-semibold text-zinc-300 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-rios-purple hover:bg-opacity-90 text-xs font-bold text-white transition-colors cursor-pointer shadow-[0_4px_12px_rgba(124,58,237,0.3)]"
                  >
                    Add Relationship
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL OVERLAY 3: PASTE REPLY (single message) */}
      <LogInteractionModal
        isOpen={showPasteReply}
        onClose={() => setShowPasteReply(false)}
        onLogged={(relId) => store.refreshRelationshipFields(relId)}
        initialContact={activeContactForModals}
      />

      {/* MODAL OVERLAY 4: IMPORT INTERACTIONS (bulk AI parse) */}
      <ImportInteractionsModal
        isOpen={showImportInteractions}
        onClose={() => setShowImportInteractions(false)}
        onImported={(relId) => store.refreshRelationshipFields(relId)}
        initialContact={activeContactForModals}
      />

      <LinkedinEnrichmentModal
        isOpen={showEnrichment}
        onClose={() => setShowEnrichment(false)}
        onEnriched={(relId) => store.refreshRelationshipFields(relId)}
        initialContact={activeContactForModals}
      />
    </div>
  );
}
