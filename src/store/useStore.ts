import { create } from 'zustand';
import { Relationship, WorkItem, RelationshipCategory, RelationshipStage } from '../types/index.ts';
import { fetchTopRelationships, fetchTodaysWorkItems, completeRelationshipAction, setRelationshipStarred, setRelationshipCommitted, updateRelationshipStage, fetchRelationshipRowById, findOrCreateRelationshipForContact } from '../lib/domain/relationships';
import { mapTemperatureToStatus, mapRowToRelationship, buildWorkItemFromRelationship } from '../lib/domain/mappers';
import { supabase } from '../lib/supabaseClient';

interface RIOSState {
  relationships: Relationship[];
  workItems: WorkItem[];
  completedToday: WorkItem[]; // items completed this session — shown in Completed Today tab
  selectedWorkItemId: string | null;
  selectedWorkItemIds: string[]; // For bulk operations
  activeQueueTab: 'work-queue' | 'all' | 'starred' | 'commitments' | 'completed' | 'archived';
  activeCategoryFilter: 'all' | RelationshipCategory;
  searchQuery: string;
  isLoading: boolean;
  loadError: string | null;

  // Actions
  initialize: () => Promise<void>;
  selectWorkItem: (id: string | null) => void;
  toggleSelectWorkItemForBulk: (id: string) => void;
  selectAllWorkItems: (checked: boolean) => void;
  clearBulkSelection: () => void;
  setQueueTab: (tab: 'work-queue' | 'all' | 'starred' | 'commitments' | 'completed' | 'archived') => void;
  setCategoryFilter: (category: 'all' | RelationshipCategory) => void;
  setSearchQuery: (query: string) => void;
  completeWorkItem: (id: string) => void;
  snoozeWorkItem: (id: string) => void;
  updateStage: (relationshipId: string, stage: RelationshipStage) => void;
  bulkComplete: () => void;
  removeRelationshipsFromQueue: (relationshipIds: string[]) => void;
  bulkSnooze: () => void;
  bulkChangeStage: (stage: RelationshipStage) => void;
  addRelationship: (relationship: Relationship) => void;
  toggleStarred: (relationshipId: string) => void;
  toggleCommitted: (relationshipId: string) => void;
  refreshRelationshipFields: (relationshipId: string) => Promise<void>;
  openRelationshipById: (relationshipId: string) => Promise<void>;
  addWorkItem: (workItem: WorkItem) => void;
}

