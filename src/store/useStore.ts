import { create } from 'zustand';
import { Relationship, WorkItem, RelationshipCategory, RelationshipStage } from '../types/index.ts';
import { fetchTopRelationships, fetchTodaysWorkItems, completeRelationshipAction } from '../lib/domain/relationships';

interface RIOSState {
  relationships: Relationship[];
  workItems: WorkItem[];
  selectedWorkItemId: string | null;
  selectedWorkItemIds: string[]; // For bulk operations
  activeQueueTab: 'work-queue' | 'all' | 'starred' | 'commitments';
  activeCategoryFilter: 'all' | RelationshipCategory;
  searchQuery: string;
  isGeneratingMessage: boolean;
  generatedMessage: string;
  isLoading: boolean;
  loadError: string | null;

  // Actions
  initialize: () => Promise<void>;
  selectWorkItem: (id: string | null) => void;
  toggleSelectWorkItemForBulk: (id: string) => void;
  selectAllWorkItems: (checked: boolean) => void;
  clearBulkSelection: () => void;
  setQueueTab: (tab: 'work-queue' | 'all' | 'starred' | 'commitments') => void;
  setCategoryFilter: (category: 'all' | RelationshipCategory) => void;
  setSearchQuery: (query: string) => void;
  completeWorkItem: (id: string) => void;
  snoozeWorkItem: (id: string) => void;
  updateStage: (relationshipId: string, stage: RelationshipStage) => void;
  bulkComplete: () => void;
  bulkSnooze: () => void;
  bulkChangeStage: (stage: RelationshipStage) => void;
  generateAIMessage: (workItemId: string) => Promise<void>;
  clearGeneratedMessage: () => void;
  addRelationship: (relationship: Relationship) => void;
  addWorkItem: (workItem: WorkItem) => void;
}

export const useStore = create<RIOSState>((set, get) => ({
  relationships: [],
  workItems: [],
  selectedWorkItemId: null,
  selectedWorkItemIds: [],
  activeQueueTab: 'work-queue',
  activeCategoryFilter: 'all',
  searchQuery: '',
  isGeneratingMessage: false,
  generatedMessage: '',
  isLoading: true,
  loadError: null,

  initialize: async () => {
    set({ isLoading: true, loadError: null });
    try {
      const [relationships, workItems] = await Promise.all([
        fetchTopRelationships(200),
        fetchTodaysWorkItems(25),
      ]);
      set({
        relationships,
        workItems,
        selectedWorkItemId: null, // nothing auto-selected — user chooses explicitly
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to load RIOS data from Supabase:', err);
      set({ isLoading: false, loadError: err instanceof Error ? err.message : 'Failed to load data' });
    }
  },

  selectWorkItem: (id) => {
    set({ selectedWorkItemId: id, generatedMessage: '' });
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
    set((state) => ({
      workItems: state.workItems.map((item) => {
        if (item.id === id) {
          // Push scheduled action back
          const [hours, minutesAndPeriod] = item.dueTime.split(':');
          const [minutes, period] = minutesAndPeriod.split(' ');
          let newHours = parseInt(hours) + 2;
          if (newHours > 12) newHours = newHours - 12;
          return {
            ...item,
            dueTime: `${String(newHours).padStart(2, '0')}:${minutes} ${period}`
          };
        }
        return item;
      })
    }));
  },

  updateStage: (relationshipId, stage) => {
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
    const { selectedWorkItemIds, workItems } = get();
    const relIdsToUpdate = workItems
      .filter(item => selectedWorkItemIds.includes(item.id))
      .map(item => item.relationshipId);

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
  },

  generateAIMessage: async (workItemId) => {
    const workItem = get().workItems.find(item => item.id === workItemId);
    if (!workItem) return;
    
    set({ isGeneratingMessage: true, generatedMessage: '' });
    
    // Simulate premium AI generation delay as defined in RIG (500ms AI thinking)
    await new Promise(resolve => setTimeout(resolve, 600));

    const rel = workItem.relationship;
    let draft = '';
    
    if (workItem.category === 'commitment') {
      draft = `Subject: Quotation: Metro Line 6 Project - Orascom Construction\n\nDear Ahmed,\n\nI hope you are having a productive week.\n\nAs promised yesterday, I have finalized our comprehensive pricing proposal and technical outline for the Metro Line 6 project.\n\nYou'll find the detailed quotation along with our customized case study on previous high-capacity urban transit implementations attached below.\n\nLet's schedule a brief 10-minute call tomorrow afternoon to run through the specific cost-optimizations we've integrated.\n\nBest regards,\nAtif A.\nOwner, RIOS`;
    } else if (workItem.category === 'commercial') {
      draft = `Hi ${rel.name.split(' ')[0]},\n\nHope all is well. I wanted to follow up on the proposal we discussed last week for ${rel.company}.\n\nWe have received feedback from our engineering team that we can expedite the delivery schedule by two weeks to align with your Q3 milestones.\n\nLet me know if you have 5 minutes for a quick alignment on LinkedIn or a brief call today.\n\nBest,\nAtif`;
    } else if (workItem.category === 'building') {
      draft = `Hi ${rel.name.split(' ')[0]},\n\nIt was great chatting about your contract milestones during our last session. I've compiled the draft clauses our legal counsel recommended to resolve the IP ownership questions you raised.\n\nWould love to get your thoughts before we finalize. Let me know if we can review this today.\n\nBest regards,\nAtif`;
    } else {
      draft = `Hi ${rel.name.split(' ')[0]},\n\nJust came across JLL's regional real-estate expansion report. Incredible insights on the Dubai Marina developments!\n\nIt reminded me of your team's objective to expand the hospitality portfolio. Let's catch up sometime soon for a coffee.\n\nWarmly,\nAtif`;
    }

    set({ isGeneratingMessage: false, generatedMessage: draft });
  },

  clearGeneratedMessage: () => {
    set({ generatedMessage: '' });
  },

  addRelationship: (relationship) => {
    set((state) => ({
      relationships: [relationship, ...state.relationships]
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
    items = items.filter(item => item.category === 'commitment');
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
