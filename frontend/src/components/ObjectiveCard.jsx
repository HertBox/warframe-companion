import React, { useState } from 'react';
import { typeMeta } from '../typeMeta.js';

function rarityClass(rarity) {
  const r = (rarity || '').toLowerCase();
  if (r === 'rare') return 'rarity rarity--rare';
  if (r === 'uncommon') return 'rarity rarity--uncommon';
  if (r === 'common') return 'rarity rarity--common';
  return '';
}

function PartRow({ objectiveId, part, onToggle }) {
  const [showMats, setShowMats] = useState(false);
  const mats = part.materials || [];

  // Sub-line: relic·rarity·drop% for primes, source(node)·drop% for normals.
  const hasSub =
    part.relic || part.source || part.rarity || part.dropChance || part.sourceNode;

  return (
    <div className={`part-item ${part.obtained ? 'part--obtained' : ''}`}>
      <div className="part">
        <button
          className={`checkbox ${part.obtained ? 'checkbox--on' : ''}`}
          aria-label={`Marcar ${part.name}`}
          onClick={() => onToggle(objectiveId, part.id, !part.obtained)}
        >
          {part.obtained ? '✓' : ''}
        </button>
        <div className="part__body">
          <span className="part__name">{part.name}</span>
          {hasSub && (
            <span className="part__sub">
              {part.relic && <span>{part.relic}</span>}
              {!part.relic && part.source && <span>{part.source}</span>}
              {part.rarity && (
                <>
                  {' · '}
                  <span className={rarityClass(part.rarity)}>{part.rarity}</span>
                </>
              )}
              {part.dropChance && <span>{' · '}{part.dropChance}</span>}
              {part.sourceNode && (
                <>
                  {' · '}
                  <span className="part__node">{part.sourceNode}</span>
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {mats.length > 0 && (
        <>
          <button
            className="part__mats-toggle"
            onClick={() => setShowMats((s) => !s)}
          >
            Materiales de esta parte ({mats.length}) {showMats ? '▲' : '▼'}
          </button>
          {showMats && (
            <div className="part__mats">
              {mats.map((m, i) => (
                <div className="part__mat" key={`${m.name}-${i}`}>
                  <span>
                    <span
                      className={`part__mat-name ${
                        m.name === 'Credits' ? 'part__mat-name--credits' : ''
                      }`}
                    >
                      {m.name}
                    </span>
                    {m.whereFarm && (
                      <span className="part__mat-farm">{m.whereFarm}</span>
                    )}
                  </span>
                  {m.quantity ? (
                    <span className="part__mat-qty">
                      {m.quantity.toLocaleString()}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ObjectiveCard({
  objective,
  onPartToggle,
  onMarkObtained,
  onRemove,
  onRefresh,
}) {
  const [confirming, setConfirming] = useState(false);
  const [showMaterials, setShowMaterials] = useState(false);

  const meta = typeMeta(objective.type);
  const parts = objective.parts || [];
  const sources = objective.sources || [];
  const materials = objective.materials || [];

  const obtainedCount = parts.filter((p) => p.obtained).length;
  const progress = parts.length ? (obtainedCount / parts.length) * 100 : 0;

  return (
    <div className="card">
      {/* Header row */}
      <div className="card__head">
        {objective.image ? (
          <img
            className="card__thumb"
            src={objective.image}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <span className="card__type-icon">{meta.icon}</span>
        )}
        <span className="card__name">{objective.name}</span>
        <span className={`badge badge--${meta.badge}`}>{meta.label}</span>
        <button
          className="card__menu-btn"
          aria-label="Opciones"
          onClick={() => setConfirming((c) => !c)}
        >
          ⋮
        </button>
      </div>

      {/* Inline confirm / menu row */}
      {confirming && (
        <div className="card__confirm">
          <span className="card__confirm-label">¿Completado o eliminar?</span>
          <button
            className="btn-sm btn-gold"
            onClick={() => {
              setConfirming(false);
              onRefresh?.(objective.id);
            }}
          >
            ↻
          </button>
          <button
            className="btn-sm btn-success"
            onClick={() => {
              setConfirming(false);
              onRemove?.(objective.id, 'completed');
            }}
          >
            Completado ✓
          </button>
          <button
            className="btn-sm btn-danger"
            onClick={() => {
              setConfirming(false);
              onRemove?.(objective.id, 'deleted');
            }}
          >
            Eliminar ✕
          </button>
        </div>
      )}

      {/* Parts */}
      {parts.length > 0 && (
        <>
          <div className="parts">
            {parts.map((part) => (
              <PartRow
                key={part.id}
                objectiveId={objective.id}
                part={part}
                onToggle={onPartToggle}
              />
            ))}
          </div>

          <div className="progress">
            <div className="progress__track">
              <div className="progress__fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress__label">
              {obtainedCount} / {parts.length} partes
            </span>
          </div>
        </>
      )}

      {/* Sources (mods) */}
      {sources.length > 0 && (
        <div className="sources">
          {sources.map((src, i) => (
            <div className="source" key={i}>
              <span className="source__loc">
                {src.description || src.location}
              </span>
              {src.rotation && <span className="rotation-chip">{src.rotation}</span>}
              {src.dropChance && (
                <span className="source__chance">{src.dropChance}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Mark-obtained button for parts-less items (mods, market-bought gear) */}
      {parts.length === 0 && (
        <button
          className={`btn-sm ${objective.obtained ? 'btn-success' : 'btn-gold'}`}
          style={{ alignSelf: 'flex-start' }}
          onClick={() => onMarkObtained(objective.id, !objective.obtained)}
        >
          {objective.obtained ? '✓ Obtenido' : 'Marcar como obtenido'}
        </button>
      )}

      {/* Materials (aggregate across parts) */}
      {materials.length > 0 && (
        <div>
          <button
            className="materials__toggle"
            onClick={() => setShowMaterials((s) => !s)}
          >
            Materiales totales ({materials.length}) {showMaterials ? '▲' : '▼'}
          </button>
          {showMaterials && (
            <div className="materials__grid">
              {materials.map((mat, i) => (
                <div className="material" key={`${mat.name}-${i}`}>
                  <div className="material__row">
                    <span className="material__name">{mat.name}</span>
                    {mat.quantity ? (
                      <span className="material__qty">
                        {mat.quantity.toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                  {mat.whereFarm && (
                    <span className="material__farm">{mat.whereFarm}</span>
                  )}
                  {mat.sharedWith && mat.sharedWith.length > 0 && (
                    <span className="material__shared">
                      También en: {mat.sharedWith.join(', ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