export const useStore = create<RIOSState>((set, get) => ({
  relationships: [],
  workItems: [],
  completedToday: [],
  selectedWorkItemId: null,
  selectedWorkItemIds: [],
  activeQueueTab: 'work-queue',
  activeCategoryFilter: 'all',
  searchQuery: '',
  isLoading: true,
  loadError: null,

  initialize: async () => {
    set({ isLoading: true, loadError: null });
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [relationships, workItems] = await Promise.all([
        fetchTopRelationships(200),
        fetchTodaysWorkItems(100),
      ]);

      // Rebuild completedToday: relationships touched today via Outreach or Log Activity
      // Using last_outreach_date = today — persists in DB, no reconstruction needed
      const { data: touchedToday } = await supabase
        .from('relationships')
        .select('id, company, position, relationship_temperature, next_best_action, stage, icp_score, icp_tier, touch_number, starred, is_committed, suggested_stage, outreach_status, next_touch_due, last_outreach_channel, contacts(first_name, last_name, country)')
        .eq('last_outreach_date', today)
        .is('archived_at', null)
        .order('icp_score', { ascending: false });

      const completedToday: WorkItem[] = (touchedToday || []).map((r: any) => {
        const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
        const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : 'Unknown';
        return {
          id: `completed-${r.id}`,
          relationshipId: r.id,
          relationship: {
            id: r.id,
            name,
            avatar: name.charAt(0).toUpperCase(),
            company: r.company || '',
            position: r.position || '',
            location: contact?.country || '',
            starred: r.starred,
            isCommitted: r.is_committed,
            suggestedStage: r.suggested_stage || null,
            score: r.icp_score,
            status: r.relationship_temperature === 'Hot' ? 'Hot' : r.relationship_temperature === 'Warm' ? 'Warm' : 'Cold',
            commercialGoal: '',
            currentStage: r.stage,
            suggestedChannel: 'linkedin',
            nextBestAction: r.next_best_action || 'Follow up in 7 days',
            aiConfidence: 80,
            tags: [],
            whyToday: 'Outreached today',
          },
          category: 'building' as const,
          description: 'Outreached today — follow up in 7 days',
          priority: r.icp_tier === 'Tier_A' ? 'High' : 'Medium' as const,
          dueTime: 'Today',
          channel: 'linkedin' as const,
          completed: true,
          starred: r.starred,
        };
      });

      // Remove completed items from active queue
      const completedRelIds = new Set(completedToday.map(i => i.relationshipId));
      const activeWorkItems = workItems.filter(item => !completedRelIds.has(item.relationshipId));

      console.log('[RIOS init] relationships:', relationships.length, 'work items:', activeWorkItems.length, 'completed today:', completedToday.length);
      set({
        relationships,
        workItems: activeWorkItems,
        completedToday,
        selectedWorkItemId: null,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to load RIOS data from Supabase:', err);
      set({ isLoading: false, loadError: err instanceof Error ? err.message : 'Failed to load data' });
    }
  },

  selectWorkItem: (id) => {
    set({ selectedWorkItemId: id });
  },

  toggleSelectWorkItemForBulk: (id) => {
    const { selectedWorkItemIds } = get();
    if (selectedWorkItemIds.includes(id)) {
      set({ selectedWorkItemIds: selectedWorkItemIds.filter((item) => item !== id) });
    } else {
      set({ selectedWorkItemIds: [...selectedWorkItemIds, id] });
    }
  },

  selectAllWorkItems: (checked) => {
    if (checked) {
      // Get currently visible/filtered items
      const items = getFilteredWorkItems(get() as any);
      set({ selectedWorkItemIds: items.map(item => item.id) });
    } else {
      set({ selectedWorkItemIds: [] });
    }
  },

  clearBulkSelection: () => {
    set({ selectedWorkItemIds: [] });
  },

  setQueueTab: (tab) => {
    set({ activeQueueTab: tab });
  },

  setCategoryFilter: (category) => {
    const current = get().activeCategoryFilter;
    // Toggle filter off if clicked again
    set({ activeCategoryFilter: current === category ? 'all' : category });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  completeWorkItem: (id) => {
    const item = get().workItems.find((w) => w.id === id);

    // Optimistic update — UI responds immediately, doesn't wait on the network.
    set((state) => ({
      workItems: state.workItems.map((item) =>
        item.id === id ? { ...item, completed: true } : item
      ),
      selectedWorkItemIds: state.selectedWorkItemIds.filter(selectedId => selectedId !== id)
    }));

    // Persist in the background. If this fails, the UI has already moved on —
    // logged to console for now rather than rolling back state. Revisit this
    // once completeWorkItem is used often enough to notice silent failures.
    if (item) {
      completeRelationshipAction(item.relationshipId, item.description).catch((err) => {
        console.error('Failed to persist work item completion:', err);
      });
    }
  },

  snoozeWorkItem: (id) => {
    // NOTE: dueTime is now a real formatted date ("Today" / "Jul 10" / "No
    // date set"), not the old fake "H:MM AM/PM" this used to parse and
    // shift by 2 hours. That math no longer makes sense against a date
    // string, and there's no raw parseable date on WorkItem to compute a
    // real "+N days" from (only the display-formatted string). Rather than
    // crash or silently corrupt the display, this is a deliberate no-op for
    // now — real snooze (shifting relationships.next_touch_due in Supabase
    // and reflecting it here) needs its own dedicated build, same as the
    // channel-picker and archive features already flagged as separate work.
    console.warn('Snooze does not yet persist a real date change — flagged as pending work.');
  },

  updateStage: (relationshipId, stage) => {
    const oldRel = get().relationships.find((r) => r.id === relationshipId);
    const oldStage = oldRel?.currentStage;

    // Optimistic update — UI reflects it immediately.
    set((state) => ({
      relationships: state.relationships.map((rel) =>
        rel.id === relationshipId ? { ...rel, currentStage: stage } : rel
      ),
      // Sync relationship data inside workItems list as well
      workItems: state.workItems.map((item) =>
        item.relationshipId === relationshipId
          ? { ...item, relationship: { ...item.relationship, currentStage: stage } }
          : item
      )
    }));

    updateRelationshipStage(relationshipId, stage, oldStage).catch((err) => {
      console.error('Failed to persist stage change:', err);
    });
  },

  bulkComplete: () => {
    const { selectedWorkItemIds } = get();
    set((state) => ({
      workItems: state.workItems.map((item) =>
        selectedWorkItemIds.includes(item.id) ? { ...item, completed: true } : item
      ),
      selectedWorkItemIds: []
    }));
  },

  // Removes work items from the queue by relationship ID — used after
  // Outreach and Log Activity to immediately reflect completion in the
  // UI without waiting for a full store reload
  removeRelationshipsFromQueue: (relationshipIds: string[]) => {
    const idSet = new Set(relationshipIds);
    set((state) => {
      const completed = state.workItems.filter(item => idSet.has(item.relationshipId));
      const remaining = state.workItems.filter(item => !idSet.has(item.relationshipId));
      return {
        workItems: remaining,
        completedToday: [
          ...state.completedToday,
          ...completed.map(item => ({ ...item, completed: true })),
        ],
        selectedWorkItemIds: state.selectedWorkItemIds.filter(
          id => !completed.find(i => i.id === id)
        ),
      };
    });
  },

  bulkSnooze: () => {
    const { selectedWorkItemIds } = get();
    set((state) => ({
      workItems: state.workItems.map((item) => {
        if (selectedWorkItemIds.includes(item.id)) {
          return { ...item, dueTime: 'Tomorrow' };
        }
        return item;
      })
    }));
  },

  bulkChangeStage: (stage) => {
    const { selectedWorkItemIds, workItems, relationships } = get();
    const relIdsToUpdate = workItems
      .filter(item => selectedWorkItemIds.includes(item.id))
      .map(item => item.relationshipId);

    // Capture old stages before the optimistic update overwrites them —
    // needed for each relationship's stage-change audit event.
    const oldStagesById = new Map(relationships.map((r) => [r.id, r.currentStage]));

    set((state) => ({
      relationships: state.relationships.map((rel) =>
        relIdsToUpdate.includes(rel.id) ? { ...rel, currentStage: stage } : rel
      ),
      workItems: state.workItems.map((item) =>
        selectedWorkItemIds.includes(item.id)
          ? { ...item, relationship: { ...item.relationship, currentStage: stage } }
          : item
      ),
      selectedWorkItemIds: []
    }));

    // Persist every affected relationship — fire-and-forget per item so
    // one failure doesn't block the rest from saving.
    relIdsToUpdate.forEach((relId) => {
      updateRelationshipStage(relId, stage, oldStagesById.get(relId)).catch((err) => {
        console.error(`Failed to persist stage change for ${relId}:`, err);
      });
    });
  },

  addRelationship: (relationship) => {
    set((state) => ({
      relationships: [relationship, ...state.relationships]
    }));
  },

  toggleStarred: (relationshipId) => {
    const rel = get().relationships.find((r) => r.id === relationshipId);
    if (!rel) return;
    const newValue = !rel.starred;

    // Optimistic update — UI reflects the toggle immediately.
    set((state) => ({
      relationships: state.relationships.map((r) =>
        r.id === relationshipId ? { ...r, starred: newValue } : r
      ),
      workItems: state.workItems.map((item) =>
        item.relationshipId === relationshipId
          ? { ...item, relationship: { ...item.relationship, starred: newValue } }
          : item
      ),
    }));

    setRelationshipStarred(relationshipId, newValue).catch((err) => {
      console.error('Failed to persist starred toggle:', err);
    });
  },

  toggleCommitted: (relationshipId) => {
    const rel = get().relationships.find((r) => r.id === relationshipId);
    if (!rel) return;
    const newValue = !rel.isCommitted;

    set((state) => ({
      relationships: state.relationships.map((r) =>
        r.id === relationshipId ? { ...r, isCommitted: newValue } : r
      ),
      workItems: state.workItems.map((item) =>
        item.relationshipId === relationshipId
          ? { ...item, relationship: { ...item.relationship, isCommitted: newValue } }
          : item
      ),
    }));

    setRelationshipCommitted(relationshipId, newValue).catch((err) => {
      console.error('Failed to persist committed toggle:', err);
    });
  },

  // Surgically updates ONLY the fields that a background AI recompute (or
  // any other live update) actually changed — on the ONE relationship
  // affected. Deliberately does NOT re-fetch or re-synthesize the whole
  // relationships/workItems list, and deliberately does NOT touch
  // selectedWorkItemId. A prior version of this used a full store.initialize()
  // for this, which silently evicted the currently-viewed relationship
  // from the list the moment its status changed enough to fall out of the
  // top-N synthesis — causing the Advisor panel to go blank mid-conversation,
  // a real regression a live test caught.
  refreshRelationshipFields: async (relationshipId) => {
    const { data, error } = await supabase
      .from('relationships')
      .select('relationship_temperature, outreach_status, next_best_action, next_touch_due, stage, icp_score, suggested_stage, touch_number, cadence_step')
      .eq('id', relationshipId)
      .single();

    if (error || !data) {
      console.error('Failed to refresh relationship fields:', error?.message);
      return;
    }

    const patch = {
      status: mapTemperatureToStatus(data.relationship_temperature),
      nextBestAction: data.next_best_action || undefined,
      currentStage: data.stage as any,
      score: data.icp_score,
      suggestedStage: (data.suggested_stage as any) || null,
      touchNumber: data.touch_number ?? 0,
    };

    set((state) => ({
      relationships: state.relationships.map((r) =>
        r.id === relationshipId ? { ...r, ...patch, nextBestAction: patch.nextBestAction ?? r.nextBestAction } : r
      ),
      workItems: state.workItems.map((item) =>
        item.relationshipId === relationshipId
          ? {
              ...item,
              relationship: {
                ...item.relationship,
                ...patch,
                nextBestAction: patch.nextBestAction ?? item.relationship.nextBestAction,
              },
            }
          : item
      ),
    }));
  },

  // Opens a relationship in the Advisor panel regardless of whether it's
  // currently in the loaded top-25 work queue — needed for search results
  // that point at someone who fell out of the synthesized queue (e.g. an
  // opted-out relationship), which previously had genuinely no way to be
  // opened at all once they dropped out of view.
  openRelationshipById: async (relationshipId) => {
    const alreadyLoaded = get().workItems.find((item) => item.relationshipId === relationshipId);
    if (alreadyLoaded) {
      set({ selectedWorkItemId: alreadyLoaded.id });
      return;
    }

    const row = await fetchRelationshipRowById(relationshipId);
    if (!row) return;

    const relationship = mapRowToRelationship(row);
    const workItem = buildWorkItemFromRelationship(row);

    set((state) => ({
      relationships: [relationship, ...state.relationships],
      workItems: [workItem, ...state.workItems],
      selectedWorkItemId: workItem.id,
    }));
  },

  addWorkItem: (workItem) => {
    set((state) => ({
      workItems: [workItem, ...state.workItems]
    }));
  },
}));

// Helper selector to query filtered work items
export const getFilteredWorkItems = (state: ReturnType<typeof useStore.getState>) => {
  let items = state.workItems.filter(item => !item.completed);

  // Search filter
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    items = items.filter(
      item =>
        item.relationship.name.toLowerCase().includes(q) ||
        item.relationship.company.toLowerCase().includes(q) ||
        item.relationship.location.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }

  // Queue tab filter
  if (state.activeQueueTab === 'starred') {
    items = items.filter(item => item.relationship.starred);
  } else if (state.activeQueueTab === 'commitments') {
    items = items.filter(item => item.relationship.isCommitted);
  } else if (state.activeQueueTab === 'completed') {
    return state.completedToday;
  } else if (state.activeQueueTab === 'archived') {
    return [];
  }

  // Category filters
  if (state.activeCategoryFilter !== 'all') {
    items = items.filter(item => item.category === state.activeCategoryFilter);
  }

  return items;
};

// Fires once when this module first loads (i.e. on app startup), fetching
// real data from Supabase and populating the store. No component needs to
// call this — it just happens, the same way the old placeholder arrays
// were just "there" immediately before.
useStore.getState().initialize();
