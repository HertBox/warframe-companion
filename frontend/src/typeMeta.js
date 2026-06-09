// Shared display metadata for objective types (icons + badge styling).
export const TYPE_META = {
  warframe: { icon: '◈', label: 'Warframe', badge: 'warframe' },
  prime_warframe: { icon: '◈', label: 'Prime Warframe', badge: 'prime' },
  weapon: { icon: '⚔', label: 'Weapon', badge: 'weapon' },
  prime_weapon: { icon: '⚔', label: 'Prime Weapon', badge: 'prime' },
  mod: { icon: '◆', label: 'Mod', badge: 'mod' },
  augment_mod: { icon: '◆', label: 'Augment', badge: 'mod' },
  primed_mod: { icon: '◆◆', label: 'Primed', badge: 'primed_mod' },
  blueprint: { icon: '◉', label: 'Blueprint', badge: 'blueprint' },
};

export function typeMeta(type) {
  return TYPE_META[type] || { icon: '◆', label: 'Item', badge: 'mod' };
}

// Map a backend type to a frontend filter bucket.
// All buildable gear (frames + weapons, prime or not) groups under "primes".
export function typeBucket(type) {
  if (
    type === 'warframe' ||
    type === 'weapon' ||
    type === 'prime_warframe' ||
    type === 'prime_weapon' ||
    type === 'blueprint'
  ) {
    return 'primes';
  }
  return 'mods';
}
