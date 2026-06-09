import React from 'react';

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'primes', label: 'Primes' },
  { key: 'mods', label: 'Mods' },
  { key: 'resources', label: 'Recursos' },
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
