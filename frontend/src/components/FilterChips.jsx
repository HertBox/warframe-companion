import React from 'react';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'primes', label: 'Gear' },
  { key: 'mods', label: 'Mods' },
  { key: 'resources', label: 'Resources' },
];

export default function FilterChips({ active, onChange }) {
  return (
    <div className="chips">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          className={`chip ${active === f.key ? 'chip--active' : ''}`}
          onClick={() => onChange(f.key)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
