import React from 'react';

export default function Header({ activeCount }) {
  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__icon">◎</span>
        <span className="header__title">Warframe Companion</span>
      </div>
      <span className="header__count">{activeCount} active</span>
    </header>
  );
}
