import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Loader2, Check } from 'lucide-react';

type OrgSettings = {
  id: string;
  name: string;
  subscription_tier: string;
  ai_analysis_model: string;
  ai_draft_model: string;
  daily_new_touch_cap: number;
  daily_sweep_hour_utc: number;
  daily_sweep_minute_utc: number;
  default_goal: string;
  advisor_coaching_level: string;
};

const AI_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini — Fast · Affordable · Recommended' },
  { value: 'gpt-4o', label: 'GPT-4o — Premium · Best quality · ~15× cost' },
];

const COACHING_LEVELS = [
  { value: 'Foundational', label: 'Foundational — explain the fundamentals, more scaffolding' },
  { value: 'Developing', label: 'Developing — building strategy and nuance' },
  { value: 'Proficient', label: 'Proficient — refining executive polish' },
  { value: 'Executive', label: 'Executive — sharp strategic sparring, no hand-holding' },
];

const GOALS = [
  'Commercial Discovery','Repeat Business','Strategic Partnership',
  'Funding','Recruitment','Vendor Qualification',
];

function utcToIST(hour: number, minute: number): string {
  const total = hour * 60 + minute + 330;
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'} IST`;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-zinc-500 mb-3">{title}</div>
    {children}
  </div>
);

const Row = ({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 py-3 border-b border-white/[0.04] last:border-0">
    <div className="flex-1 min-w-0">
      <div className="text-xs font-medium text-zinc-200">{label}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">{sub}</div>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const ModelSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="bg-zinc-900 border border-white/10 rounded-lg text-[11px] text-zinc-200 px-2.5 py-1.5 focus:outline-none focus:border-rios-purple/40 transition-all"
  >
    {AI_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
  </select>
);

const CoachingLevelSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="bg-zinc-900 border border-white/10 rounded-lg text-[11px] text-zinc-200 px-2.5 py-1.5 focus:outline-none focus:border-rios-purple/40 transition-all"
  >
    {COACHING_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
  </select>
);

export const SettingsScreen: React.FC = () => {
  const [s, setS] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from('organisations')
      .select('id,name,subscription_tier,ai_analysis_model,ai_draft_model,daily_new_touch_cap,daily_sweep_hour_utc,daily_sweep_minute_utc,default_goal,advisor_coaching_level')
      .limit(1).single()
      .then(({ data, error }) => {
        if (!error && data) setS(data as OrgSettings);
        setLoading(false);
      });
  }, []);

  const patch = (key: keyof OrgSettings, value: any) =>
    setS((prev) => prev ? { ...prev, [key]: value } : prev);

  async function save() {
    if (!s) return;
    setSaving(true);
    const { error } = await supabase.from('organisations').update({
      ai_analysis_model: s.ai_analysis_model,
      ai_draft_model: s.ai_draft_model,
      daily_new_touch_cap: s.daily_new_touch_cap,
      daily_sweep_hour_utc: s.daily_sweep_hour_utc,
      daily_sweep_minute_utc: s.daily_sweep_minute_utc,
      default_goal: s.default_goal,
      advisor_coaching_level: s.advisor_coaching_level,
    }).eq('id', s.id);
    setSaving(false);
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 text-zinc-600 animate-spin" /></div>;
  if (!s) return <div className="flex-1 flex items-center justify-center text-xs text-zinc-600">Failed to load settings.</div>;

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-xl">
        <h1 className="text-base font-semibold text-white mb-1">Settings</h1>
        <p className="text-xs text-zinc-500 mb-8">Configure your RIOS workspace.</p>

        <div className="space-y-8">

          <Section title="AI Models">
            <Row label="Enrich Contact" sub="LinkedIn profile, company page, and connections extraction">
              <ModelSelect value={s.ai_analysis_model} onChange={(v) => patch('ai_analysis_model', v)} />
            </Row>
            <Row label="Paste Reply & Log Interaction" sub="Conversation parsing, classification, fact extraction">
              <ModelSelect value={s.ai_analysis_model} onChange={(v) => patch('ai_analysis_model', v)} />
            </Row>
            <Row label="Daily Intelligence Recompute" sub="Next best action and stage suggestion after a reply arrives">
              <ModelSelect value={s.ai_analysis_model} onChange={(v) => patch('ai_analysis_model', v)} />
            </Row>
            <Row label="Generate Reply Draft" sub="The actual message draft sent to your contact">
              <ModelSelect value={s.ai_draft_model} onChange={(v) => patch('ai_draft_model', v)} />
            </Row>
          </Section>

          <div className="border-t border-white/[0.05]" />

          <Section title="Advisor Coaching">
            <Row label="Coaching intensity" sub="How hard the Advisor Chat pushes your communication, beyond just drafting messages for you">
              <CoachingLevelSelect value={s.advisor_coaching_level} onChange={(v) => patch('advisor_coaching_level', v)} />
            </Row>
          </Section>

          <div className="border-t border-white/[0.05]" />

          <Section title="Daily Work">
            <Row label="New contacts per day" sub="How many untouched contacts the cron selects each morning">
              <input
                type="number" min={1} max={200} value={s.daily_new_touch_cap}
                onChange={(e) => patch('daily_new_touch_cap', parseInt(e.target.value) || 50)}
                className="w-20 bg-zinc-900 border border-white/10 rounded-lg text-xs text-zinc-200 px-2.5 py-1.5 text-center focus:outline-none focus:border-rios-purple/40"
              />
            </Row>
            <Row
              label="Morning sweep time"
              sub={`Currently ${utcToIST(s.daily_sweep_hour_utc, s.daily_sweep_minute_utc)} · UTC ${String(s.daily_sweep_hour_utc).padStart(2,'0')}:${String(s.daily_sweep_minute_utc).padStart(2,'0')}`}
            >
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min={0} max={23} value={s.daily_sweep_hour_utc}
                  onChange={(e) => patch('daily_sweep_hour_utc', parseInt(e.target.value) || 0)}
                  className="w-14 bg-zinc-900 border border-white/10 rounded-lg text-xs text-zinc-200 px-2 py-1.5 text-center focus:outline-none focus:border-rios-purple/40"
                />
                <span className="text-zinc-600 text-xs">:</span>
                <input
                  type="number" min={0} max={59} step={15} value={s.daily_sweep_minute_utc}
                  onChange={(e) => patch('daily_sweep_minute_utc', parseInt(e.target.value) || 0)}
                  className="w-14 bg-zinc-900 border border-white/10 rounded-lg text-xs text-zinc-200 px-2 py-1.5 text-center focus:outline-none focus:border-rios-purple/40"
                />
                <span className="text-[10px] text-zinc-600">UTC</span>
              </div>
            </Row>
            <Row label="Cadence schedule" sub="7 → 15 → 21 → 30 → 45 days">
              <span className="text-[9px] font-mono text-zinc-600 bg-zinc-900 border border-white/5 px-2 py-1 rounded">Coming soon</span>
            </Row>
          </Section>

          <div className="border-t border-white/[0.05]" />

          <Section title="Account">
            <Row label="Organisation"><span className="text-xs text-zinc-400">{s.name}</span></Row>
            <Row label="Subscription tier">
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-500 bg-zinc-900 border border-white/10 px-2.5 py-1 rounded-full">{s.subscription_tier}</span>
            </Row>
            <Row label="Default relationship goal" sub="Applied to new relationships unless overridden">
              <select
                value={s.default_goal}
                onChange={(e) => patch('default_goal', e.target.value)}
                className="bg-zinc-900 border border-white/10 rounded-lg text-[11px] text-zinc-200 px-2.5 py-1.5 focus:outline-none focus:border-rios-purple/40"
              >
                {GOALS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Row>
          </Section>

        </div>

        <div className="mt-10 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-rios-purple text-white text-xs font-semibold hover:bg-rios-purple/90 transition-all disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saved && <Check className="w-3.5 h-3.5" />}
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};
