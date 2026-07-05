# RIOS — Relationship Intelligence Operating System

RIOS (Relationship Intelligence Operating System) is a calm, intelligent relationship operating center designed for founders and business owners managing thousands of peer-level connections. It shifts focus away from traditional channel-based CRM pipelines to center on **Relationships → Commercial Objectives → Stages → Next Actions → AI Guidance**.

This repository hosts the highly faithful, high-fidelity frontend implementation of the **RIOS Command Center**.

## 🎨 Design System & Relationship Interface Guidelines (RIG)

This project strictly adheres to the official **Relationship Interface Guidelines (RIG)** design tokens:
- **Background**: `#09090B` (pure dark obsidian)
- **Radius**: Cards are `14px`, Panels are `18px`, Buttons/Inputs are `10px`
- **Typography**: Paired pairing of **Geist** (interface element weights) and **JetBrains Mono** (technical indicators, timers, and confidence levels)
- **Motion Parameters**: Micro-transitions with Spring dynamics and strict RIG durations (Hover: 150ms, Expand: 250ms, Panel: 300ms, AI Thinking: 500ms)

---

## 📂 Folder Hierarchy Overview

The project is structured like a modular, production-ready SaaS application:

```text
/
├── src/
│   ├── types/               # Strict TypeScript definitions
│   │   └── index.ts
│   ├── lib/                 # Unified Design Tokens and Mock Engine
│   │   ├── colors.ts        # Semantic RIG palette
│   │   ├── spacing.ts       # Cohesive margins & paddings
│   │   ├── radius.ts        # Border-radius specifications
│   │   ├── motion.ts        # Transition spring variables
│   │   ├── typography.ts    # Pairings of Geist & JetBrains Mono
│   │   ├── tokens.ts        # Combined master token export
│   │   └── placeholderData.ts # Raw high-fidelity data objects
│   ├── store/               # Dynamic State Management
│   │   └── useStore.ts      # Zustand client store for lists, checks, and filters
│   ├── components/          # Reusable, highly-modular React components
│   │   ├── layout/          # Layout blocks (Sidebar, Header)
│   │   ├── dashboard/       # Metric cards, Tabs, Category filters
│   │   ├── relationship/    # Mission cards, Bulk Toolbar, Advisor
│   │   └── ui/              # Atom level elements (Avatars, Composer, Dropdowns)
│   ├── App.tsx              # Application shell & Orchestration layout
│   ├── index.css            # Tailwind 4 theme configuration & scrollbars
│   └── main.tsx             # DOM boot entry point
├── package.json             # Scripts & standard React 19 dependencies
├── tsconfig.json            # Strict type resolution rules
└── vite.config.ts           # Bundler and Alias configuration
```

---

## ⚡ Running Locally

To run this application on your local workstation, complete the following commands:

### 1. Install Dependencies
```bash
npm install
```

### 2. Boot the Development Server
```bash
npm run dev
```
This runs the local bundler on `http://localhost:3000`.

### 3. Production Compilation Build
```bash
npm run build
```
Generates production-grade statically optimized assets in the `/dist` directory.

---

## 🧠 Key Interactive Workflows Implemented

1. **Intelligent Work Queue Filtering**: Click on the semantic **Category cards** (Critical, Commitments, Commercial, etc.) or **Tabs** (All Work, Starred) to instantly filter the list with fluid exit and layout transitions.
2. **Select & Load AI Advisor**: Click on any relationship card to load that customer's detail in the **Chief Advisor (Right Panel)**, updating dynamic tags, confidence scores, and action lists.
3. **Automated AI Message Generation**: Click "Generate Message" inside the advisor panel to experience the premium 500ms **AI Thinking** loading state before rendering a contextual draft in the live editable **Composer**.
4. **Interactive Stage Change**: Update a client's pipeline stage interactively on the dot-connector indicators inside both the queue cards and the advisor panel, instantly syncing both elements.
5. **Floating Bulk Operations Bar**: Check multiple checkboxes in the queue list to reveal the sliding **Bulk Toolbar** allowing snoozing, marking complete, or re-assigning stages in bulk.
6. **Smart Briefing & Client Form**: Slide in the real-time AI Morning Briefing popover from the top menu, or create custom relationships via the "Add Relationship" form.
