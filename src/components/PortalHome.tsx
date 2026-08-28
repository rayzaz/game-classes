import React from 'react';

import type { LoginUser } from './Portal';
import WorldCalendarBadge from './WorldCalendarBadge';

import './portal-home.css';


type Props = {
  user: LoginUser | null;
  sessionChecked: boolean;
  theme: 'light' | 'dark';

  onLogin: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;

  onOpenCatalog: () => void;
  onOpenCharacter: () => void;
  onOpenEvents: () => void;
  onOpenAdmin: () => void;
  onOpenEventer: () => void;
};


function HomeIcon({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span
      className="portal-home-card-icon"
      aria-hidden
    >
      {children}
    </span>
  );
}


export default function PortalHome({
  user,
  sessionChecked,
  theme,
  onLogin,
  onLogout,
  onToggleTheme,
  onOpenCatalog,
  onOpenCharacter,
  onOpenEvents,
  onOpenAdmin,
  onOpenEventer,
}: Props) {
  const initial =
    (
      user?.displayName ||
      user?.login ||
      '?'
    )
      .trim()
      .charAt(0)
      .toUpperCase();

  const hasCharacter =
    Boolean(
      user?.characterId
        ?.trim()
    );

  return (
    <main className="portal-home-shell">
      <div className="portal-home-ambient" aria-hidden>
        <span className="portal-home-orb portal-home-orb-a" />
        <span className="portal-home-orb portal-home-orb-b" />
        <span className="portal-home-grid" />
      </div>

      <header className="portal-home-header">
        <button
          type="button"
          className="portal-home-brand"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="На начало главной страницы"
        >
          <span className="portal-home-brand-mark">G</span>
          <strong>Гос.Маг.Услуги</strong>
        </button>

        <nav className="portal-home-nav" aria-label="Управление порталом">
          <button
            type="button"
            className="portal-home-theme-button"
            onClick={onToggleTheme}
            title="Сменить тему"
            aria-label="Сменить тему"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          {sessionChecked && user ? (
            <>
              <button
                type="button"
                className="portal-home-user-chip"
                onClick={hasCharacter ? onOpenCharacter : onOpenAdmin}
                title="Открыть свой раздел"
              >
                <span className="portal-home-user-avatar">
                  {initial}
                </span>
                <strong>{user.displayName}</strong>
              </button>

              <button
                type="button"
                className="portal-home-logout"
                onClick={onLogout}
              >
                Выйти
              </button>
            </>
          ) : (
            <button
              type="button"
              className="portal-home-login-small"
              onClick={onLogin}
              disabled={!sessionChecked}
            >
              {sessionChecked ? 'Войти' : 'Загрузка…'}
            </button>
          )}
        </nav>
      </header>

      <section className="portal-home-hero">
        <div className="portal-home-hero-copy">
          {user ? (
            <>
              <h1>
                Добро пожаловать,
                <span> {user.displayName}</span>
              </h1>
              <p>
                Персонаж, ивенты, классы и доступные вам инструменты —
                в одном месте.
              </p>
            </>
          ) : (
            <>
              <h1>
                Игровой портал
                <span> вашего мира.</span>
              </h1>
              <p>
                Персонажи, события, классы и календарь мира.
              </p>

              <div className="portal-home-hero-actions">
                <button
                  type="button"
                  className="portal-home-primary"
                  onClick={onLogin}
                  disabled={!sessionChecked}
                >
                  Войти
                  <span aria-hidden>→</span>
                </button>

                <button
                  type="button"
                  className="portal-home-secondary"
                  onClick={onOpenCatalog}
                >
                  Каталог классов
                </button>
              </div>
            </>
          )}
        </div>

        <div className="portal-home-calendar-card">
          <WorldCalendarBadge />
        </div>
      </section>

      {sessionChecked && user ? (
        <section className="portal-home-dashboard" aria-label="Разделы аккаунта">
          <div className="portal-home-section-head">
            <h2>Ваше пространство</h2>
          </div>

          <div className="portal-home-card-grid">
            {hasCharacter ? (
              <button
                type="button"
                className="portal-home-card portal-home-card-featured"
                onClick={onOpenCharacter}
              >
                <HomeIcon>✦</HomeIcon>

                <span className="portal-home-card-copy">
                  <strong>{user.displayName}</strong>
                  <span>
                    Характеристики, навыки, ресурсы, инвентарь и развитие.
                  </span>
                </span>

                <span className="portal-home-card-arrow" aria-hidden>↗</span>
              </button>
            ) : null}

            {hasCharacter ? (
              <button
                type="button"
                className="portal-home-card"
                onClick={onOpenEvents}
              >
                <HomeIcon>◈</HomeIcon>

                <span className="portal-home-card-copy">
                  <strong>Ивенты</strong>
                  <span>
                    Запись на события, набор предметов и история участия.
                  </span>
                </span>

                <span className="portal-home-card-arrow" aria-hidden>↗</span>
              </button>
            ) : null}

            <button
              type="button"
              className="portal-home-card"
              onClick={onOpenCatalog}
            >
              <HomeIcon>⌘</HomeIcon>

              <span className="portal-home-card-copy">
                <strong>Каталог классов</strong>
                <span>
                  Роли, сложность и описание доступных классов.
                </span>
              </span>

              <span className="portal-home-card-arrow" aria-hidden>↗</span>
            </button>

            {user.permissions?.canManageEvents ? (
              <button
                type="button"
                className="portal-home-card portal-home-card-accent"
                onClick={onOpenEventer}
              >
                <HomeIcon>◆</HomeIcon>

                <span className="portal-home-card-copy">
                  <strong>Управление ивентами</strong>
                  <span>
                    Участники, расход предметов, завершение и награды.
                  </span>
                </span>

                <span className="portal-home-card-arrow" aria-hidden>↗</span>
              </button>
            ) : null}

            {user.role === 'admin' ? (
              <button
                type="button"
                className="portal-home-card portal-home-card-admin"
                onClick={onOpenAdmin}
              >
                <HomeIcon>◇</HomeIcon>

                <span className="portal-home-card-copy">
                  <strong>Админ-центр</strong>
                  <span>
                    Персонажи, анкеты, события, календарь и журнал действий.
                  </span>
                </span>

                <span className="portal-home-card-arrow" aria-hidden>↗</span>
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
