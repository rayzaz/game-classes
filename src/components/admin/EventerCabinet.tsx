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
        <header className="admin-topbar admin-topbar-modern">
          <div className="admin-brand">
            <strong>
              ГосМАГ · Центр ивентера
            </strong>

            <span>
              Ивенты
            </span>
          </div>

          <div className="admin-topbar-actions">
            <div className="admin-user">
              <span className="admin-user-dot" />
              <span>
                {displayName ||
                  'Ивентер'}
              </span>
            </div>

            <button
              type="button"
              className="admin-button"
              onClick={
                onBack
              }
            >
              ← На главную
            </button>
          </div>
        </header>

        <div className="admin-workspace admin-workspace-eventer">
          <aside className="admin-sidebar">
            <nav className="admin-sidebar-nav">
              <button
                type="button"
                className="admin-sidebar-button active"
              >
                <span aria-hidden="true">
                  ✦
                </span>

                <strong>
                  Ивенты
                </strong>
              </button>
            </nav>

            {characterId ? (
              <button
                type="button"
                className="admin-sidebar-character"
                onClick={
                  onOpenOwnCharacter
                }
              >
                <span>
                  ◇
                </span>

                <div>
                  <strong>
                    Мой персонаж
                  </strong>

                  <small>
                    Открыть личное дело
                  </small>
                </div>
              </button>
            ) : null}
          </aside>

          <div className="admin-main admin-main-modern">
            <AdminEvents />
          </div>
        </div>
      </div>
    </main>
  );
}
