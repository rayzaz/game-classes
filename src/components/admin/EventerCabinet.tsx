import React from 'react';

import AdminEvents from './AdminEvents';

import './admin.css';


type Props = {
  displayName: string;
  characterId?: string;
  onBack: () => void;
  onOpenOwnCharacter: () => void;
};


export default function EventerCabinet({
  displayName,
  characterId,
  onBack,
  onOpenOwnCharacter,
}: Props) {
  return (
    <main className="admin-root">
      <div className="admin-shell">
        <header className="admin-topbar">
          <div className="admin-brand">
            <strong>ГосМАГ · Центр ивентера</strong>
            <span>Создание и проведение игровых ивентов</span>
          </div>

          <div className="admin-user">
            <span className="admin-user-dot" />
            <span>{displayName || 'Ивентер'}</span>
          </div>
        </header>

        <nav className="admin-nav">
          <button
            type="button"
            className="admin-nav-button active"
          >
            Ивенты
          </button>

          {characterId ? (
            <button
              type="button"
              className="admin-nav-button"
              onClick={onOpenOwnCharacter}
            >
              ✦ Мой персонаж
            </button>
          ) : null}

          <button
            type="button"
            className="admin-button"
            onClick={onBack}
            style={{ marginLeft: 'auto' }}
          >
            ← В каталог
          </button>
        </nav>

        <div className="admin-main">
          <AdminEvents />
        </div>
      </div>
    </main>
  );
}
