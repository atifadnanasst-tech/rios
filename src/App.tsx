import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { RelationshipSearchResult } from './lib/domain/search';
import { RELATIONSHIP_STAGES, ICP_TIERS, OUTREACH_STATUSES } from './lib/domain/constants';
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
  Clock,
  Search
} from 'lucide-react';
import { useStore, getFilteredWorkItems } from './store/useStore.ts';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { Header } from './components/layout/Header.tsx';
import { KPICard } from './components/dashboard/KPICard.tsx';
import { SettingsScreen } from './components/settings/SettingsScreen.tsx';
import { QueueTabs } from './components/dashboard/QueueTabs.tsx';
import { CategoryPill } from './components/dashboard/CategoryPill.tsx';
import { RelationshipMissionCard } from './components/relationship/RelationshipMissionCard.tsx';
import { RelationshipAdvisor } from './components/relationship/RelationshipAdvisor.tsx';
import { BulkToolbar } from './components/relationship/BulkToolbar.tsx';
import { LogInteractionModal } from './components/modals/LogInteractionModal.tsx';
import { ImportInteractionsModal } from './components/modals/ImportInteractionsModal.tsx';
import { LinkedinEnrichmentModal } from './components/modals/LinkedinEnrichmentModal.tsx';
import { OutreachPreviewModal } from './components/modals/OutreachPreviewModal.tsx';
import { LogActivitySheet } from './components/modals/LogActivitySheet.tsx';
import { SnoozeSheet } from './components/modals/SnoozeSheet.tsx';
import { ArchiveSheet } from './components/modals/ArchiveSheet.tsx';
import { ConfirmDialog } from './components/modals/ConfirmDialog.tsx';
import { Relationship, WorkItem, RelationshipCategory, RelationshipStage, PriorityLevel, CommunicationChannel } from './types/index.ts';

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
  // Set only when Enrichment's "Save & Log Interaction" hands off to Log
  // Interaction — takes priority over activeContactForModals for that one
  // open, since the enriched contact might not be who's currently selected
  // in the right panel. Cleared as soon as Log Interaction closes.
  const [chainedLogContact, setChainedLogContact] = useState<RelationshipSearchResult | undefined>(undefined);
  const [showImportInteractions, setShowImportInteractions] = useState(false);
  const [showEnrichment, setShowEnrichment] = useState(false);
  const [showOutreach, setShowOutreach] = useState(false);
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

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
  const selectedWorkItem = 
    store.workItems.find(item => item.id === store.selectedWorkItemId) ||
    store.completedToday.find(item => item.id === store.selectedWorkItemId) ||
    null;

  const isAllContactsTab = store.activeQueueTab === 'all';
  const isArchivedTab = store.activeQueueTab === 'archived';
  const isSnoozedTab = store.activeQueueTab === 'snoozed';

  // Pinned search result — when someone opens a contact via the header
  // search, that contact might be buried deep in the current sort order
  // (or on a different page entirely, or not in the currently-loaded list
  // at all). Since searching for someone specifically is a clear signal
  // of intent, pin them to the very top of whichever list is on screen
  // right now, so bulk actions (checkbox, Archive, Snooze, etc.) work on
  // them immediately without hunting through pages.
  const [pinnedRelationshipId, setPinnedRelationshipId] = useState<string | null>(null);

  // Clear the pin on a genuine tab switch — a pin only makes sense in the
  // context you searched from.
  React.useEffect(() => {
    setPinnedRelationshipId(null);
  }, [store.activeQueueTab]);

  // Also clear it once the owner deliberately looks at a different card —
  // the pin has served its purpose once attention has moved on.
  React.useEffect(() => {
    if (!pinnedRelationshipId || !store.selectedWorkItemId) return;
    const selected = store.workItems.find((i) => i.id === store.selectedWorkItemId);
    if (selected && selected.relationshipId !== pinnedRelationshipId) {
      setPinnedRelationshipId(null);
    }
  }, [store.selectedWorkItemId]);

  // All Contacts filters — narrows the server-side query, used both for
  // browsing a page at a time and for "select all N matching" below.
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterIcpTier, setFilterIcpTier] = useState('');
  const [filterOutreachStatus, setFilterOutreachStatus] = useState('');
  const [showAllContactsFilters, setShowAllContactsFilters] = useState(false);
  const [selectingAllMatching, setSelectingAllMatching] = useState(false);

  const activeAllContactsFilters = {
    company: filterCompany.trim() || undefined,
    stage: filterStage || undefined,
    country: filterCountry.trim() || undefined,
    icpTier: filterIcpTier || undefined,
    outreachStatus: filterOutreachStatus || undefined,
  };
  const hasActiveAllContactsFilters = Object.values(activeAllContactsFilters).some(Boolean);

  function clearAllContactsFilters() {
    setFilterCompany('');
    setFilterStage('');
    setFilterCountry('');
    setFilterIcpTier('');
    setFilterOutreachStatus('');
  }

  // Sort — only meaningful for the Daily Work Queue family of tabs
  // (work-queue/starred/commitments/completed), which share the same
  // client-side filteredWorkItems list. All Contacts has its own
  // server-side sort already (icp_score/name/last_touch); Archived and
  // Snoozed have their own fixed, purpose-specific ordering.
  const [sortField, setSortField] = useState<'priority' | 'alphabetical' | 'stage' | 'icpScore' | 'country'>('priority');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const SORT_OPTIONS: { value: typeof sortField; label: string }[] = [
    { value: 'priority', label: 'Priority & Next Action' },
    { value: 'alphabetical', label: 'Alphabetical' },
    { value: 'stage', label: 'Stage (high to low)' },
    { value: 'icpScore', label: 'ICP Score' },
    { value: 'country', label: 'Country' },
  ];

  // Real KPI metrics — queried once on mount
  const [advanceCount, setAdvanceCount] = useState<number | null>(null);
  const [replyRate, setReplyRate] = useState<number | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Stage advances today
    import('./lib/supabaseClient').then(({ supabase }) => {
      supabase
        .from('relationship_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'stage_changed')
        .gte('created_at', today)
        .then(({ count }) => setAdvanceCount(count || 0));

      // Reply rate: message_received / message_sent in last 7 days
      Promise.all([
        supabase
          .from('relationship_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'message_sent')
          .gte('created_at', sevenDaysAgo),
        supabase
          .from('relationship_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'message_received')
          .gte('created_at', sevenDaysAgo),
      ]).then(([sent, received]) => {
        const sentCount = sent.count || 0;
        const receivedCount = received.count || 0;
        setReplyRate(sentCount > 0 ? Math.round((receivedCount / sentCount) * 100) : 0);
      });
    });
  }, []);

  // All Contacts — server-side paginated, separate state from the daily queue
  const [allContactsItems, setAllContactsItems] = useState<WorkItem[]>([]);
  const [allContactsTotal, setAllContactsTotal] = useState(0);
  const [allContactsPage, setAllContactsPage] = useState(1);

  // Archived tab — server-side paginated, separate state from every other
  // tab, same reasoning as All Contacts above (own architectural rule:
  // each tab that browses the full dataset gets its own pagination state,
  // never shared with the daily queue's client-side-paginated list).
  const [archivedItems, setArchivedItems] = useState<WorkItem[]>([]);
  const [archivedTotal, setArchivedTotal] = useState(0);
  const [archivedPage, setArchivedPage] = useState(1);

  // Snoozed tab — server-side paginated, same reasoning as Archived above.
  const [snoozedItems, setSnoozedItems] = useState<WorkItem[]>([]);
  const [snoozedTotal, setSnoozedTotal] = useState(0);
  const [snoozedPage, setSnoozedPage] = useState(1);

  // Bulk-select checkboxes store the workItem's own id, regardless of which
  // tab/list it was checked from. Every bulk action (Outreach, Log Activity,
  // Snooze, Archive) then needs to turn those ids back into relationshipIds.
  // Bug found 2026-07-13: this lookup only ever searched `store.workItems`
  // (the Daily Work Queue's data) — so checkboxes ticked while on the All
  // Contacts tab (a separate list, `allContactsItems`) silently resolved to
  // nothing, and every bulk action reported "0 contacts" from that tab.
  // This checks both lists, so it works regardless of which tab you're on.
  function resolveRelationshipIds(workItemIds: string[]): string[] {
    return workItemIds
      .map(id =>
        store.workItems.find(i => i.id === id)?.relationshipId ??
        allContactsItems.find(i => i.id === id)?.relationshipId ??
        archivedItems.find(i => i.id === id)?.relationshipId ??
        snoozedItems.find(i => i.id === id)?.relationshipId
      )
      .filter(Boolean) as string[];
  }

  // Unarchive — no reason needed (unlike Archive), so no popup/reason-picker
  // form, just a themed yes/no confirmation (replacing the native browser
  // confirm() dialog, which looked out of place next to the rest of the app).
  const [showUnarchiveConfirm, setShowUnarchiveConfirm] = useState(false);
  const [pendingUnarchiveIds, setPendingUnarchiveIds] = useState<string[]>([]);

  function requestUnarchive(relationshipIds: string[]) {
    if (relationshipIds.length === 0) return;
    setPendingUnarchiveIds(relationshipIds);
    setShowUnarchiveConfirm(true);
  }

  function cancelUnarchive() {
    setShowUnarchiveConfirm(false);
    setPendingUnarchiveIds([]);
  }

  async function confirmUnarchive() {
    setShowUnarchiveConfirm(false);
    const relationshipIds = pendingUnarchiveIds;
    if (relationshipIds.length === 0) return;

    try {
      const { unarchiveRelationshipsBulk, fetchArchivedRelationshipsPaginated } = await import('./lib/domain/relationships');
      await unarchiveRelationshipsBulk(relationshipIds);
      // Refresh the archived list — these no longer belong on this tab
      const { items, total } = await fetchArchivedRelationshipsPaginated(archivedPage, itemsPerPage);
      setArchivedItems(items);
      setArchivedTotal(total);
      store.clearBulkSelection();
    } catch (err) {
      console.error('Failed to unarchive:', err);
      alert(err instanceof Error ? err.message : 'Failed to unarchive');
    } finally {
      setPendingUnarchiveIds([]);
    }
  }

  // Wake Up Now — bring snoozed contacts back early, on demand. Same
  // request/confirm/cancel split as Unarchive above, same reasoning:
  // no reason-picker step exists here to double as a pause point, so a
  // themed confirm stands in for it.
  const [showWakeUpConfirm, setShowWakeUpConfirm] = useState(false);
  const [pendingWakeUpIds, setPendingWakeUpIds] = useState<string[]>([]);

  function requestWakeUp(relationshipIds: string[]) {
    if (relationshipIds.length === 0) return;
    setPendingWakeUpIds(relationshipIds);
    setShowWakeUpConfirm(true);
  }

  function cancelWakeUp() {
    setShowWakeUpConfirm(false);
    setPendingWakeUpIds([]);
  }

  async function confirmWakeUp() {
    setShowWakeUpConfirm(false);
    const relationshipIds = pendingWakeUpIds;
    if (relationshipIds.length === 0) return;

    try {
      const { wakeUpRelationshipsBulk, fetchSnoozedRelationshipsPaginated } = await import('./lib/domain/relationships');
      await wakeUpRelationshipsBulk(relationshipIds);
      // Refresh the snoozed list — these no longer belong on this tab
      const { items, total } = await fetchSnoozedRelationshipsPaginated(snoozedPage, itemsPerPage);
      setSnoozedItems(items);
      setSnoozedTotal(total);
      store.clearBulkSelection();
    } catch (err) {
      console.error('Failed to wake up:', err);
      alert(err instanceof Error ? err.message : 'Failed to wake up contact');
    } finally {
      setPendingWakeUpIds([]);
    }
  }

  // Snapshot of relationshipIds for whichever bulk-action popup is currently
  // open (Outreach/Snooze/Log Activity/Archive). Taken ONCE at the moment
  // the button is clicked, not recomputed on every re-render while the
  // popup is open — a live-recomputed value can go stale/empty if
  // selectedWorkItemIds changes for any reason while the popup is showing.
  const [bulkActionIds, setBulkActionIds] = useState<string[]>([]);

  // Pagination state shared between both tabs
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showPerPageMenu, setShowPerPageMenu] = useState(false);

  // Sort — client-side, only applies to the Daily Queue family of tabs.
  // 'priority' keeps the existing order (already prioritized upstream);
  // everything else is a plain client-side re-sort of what's already
  // loaded, since these tabs never fetch more than what's already here.
  const sortedWorkItems = React.useMemo(() => {
    if (sortField === 'priority') return filteredWorkItems;
    const items = [...filteredWorkItems];
    if (sortField === 'alphabetical') {
      items.sort((a, b) => a.relationship.name.localeCompare(b.relationship.name));
    } else if (sortField === 'stage') {
      items.sort((a, b) => RELATIONSHIP_STAGES.indexOf(b.relationship.currentStage) - RELATIONSHIP_STAGES.indexOf(a.relationship.currentStage));
    } else if (sortField === 'icpScore') {
      items.sort((a, b) => b.relationship.score - a.relationship.score);
    } else if (sortField === 'country') {
      items.sort((a, b) => a.relationship.location.localeCompare(b.relationship.location));
    }
    return items;
  }, [filteredWorkItems, sortField]);

  const activePage = isAllContactsTab ? allContactsPage : isArchivedTab ? archivedPage : isSnoozedTab ? snoozedPage : currentPage;
  const setActivePage = isAllContactsTab
    ? (p: number) => setAllContactsPage(p)
    : isArchivedTab
    ? (p: number) => setArchivedPage(p)
    : isSnoozedTab
    ? (p: number) => setSnoozedPage(p)
    : (p: number) => setCurrentPage(p);

  const activeTotal = isAllContactsTab ? allContactsTotal : isArchivedTab ? archivedTotal : isSnoozedTab ? snoozedTotal : filteredWorkItems.length;
  const totalPages = Math.max(1, Math.ceil(activeTotal / itemsPerPage));
  const safePage = Math.min(activePage, totalPages);
  const pageStart = activeTotal === 0 ? 0 : (safePage - 1) * itemsPerPage + 1;
  const pageEnd = Math.min(safePage * itemsPerPage, activeTotal);
  const paginatedWorkItems = isAllContactsTab
    ? allContactsItems
    : isArchivedTab
    ? archivedItems
    : isSnoozedTab
    ? snoozedItems
    : sortedWorkItems.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  // Prepend the pinned search result, if any, unless it's already
  // naturally present in the current page (no point showing it twice).
  const pinnedWorkItem = pinnedRelationshipId ? store.workItems.find((i) => i.relationshipId === pinnedRelationshipId) : null;
  const displayedWorkItems =
    pinnedWorkItem && !paginatedWorkItems.some((i) => i.relationshipId === pinnedRelationshipId)
      ? [pinnedWorkItem, ...paginatedWorkItems]
      : paginatedWorkItems;

  // Load All Contacts from server when that tab is active
  useEffect(() => {
    if (!isAllContactsTab) return;
    import('./lib/domain/relationships').then(({ fetchAllRelationshipsPaginated }) =>
      fetchAllRelationshipsPaginated(allContactsPage, itemsPerPage, 'icp_score', activeAllContactsFilters)
        .then(({ items, total }) => { setAllContactsItems(items); setAllContactsTotal(total); })
        .catch(console.error)
    );
  }, [isAllContactsTab, allContactsPage, itemsPerPage, filterCompany, filterStage, filterCountry, filterIcpTier, filterOutreachStatus]);

  // Load Archived contacts from server when that tab is active — same
  // pattern as All Contacts above.
  useEffect(() => {
    if (!isArchivedTab) return;
    import('./lib/domain/relationships').then(({ fetchArchivedRelationshipsPaginated }) =>
      fetchArchivedRelationshipsPaginated(archivedPage, itemsPerPage)
        .then(({ items, total }) => { setArchivedItems(items); setArchivedTotal(total); })
        .catch(console.error)
    );
  }, [isArchivedTab, archivedPage, itemsPerPage]);

  // Load Snoozed contacts from server when that tab is active — same
  // pattern as Archived above, soonest-resurface-first ordering happens
  // server-side in fetchSnoozedRelationshipsPaginated itself.
  useEffect(() => {
    if (!isSnoozedTab) return;
    import('./lib/domain/relationships').then(({ fetchSnoozedRelationshipsPaginated }) =>
      fetchSnoozedRelationshipsPaginated(snoozedPage, itemsPerPage)
        .then(({ items, total }) => { setSnoozedItems(items); setSnoozedTotal(total); })
        .catch(console.error)
    );
  }, [isSnoozedTab, snoozedPage, itemsPerPage]);

  // Reset to page 1 whenever the underlying filter/search/tab changes —
  // otherwise you could land on a stale page number that's now empty or
  // out of range for a newly-narrowed result set.
  useEffect(() => {
    setCurrentPage(1);
    setAllContactsPage(1);
    setArchivedPage(1);
    setSnoozedPage(1);
  }, [store.activeQueueTab, store.activeCategoryFilter, store.searchQuery, filterCompany, filterStage, filterCountry, filterIcpTier, filterOutreachStatus]);

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
    return store.workItems.filter(item => !item.completed && item.category === cat).length;
  };

  // Select all checkbox handler
  // Fix: this used to always check against filteredWorkItems, which only
  // ever reflects the Daily Work Queue's data — meaning "Select All" was
  // silently checking the wrong contacts whenever you were on All
  // Contacts, Archived, or Snoozed (same root-cause family as an earlier
  // bulk-action bug). Now it uses whichever list is actually on screen.
  const currentTabItems = isAllContactsTab ? allContactsItems : isArchivedTab ? archivedItems : isSnoozedTab ? snoozedItems : filteredWorkItems;
  const isAllChecked = currentTabItems.length > 0 && currentTabItems.every(item => store.selectedWorkItemIds.includes(item.id));
  const handleSelectAllChange = () => {
    store.setSelectedWorkItemIds(isAllChecked ? [] : currentTabItems.map(item => item.id));
  };

  // "Select all N matching" — different from the checkbox above, which
  // only ever selects what's currently loaded on this one page. This
  // reaches across the full filtered result set (e.g. all 247 contacts
  // at a company, not just the 10 shown on this page), so a bulk action
  // afterward (Archive/Snooze/etc.) can act on everyone who matches.
  async function handleSelectAllMatching() {
    setSelectingAllMatching(true);
    try {
      const { fetchAllMatchingRelationshipIds } = await import('./lib/domain/relationships');
      const { ids, total, capped } = await fetchAllMatchingRelationshipIds(activeAllContactsFilters);
      store.setSelectedWorkItemIds(ids);
      if (capped) {
        alert(`Selected the first ${ids.length} of ${total} matching contacts — narrow your filters to select everyone, since ${total} is above the safety cap for one selection.`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to select matching contacts');
    } finally {
      setSelectingAllMatching(false);
    }
  }

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
      suggestedStage: null,
      isCommitted: false,
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
      whyToday: `${newRelName} was recently added to RIOS. Perfect timing to establish a professional line of communication.`,
      excludedUntil: null,
      nextBestActionDraft: null,
      nextTouchDue: null
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
          if (view === 'command-center' || view === 'settings') {
            setActiveView(view);
          } else {
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
        <Header
          onShowAIBriefing={() => setShowBriefing(true)}
          onOpenViaSearch={(relationshipId) => setPinnedRelationshipId(relationshipId)}
        />

        {/* Settings screen — shown when settings nav is active */}
        {activeView === 'settings' && (
          <div className="flex-1 flex overflow-hidden">
            <SettingsScreen />
          </div>
        )}

        {/* BOTTOM WORKSPACE */}
        <div className="flex-1 flex min-w-0 overflow-hidden" style={{ display: activeView === 'settings' ? 'none' : 'flex' }}>
          
          {/* COLUMN 2: CENTER WORK QUEUE CONTENT */}
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto px-6 py-6 space-y-6">
            
            {/* KPI STATS ROW */}
            <div className="flex gap-4 select-none">
              <KPICard
                title="Today's Mission"
                value={String(store.workItems.filter(i => !i.completed).length)}
                subtext="Work Items"
                icon={CheckSquare}
              />
              <KPICard
                title="Est. Time"
                value={(() => {
                  const mins = store.workItems.filter(i => !i.completed).length * 5;
                  return mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;
                })()}
                subtext="Focus Time"
                icon={Clock}
              />
              <KPICard
                title="Advance"
                value={advanceCount === null ? '—' : String(advanceCount)}
                subtext="Stage advances today"
                icon={Users}
              />
              <KPICard
                title="Reply Rate"
                value={replyRate === null ? '—' : `${replyRate}%`}
                subtext="Last 7 days"
                icon={Globe}
              />
            </div>

            {/* QUEUE NAVIGATION & TABS */}
            <QueueTabs
              activeTab={store.activeQueueTab}
              onChangeTab={(tab) => store.setQueueTab(tab)}
              options={[
                { id: 'work-queue', label: 'Daily Work Queue' },
                { id: 'all', label: 'All Contacts' },
                { id: 'starred', label: 'Starred' },
                { id: 'commitments', label: 'Committed' },
                { id: 'completed', label: 'Completed Today', count: store.completedToday.length || undefined },
                { id: 'archived', label: 'Archived' },
                { id: 'snoozed', label: 'Snoozed' },
              ]}
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
              {/* Sort selector — Daily Queue family of tabs only */}
              {!isAllContactsTab && !isArchivedTab && !isSnoozedTab ? (
                <div className="relative">
                  <button
                    onClick={() => setShowSortDropdown(!showSortDropdown)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <span>Sort: {SORT_OPTIONS.find((o) => o.value === sortField)?.label}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {showSortDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute left-0 top-full mt-1 w-56 bg-zinc-900 border border-white/10 rounded-xl py-1.5 shadow-2xl z-50"
                      >
                        {SORT_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => { setSortField(opt.value); setShowSortDropdown(false); }}
                            className={`w-full flex items-center px-3.5 py-2 text-left text-xs font-medium transition-colors ${
                              sortField === opt.value ? 'text-rios-purple' : 'text-zinc-300 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : isAllContactsTab ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAllContactsFilters(!showAllContactsFilters)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      hasActiveAllContactsFilters
                        ? 'bg-rios-purple/15 border-rios-purple/30 text-rios-purple'
                        : 'bg-zinc-900 border-white/5 text-zinc-300 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Filters{hasActiveAllContactsFilters ? ' (active)' : ''}</span>
                  </button>
                  {hasActiveAllContactsFilters && (
                    <button onClick={clearAllContactsFilters} className="text-[10px] text-zinc-500 hover:text-white transition-colors">
                      Clear
                    </button>
                  )}
                </div>
              ) : (
                <div />
              )}

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

                {isAllContactsTab && (
                  <button
                    onClick={handleSelectAllMatching}
                    disabled={selectingAllMatching || allContactsTotal === 0}
                    className="text-xs font-semibold text-rios-purple hover:text-white transition-colors disabled:opacity-50"
                  >
                    {selectingAllMatching ? 'Selecting…' : `Select all ${allContactsTotal} matching`}
                  </button>
                )}
              </div>
            </div>

            {/* ALL CONTACTS FILTER ROW */}
            {isAllContactsTab && showAllContactsFilters && (
              <div className="flex flex-wrap items-center gap-2 py-3 border-b border-white/[0.03]">
                <input
                  type="text"
                  placeholder="Company contains..."
                  value={filterCompany}
                  onChange={(e) => setFilterCompany(e.target.value)}
                  className="h-8 px-2.5 bg-zinc-900 border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rios-purple/40 transition-all w-44"
                />
                <input
                  type="text"
                  placeholder="Country..."
                  value={filterCountry}
                  onChange={(e) => setFilterCountry(e.target.value)}
                  className="h-8 px-2.5 bg-zinc-900 border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rios-purple/40 transition-all w-32"
                />
                <select
                  value={filterStage}
                  onChange={(e) => setFilterStage(e.target.value)}
                  className="h-8 px-2 bg-zinc-900 border border-white/10 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-rios-purple/40 transition-all"
                >
                  <option value="">All Stages</option>
                  {RELATIONSHIP_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                  value={filterIcpTier}
                  onChange={(e) => setFilterIcpTier(e.target.value)}
                  className="h-8 px-2 bg-zinc-900 border border-white/10 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-rios-purple/40 transition-all"
                >
                  <option value="">All Tiers</option>
                  {ICP_TIERS.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
                <select
                  value={filterOutreachStatus}
                  onChange={(e) => setFilterOutreachStatus(e.target.value)}
                  className="h-8 px-2 bg-zinc-900 border border-white/10 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-rios-purple/40 transition-all"
                >
                  <option value="">All Statuses</option>
                  {OUTREACH_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
            )}

            {/* ACTIVE LIST OF MISSION CARDS */}
            <div className="flex flex-col gap-3 relative">
              <AnimatePresence initial={false} mode="popLayout">
                {displayedWorkItems.length > 0 ? (
                  displayedWorkItems.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.18 }}
                    >
                      {item.relationshipId === pinnedRelationshipId && (
                        <div className="flex items-center justify-between px-1 pb-1.5">
                          <span className="text-[10px] font-semibold text-rios-purple flex items-center gap-1">
                            <Search className="w-3 h-3" /> Found via search
                          </span>
                          <button
                            onClick={() => setPinnedRelationshipId(null)}
                            className="text-[10px] text-zinc-500 hover:text-white transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
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
                        onToggleCommit={() => store.toggleCommitted(item.relationshipId)}
                        onQuickSent={() => store.initialize()}
                        onRequestArchive={() => {
                          setBulkActionIds([item.relationshipId]);
                          setShowArchive(true);
                        }}
                        isArchived={isArchivedTab}
                        onRequestUnarchive={() => requestUnarchive([item.relationshipId])}
                        isSnoozed={isSnoozedTab}
                        onRequestWakeUp={() => requestWakeUp([item.relationshipId])}
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
                    onClick={() => setActivePage(Math.max(1, safePage - 1))}
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
                          onClick={() => setActivePage(p)}
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
                    onClick={() => setActivePage(Math.min(totalPages, safePage + 1))}
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
                            setActivePage(1);
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
          setBulkActionIds(resolveRelationshipIds(store.selectedWorkItemIds));
          setShowOutreach(true);
        }}
        onSnooze={() => {
          setBulkActionIds(resolveRelationshipIds(store.selectedWorkItemIds));
          setShowSnooze(true);
        }}
        onComplete={() => {
          setBulkActionIds(resolveRelationshipIds(store.selectedWorkItemIds));
          setShowLogActivity(true);
        }}
        onChangeStage={(stage) => store.bulkChangeStage(stage)}
        onArchive={() => {
          setBulkActionIds(resolveRelationshipIds(store.selectedWorkItemIds));
          setShowArchive(true);
        }}
        isArchivedTab={isArchivedTab}
        onUnarchive={() => requestUnarchive(resolveRelationshipIds(store.selectedWorkItemIds))}
        isSnoozedTab={isSnoozedTab}
        onWakeUp={() => requestWakeUp(resolveRelationshipIds(store.selectedWorkItemIds))}
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
        onClose={() => {
          setShowPasteReply(false);
          setChainedLogContact(undefined);
        }}
        onLogged={(relId) => store.refreshRelationshipFields(relId)}
        initialContact={chainedLogContact || activeContactForModals}
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
        onEnrichAndLog={(contact) => {
          setShowEnrichment(false);
          setChainedLogContact(contact);
          setShowPasteReply(true);
        }}
        initialContact={activeContactForModals}
      />

      <OutreachPreviewModal
        isOpen={showOutreach}
        onClose={() => setShowOutreach(false)}
        relationshipIds={bulkActionIds}
        onOutreached={(ids) => {
          store.removeRelationshipsFromQueue(ids);
          store.clearBulkSelection();
          setBulkActionIds([]);
        }}
      />

      <LogActivitySheet
        isOpen={showLogActivity}
        onClose={() => setShowLogActivity(false)}
        relationshipIds={bulkActionIds}
        onLogged={(ids) => {
          store.removeRelationshipsFromQueue(ids);
          store.clearBulkSelection();
          setBulkActionIds([]);
        }}
      />

      <SnoozeSheet
        isOpen={showSnooze}
        onClose={() => setShowSnooze(false)}
        relationshipIds={bulkActionIds}
        onSnoozed={(ids) => {
          store.removeRelationshipsFromQueue(ids);
          store.clearBulkSelection();
          setBulkActionIds([]);
        }}
      />

      <ArchiveSheet
        isOpen={showArchive}
        onClose={() => setShowArchive(false)}
        relationshipIds={bulkActionIds}
        onArchived={(ids) => {
          store.removeRelationshipsFromQueue(ids);
          store.clearBulkSelection();
          setBulkActionIds([]);
        }}
      />

      <ConfirmDialog
        isOpen={showUnarchiveConfirm}
        title={pendingUnarchiveIds.length === 1 ? 'Unarchive this contact?' : `Unarchive ${pendingUnarchiveIds.length} contacts?`}
        message="They'll re-enter your active queues starting today."
        confirmLabel="Unarchive"
        cancelLabel="Cancel"
        onConfirm={confirmUnarchive}
        onCancel={cancelUnarchive}
      />

      <ConfirmDialog
        isOpen={showWakeUpConfirm}
        title={pendingWakeUpIds.length === 1 ? 'Wake up this contact?' : `Wake up ${pendingWakeUpIds.length} contacts?`}
        message="They'll re-enter your active queues starting today, instead of waiting for their scheduled date."
        confirmLabel="Wake Up"
        cancelLabel="Cancel"
        onConfirm={confirmWakeUp}
        onCancel={cancelWakeUp}
      />
    </div>
  );
}
