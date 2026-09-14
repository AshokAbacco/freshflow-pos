import { presetRange } from '../../lib/dates';
import { Segmented } from '../ui/Segmented';

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

export function RangePicker({ range, onChange }) {
  const activePreset = PRESETS.find((p) => {
    const r = presetRange(p.value);
    return r.from === range.from && r.to === range.to;
  })?.value;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        size="sm"
        ariaLabel="Date range preset"
        value={activePreset ?? ''}
        onChange={(v) => onChange(presetRange(v))}
        options={PRESETS}
      />
      <div className="flex items-center gap-1.5 rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
        <input
          type="date"
          className="h-7 rounded-full border-0 bg-transparent px-1.5 text-desc text-slate-700 focus:outline-none"
          value={range.from}
          max={range.to}
          onChange={(e) => e.target.value && onChange({ ...range, from: e.target.value })}
          aria-label="From date"
        />
        <span className="text-desc text-slate-400">to</span>
        <input
          type="date"
          className="h-7 rounded-full border-0 bg-transparent px-1.5 text-desc text-slate-700 focus:outline-none"
          value={range.to}
          min={range.from}
          onChange={(e) => e.target.value && onChange({ ...range, to: e.target.value })}
          aria-label="To date"
        />
      </div>
    </div>
  );
}
