import React, { useEffect, useState, useCallback } from 'react';
import { fetchCompleted, readdCompleted } from '../api.js';

// `refreshKey` changes whenever the active list mutates so we re-pull.
export default function CompletedSection({ refreshKey, onReadd, onToast }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    try {
      setItems(await fetchCompleted());
    } catch (err) {
      onToast?.(err.message || 'No se pudo cargar completados', 'error');
    }
  }, [onToast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function handleReadd(id) {
    try {
      const obj = await readdCompleted(id);
      onToast?.(`${obj.name} re-agregado`, 'success');
      setItems((prev) => prev.filter((i) => i.id !== id));
      onReadd?.(obj);
    } catch (err) {
      onToast?.(err.message || 'No se pudo re-agregar', 'error');
    }
  }

  if (items.length === 0) return null;

  return (
    <div>
      <button className="section-toggle" onClick={() => setOpen((o) => !o)}>
        Completados ({items.length}) {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="completed-list">
          {items.map((item) => (
            <div className="completed-item" key={item.id}>
              <span className="completed-item__check">✓</span>
              <span className="completed-item__name">{item.name}</span>
              <span className="completed-item__date">
                {item.completedAt
                  ? new Date(item.completedAt).toLocaleDateString()
                  : ''}
              </span>
              <button
                className="btn-sm btn-teal"
                onClick={() => handleReadd(item.id)}
              >
                + Re-agregar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
