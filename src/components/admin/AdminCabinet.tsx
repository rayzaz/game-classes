import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import AdminCharacters, {
  type AdminCharacterSummary,
} from './AdminCharacters';

import AdminQuestionnaires from './AdminQuestionnaires';
import AdminEvents from './AdminEvents';
import AdminEventReports from './AdminEventReports';
import AdminEventerAccess from './AdminEventerAccess';
import AdminAuditLog from './AdminAuditLog';
import AdminCalendar from './AdminCalendar';

import './admin.css';


type Props = {
  displayName: string;
  onBack: () => void;
  onOpenCharacter:
    (
      characterId: string
    ) => void;
};


type AdminSection =
  | 'characters'
  | 'questionnaires'
  | 'events'
  | 'reports'
  | 'eventers'
  | 'calendar'
  | 'audit';


type SessionUser = {
  login: string;
  displayName: string;
  role:
    | 'player'
    | 'admin';
  characterId: string;
  cabinetReady: boolean;
};


type SessionResponse = {
  ok: boolean;
  user:
    SessionUser |
    null;
  error?: string;
};


const NAV_ITEMS:
  Array<{
    id: AdminSection;
    label: string;
    icon: string;
  }> = [
    {
      id: 'characters',
      label: 'Персонажи',
      icon: '◇',
    },
    {
      id: 'questionnaires',
      label: 'Анкеты',
      icon: '▤',
    },
    {
      id: 'events',
      label: 'Ивенты',
      icon: '✦',
    },
    {
      id: 'reports',
      label: 'Отчёты ивентеров',
      icon: '≡',
    },
    {
      id: 'eventers',
      label: 'Права ивентеров',
      icon: '◎',
    },
    {
      id: 'calendar',
      label: 'Календарь',
      icon: '◷',
    },
    {
      id: 'audit',
      label: 'Журнал действий',
      icon: '↺',
    },
  ];


export default function AdminCabinet({
  displayName,
  onBack,
  onOpenCharacter,
}: Props) {
  const [
    section,
    setSection
  ] =
    useState<AdminSection>(
      'characters'
    );

  const [
    characters,
    setCharacters
  ] =
    useState<
      AdminCharacterSummary[]
    >(
      []
    );

  const [
    loading,
    setLoading
  ] =
    useState(
      true
    );

  const [
    error,
    setError
  ] =
    useState(
      ''
    );

  const [
    ownCharacterId,
    setOwnCharacterId
  ] =
    useState(
      ''
    );

  const [
    sessionChecked,
    setSessionChecked
  ] =
    useState(
      false
    );


  useEffect(
    () => {
      let cancelled =
        false;

      async function loadSession() {
        try {
          const response =
            await fetch(
              `/.netlify/functions/session?t=${Date.now()}`,
              {
                method:
                  'GET',

                cache:
                  'no-store',
              }
            );

          const result:
            SessionResponse =
              await response
                .json();

          if (
            cancelled
          ) {
            return;
          }

          if (
            response.ok &&
            result?.ok &&
            result.user &&
            result.user.role ===
              'admin'
          ) {
            setOwnCharacterId(
              String(
                result.user
                  .characterId ||
                ''
              )
                .trim()
                .toLowerCase()
            );
          } else {
            setOwnCharacterId(
              ''
            );
          }

        } catch (
          err
        ) {
          console.error(
            'Не удалось определить персонажа администратора:',
            err
          );

          if (
            !cancelled
          ) {
            setOwnCharacterId(
              ''
            );
          }

        } finally {
          if (
            !cancelled
          ) {
            setSessionChecked(
              true
            );
          }
        }
      }

      void loadSession();

      return () => {
        cancelled =
          true;
      };
    },
    []
  );


  useEffect(
    () => {
      let cancelled =
        false;

      async function loadCharacters() {
        setLoading(
          true
        );

        setError(
          ''
        );

        try {
          const response =
            await fetch(
              `/.netlify/functions/admin-characters?t=${Date.now()}`,
              {
                method:
                  'GET',

                cache:
                  'no-store',
              }
            );

          const result:
            {
              ok?: boolean;
              characters?: AdminCharacterSummary[];
              error?: string;
            } =
              await response
                .json();

          if (
            !response.ok ||
            !result?.ok
          ) {
            throw new Error(
              result?.error ||
              'Не удалось загрузить реестр персонажей'
            );
          }

          if (
            !cancelled
          ) {
            setCharacters(
              Array.isArray(
                result.characters
              )
                ? result.characters
                : []
            );
          }

        } catch (
          err
        ) {
          if (
            !cancelled
          ) {
            setError(
              err instanceof Error
                ? err.message
                : String(
                    err
                  )
            );
          }

        } finally {
          if (
            !cancelled
          ) {
            setLoading(
              false
            );
          }
        }
      }

      void loadCharacters();

      return () => {
        cancelled =
          true;
      };
    },
    []
  );


  const activeLabel =
    useMemo(
      () =>
        NAV_ITEMS.find(
          item =>
            item.id ===
            section
        )?.label ||
        'Админ-центр',
      [
        section,
      ]
    );


  return (
    <main className="admin-root">
      <div className="admin-shell">
        <header className="admin-topbar admin-topbar-modern">
          <div className="admin-brand">
            <strong>
              ГосМАГ · Админ-центр
            </strong>

            <span>
              {activeLabel}
            </span>
          </div>

          <div className="admin-topbar-actions">
            <div className="admin-user">
              <span className="admin-user-dot" />

              <span>
                {displayName ||
                  'Администратор'}
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

        <div className="admin-workspace">
          <aside className="admin-sidebar">
            <nav className="admin-sidebar-nav">
              {NAV_ITEMS.map(
                item => (
                  <button
                    key={
                      item.id
                    }
                    type="button"
                    className={`admin-sidebar-button${
                      section ===
                      item.id
                        ? ' active'
                        : ''
                    }`}
                    onClick={() =>
                      setSection(
                        item.id
                      )
                    }
                  >
                    <span aria-hidden="true">
                      {item.icon}
                    </span>

                    <strong>
                      {item.label}
                    </strong>
                  </button>
                )
              )}
            </nav>

            {sessionChecked &&
            ownCharacterId ? (
              <button
                type="button"
                className="admin-sidebar-character"
                onClick={() =>
                  onOpenCharacter(
                    ownCharacterId
                  )
                }
              >
                <span>
                  ✦
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
            {section ===
            'characters' ? (
              <AdminCharacters
                characters={
                  characters
                }
                loading={
                  loading
                }
                error={
                  error
                }
                onOpenCharacter={
                  onOpenCharacter
                }
              />
            ) : null}

            {section ===
            'questionnaires' ? (
              <AdminQuestionnaires />
            ) : null}

            {section ===
            'events' ? (
              <AdminEvents />
            ) : null}

            {section ===
            'reports' ? (
              <AdminEventReports />
            ) : null}

            {section ===
            'eventers' ? (
              <section className="admin-modern-section">
                <div className="admin-section-head">
                  <div>
                    <div className="admin-kicker">
                      ДОСТУП
                    </div>

                    <h2>
                      Права ивентеров
                    </h2>

                    <p>
                      Выдача и отзыв доступа к созданию и проведению ивентов.
                    </p>
                  </div>
                </div>

                <AdminEventerAccess />
              </section>
            ) : null}

            {section ===
            'calendar' ? (
              <AdminCalendar />
            ) : null}

            {section ===
            'audit' ? (
              <AdminAuditLog />
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
