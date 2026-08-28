import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import CLASSES from './data/merged';

import ClassCard from './components/ClassCard';
import WorldCalendarBadge from './components/WorldCalendarBadge';

import Portal, {
  type LoginUser,
} from './components/Portal';

import PlayerCabinet from './components/PlayerCabinet';

import AdminCabinet from './components/admin/AdminCabinet';
import EventerCabinet from './components/admin/EventerCabinet';

import './styles.css';
import './account.css';


/* =========================
   РОЛИ КЛАССОВ
   ========================= */

function splitRoles(
  input?: string,
  extraTags?: string[]
): string[] {
  const raw =
    (
      input ??
      ''
    ).toString();


  const s =
    raw.replace(
      /[—–]/g,
      '-'
    );


  const parts =
    s
      .split(
        /(?:\s+|-|,|\/|;|(?:\sи\s))/i
      )
      .map(
        value =>
          value.trim()
      )
      .filter(
        Boolean
      );


  const tags =
    (
      extraTags ??
      []
    )
      .map(
        value =>
          value.trim()
      )
      .filter(
        Boolean
      );


  const merged = [
    ...parts,
    ...tags,
  ];


  const seen =
    new Set<string>();


  const nice =
    (
      word:
        string
    ) =>
      word.length
        ? (
            word[0].toUpperCase() +
            word
              .slice(1)
              .toLowerCase()
          )
        : word;


  const out:
    string[] =
      [];


  for (
    const word of
    merged
  ) {
    const key =
      word.toLowerCase();


    if (
      !seen.has(
        key
      )
    ) {
      seen.add(
        key
      );


      out.push(
        nice(
          word
        )
      );
    }
  }


  if (
    out.length >
      2 &&
    !out
      .map(
        item =>
          item.toLowerCase()
      )
      .includes(
        'гибрид'
      )
  ) {
    out.push(
      'Гибрид'
    );
  }


  return out;
}


/* =========================
   СЛОЖНОСТЬ
   ========================= */

function splitComplexity(
  input:
    unknown
): string[] {
  const mapCx =
    (
      value:
        string
    ):
      string |
      null => {
      const x =
        value.toLowerCase();


      if (
        x ===
          '1' ||
        x.startsWith(
          'низк'
        )
      ) {
        return 'низкая';
      }


      if (
        x ===
          '2' ||
        x.startsWith(
          'средн'
        )
      ) {
        return 'средняя';
      }


      if (
        x ===
          '3' ||
        x.startsWith(
          'высо'
        )
      ) {
        return 'высокая';
      }


      return null;
    };


  const toTokens =
    (
      value:
        string
    ) =>
      value
        .replace(
          /[—–]/g,
          '-'
        )
        .split(
          /(?:\s+|-|,|\/|;|(?:\sи\s))/i
        )
        .map(
          token =>
            token.trim()
        )
        .filter(
          Boolean
        );


  let parts:
    string[] =
      [];


  if (
    Array.isArray(
      input
    )
  ) {
    parts =
      input.flatMap(
        value =>
          toTokens(
            String(
              value ??
              ''
            )
              .toLowerCase()
              .trim()
          )
      );

  } else {
    const raw =
      String(
        input ??
        ''
      )
        .toLowerCase()
        .trim();


    if (!raw) {
      return [];
    }


    parts =
      toTokens(
        raw
      );
  }


  const mapped =
    parts
      .map(
        mapCx
      )
      .filter(
        Boolean
      ) as
      string[];


  return Array.from(
    new Set(
      mapped
    )
  );
}


/* =========================
   СТРАНИЦА
   ========================= */

type AppPage =
  | 'catalog'
  | 'cabinet'
  | 'admin'
  | 'eventer';


type SessionResponse = {
  ok: boolean;

  user:
    LoginUser |
    null;

  error?: string;
};


/* =========================
   APP
   ========================= */

export default function App() {

  /* =========================
     ТЕМА
     ========================= */

  const [
    theme,
    setTheme,
  ] =
    useState<
      'light' |
      'dark'
    >(
      'light'
    );


  const [
    fx,
    setFx,
  ] =
    useState<
      'light' |
      'dark' |
      null
    >(
      null
    );


  const [
    fxKey,
    setFxKey,
  ] =
    useState(
      0
    );


  useEffect(
    () => {
      const saved =
        localStorage.getItem(
          'theme'
        ) as
          | 'light'
          | 'dark'
          | null;


      const prefersDark =
        window
          .matchMedia?.(
            '(prefers-color-scheme: dark)'
          )
          .matches;


      const nextTheme =
        saved ??
        (
          prefersDark
            ? 'dark'
            : 'light'
        );


      setTheme(
        nextTheme
      );


      document
        .documentElement
        .setAttribute(
          'data-theme',
          nextTheme
        );
    },
    []
  );


  useEffect(
    () => {
      document
        .documentElement
        .setAttribute(
          'data-theme',
          theme
        );


      localStorage.setItem(
        'theme',
        theme
      );
    },
    [
      theme,
    ]
  );


  const startTransition =
    (
      target:
        'light' |
        'dark'
    ) => {
      setFx(
        target
      );


      setFxKey(
        current =>
          current +
          1
      );


      window.setTimeout(
        () => {
          setTheme(
            target
          );
        },
        1000
      );


      window.setTimeout(
        () => {
          setFx(
            null
          );
        },
        2100
      );
    };


  const goLight =
    () =>
      startTransition(
        'light'
      );


  const goDark =
    () =>
      startTransition(
        'dark'
      );


  /* =========================
     ПОРТАЛ
     ========================= */

  const [
    portalOpen,
    setPortalOpen,
  ] =
    useState(
      false
    );


  /* =========================
     СТРАНИЦА
     ========================= */

  const [
    page,
    setPage,
  ] =
    useState<AppPage>(
      'catalog'
    );


  const [
    activeUser,
    setActiveUser,
  ] =
    useState<
      LoginUser |
      null
    >(
      null
    );


  const [
    sessionChecked,
    setSessionChecked,
  ] =
    useState(
      false
    );


  const [
    adminCharacterId,
    setAdminCharacterId,
  ] =
    useState<
      string |
      null
    >(
      null
    );


  /* =========================
     ВОССТАНОВЛЕНИЕ СЕССИИ
     ========================= */

  useEffect(
    () => {
      let cancelled =
        false;


      const restore =
        async () => {
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
                await response.json();


            if (
              cancelled
            ) {
              return;
            }


            if (
              response.ok &&
              result.ok &&
              result.user
            ) {
              setActiveUser(
                result.user
              );

            } else {
              setActiveUser(
                null
              );
            }

          } catch (
            error
          ) {
            console.error(
              'session restore error:',
              error
            );

          } finally {
            if (
              !cancelled
            ) {
              setSessionChecked(
                true
              );
            }
          }
        };


      void restore();


      return () => {
        cancelled =
          true;
      };
    },
    []
  );


  /* =========================
     НАВИГАЦИЯ
     ========================= */

  const goToCatalog =
    () => {
      /*
        Просто возвращаемся
        в каталог.

        Аккаунт остаётся
        авторизован.
      */

      setAdminCharacterId(
        null
      );


      setPage(
        'catalog'
      );
    };


  const openPrivateArea =
    () => {
      if (
        !activeUser
      ) {
        setPortalOpen(
          true
        );

        return;
      }


      setAdminCharacterId(
        null
      );


      if (
        activeUser.role ===
        'admin'
      ) {
        setPage(
          'admin'
        );

      } else if (
        activeUser.permissions
          ?.canManageEvents
      ) {
        setPage(
          'eventer'
        );

      } else {
        setPage(
          'cabinet'
        );
      }
    };


  const logoutAccount =
    async () => {
      try {
        await fetch(
          '/.netlify/functions/logout',
          {
            method:
              'POST',
          }
        );

      } catch (
        error
      ) {
        console.error(
          'logout error:',
          error
        );

      } finally {
        setPortalOpen(
          false
        );


        setAdminCharacterId(
          null
        );


        setActiveUser(
          null
        );


        setPage(
          'catalog'
        );
      }
    };


  /* =========================
     РОЛИ ДЛЯ ФИЛЬТРА
     ========================= */

  const ALL =
    useMemo(
      () => {
        const rolesSet =
          new Set<string>();


        for (
          const item of
          (
            CLASSES as
            any[]
          )
        ) {
          const tokens =
            splitRoles(
              item.role,
              item.tags
            );


          if (
            tokens.length >
              2 &&
            !tokens
              .map(
                value =>
                  value.toLowerCase()
              )
              .includes(
                'гибрид'
              )
          ) {
            tokens.push(
              'Гибрид'
            );
          }


          for (
            const token of
            tokens
          ) {
            rolesSet.add(
              token
            );
          }
        }


        return Array
          .from(
            rolesSet
          )
          .sort(
            (
              a,
              b
            ) =>
              a.localeCompare(
                b,
                'ru'
              )
          );
      },
      []
    );


  const COMPLEXITIES = [
    'низкая',
    'средняя',
    'высокая',
  ];


  const [
    selRoles,
    setSelRoles,
  ] =
    useState<
      Set<string>
    >(
      new Set()
    );


  const [
    selCx,
    setSelCx,
  ] =
    useState<
      Set<string>
    >(
      new Set()
    );


  const toggleSet =
    (
      setter:
        React.Dispatch<
          React.SetStateAction<
            Set<string>
          >
        >,

      value:
        string
    ) => {
      setter(
        previous => {
          const next =
            new Set(
              previous
            );


          if (
            next.has(
              value
            )
          ) {
            next.delete(
              value
            );

          } else {
            next.add(
              value
            );
          }


          return next;
        }
      );
    };


  /* =========================
     ФИЛЬТРАЦИЯ
     ========================= */

  const {
    list,
    total,
  } =
    useMemo(
      () => {
        const all =
          CLASSES as
          any[];


        const placeholder =
          all.find(
            item =>
              item.placeholder
          );


        const pass =
          (
            item:
              any
          ) => {
            const roleTokens =
              splitRoles(
                item.role,
                item.tags
              );


            const roleSet =
              new Set(
                roleTokens.map(
                  value =>
                    value.toLowerCase()
                )
              );


            if (
              roleTokens.length >
              2
            ) {
              roleSet.add(
                'гибрид'
              );
            }


            const okRoles =
              selRoles.size ===
                0 ||
              Array.from(
                selRoles
              ).every(
                role =>
                  roleSet.has(
                    role.toLowerCase()
                  )
              );


            const cxTokens =
              splitComplexity(
                item.complexity
              );


            const cxSet =
              new Set(
                cxTokens
              );


            const okCx =
              selCx.size ===
                0 ||
              Array.from(
                selCx
              ).every(
                complexity =>
                  cxSet.has(
                    complexity.toLowerCase()
                  )
              );


            return (
              okRoles &&
              okCx
            );
          };


        const normal =
          all.filter(
            item =>
              !item.placeholder
          );


        const filtered =
          normal.filter(
            pass
          );


        const result =
          placeholder
            ? [
                placeholder,
                ...filtered,
              ]
            : filtered;


        const totalCount =
          normal.length +
          (
            placeholder
              ? 1
              : 0
          );


        return {
          list:
            result,

          total:
            totalCount,
        };
      },
      [
        selRoles,
        selCx,
      ]
    );


  /* =========================
     АДМИН ОТКРЫЛ ПЕРСОНАЖА
     ========================= */

  if (
    page ===
      'admin' &&
    activeUser?.role ===
      'admin' &&
    adminCharacterId
  ) {
    return (
      <div
  className={
    adminCharacterId ===
    'nero'
      ? 'book nero-mode'
      : 'book'
  }
  style={{
    minHeight:
      '100vh',
  }}
>
        <PlayerCabinet
          adminView

          characterId={
            adminCharacterId
          }

          onBack={() =>
            setAdminCharacterId(
              null
            )
          }
        />
      </div>
    );
  }


  /* =========================
     АДМИН-ЦЕНТР
     ========================= */

  if (
    page ===
      'admin' &&
    activeUser?.role ===
      'admin'
  ) {
    return (
      <AdminCabinet
        displayName={
          activeUser.displayName
        }

        onBack={
          goToCatalog
        }

        onOpenCharacter={
          characterId => {
            setAdminCharacterId(
              characterId
            );
          }
        }
      />
    );
  }


  /* =========================
     ЦЕНТР ИВЕНТЕРА
     ========================= */

  if (
    page ===
      'eventer' &&
    activeUser?.role ===
      'player' &&
    activeUser.permissions
      ?.canManageEvents
  ) {
    return (
      <EventerCabinet
        displayName={
          activeUser.displayName
        }
        characterId={
          activeUser.characterId
        }
        onBack={
          goToCatalog
        }
        onOpenOwnCharacter={() =>
          setPage(
            'cabinet'
          )
        }
      />
    );
  }


  /* =========================
     ЛИЧНЫЙ КАБИНЕТ ИГРОКА
     ========================= */

  if (
    page ===
      'cabinet' &&
    activeUser?.role ===
      'player'
  ) {
    return (
      <div
  className={
    activeUser.characterId ===
    'nero'
      ? 'book nero-mode'
      : 'book'
  }
  style={{
    minHeight:
      '100vh',
  }}
>
        <PlayerCabinet
          characterId={
            activeUser.characterId
          }

          onBack={
            goToCatalog
          }
        />
      </div>
    );
  }


  /*
    Защита от странного состояния:
    если админ каким-то образом
    оказался на page="cabinet",
    отправляем его интерфейсом
    в админ-центр.
  */
  if (
    page ===
      'cabinet' &&
    activeUser?.role ===
      'admin'
  ) {
    return (
      <AdminCabinet
        displayName={
          activeUser.displayName
        }

        onBack={
          goToCatalog
        }

        onOpenCharacter={
          characterId => {
            setAdminCharacterId(
              characterId
            );

            setPage(
              'admin'
            );
          }
        }
      />
    );
  }


  /* =========================
     КАТАЛОГ
     ========================= */

  const accountInitial =
    (
      activeUser
        ?.displayName ||
      activeUser
        ?.login ||
      '?'
    )
      .trim()
      .charAt(
        0
      )
      .toUpperCase();


  return (
    <div className="book">

      {/* =========================
          ЭФФЕКТ СМЕНЫ ТЕМЫ
          ========================= */}

      {fx ? (
        <div
          className={
            `theme-bloom ${fx}`
          }
          key={
            fxKey
          }
          aria-hidden
        >
          <div className="veil" />

          <div className="grain" />
        </div>
      ) : null}


      <div className="page">

        {/* =========================
            ВЕРХНЯЯ ПАНЕЛЬ
            ========================= */}

        <div
          className="toolbar catalog-toolbar"
          style={{
            position:
              'relative',

            zIndex:
              1,
          }}
        >

          <div className="catalog-toolbar-left">

            <button
              className="btn"
              type="button"
              onClick={() =>
                setPortalOpen(
                  true
                )
              }
            >
              🌀 Портал
            </button>


            {theme ===
            'dark' ? (
              <button
                className="btn theme-toggle"
                type="button"
                onClick={
                  goLight
                }
              >
                Свет ☀️
              </button>

            ) : (
              <button
                className="btn theme-toggle"
                type="button"
                onClick={
                  goDark
                }
              >
                Тьма 🌙
              </button>
            )}

          </div>


          {/* =========================
              ИГРОВОЙ КАЛЕНДАРЬ
              ========================= */}

          <WorldCalendarBadge />


          {/* =========================
              АККАУНТ
              ========================= */}

          {!sessionChecked ? (
            <div className="catalog-account-loading">

              <span className="catalog-account-dot" />

              Проверяем аккаунт…

            </div>

          ) : activeUser ? (
            <div className="catalog-account">

              <div className="catalog-account-avatar">
                {accountInitial}
              </div>


              <div className="catalog-account-copy">

                <strong>
                  {activeUser.displayName}
                </strong>

                <span>
                  {activeUser.role ===
                  'admin'
                    ? 'Администратор · авторизован'
                    : activeUser.permissions
                        ?.canManageEvents
                      ? 'Ивентер · авторизован'
                      : 'Аккаунт активен'}
                </span>

              </div>


              <button
                type="button"
                className="btn primary"
                onClick={
                  openPrivateArea
                }
              >
                {activeUser.role ===
                'admin'
                  ? 'Админ-центр'
                  : activeUser.permissions
                      ?.canManageEvents
                    ? 'Центр ивентера'
                    : 'Личный кабинет'}
              </button>


              <button
                type="button"
                className="btn"
                onClick={() =>
                  void logoutAccount()
                }
              >
                Выйти
              </button>

            </div>

          ) : null}

        </div>


        {/* =========================
            СЛОЖНОСТЬ
            ========================= */}

        <details open>

          <summary>
            <strong>
              Сложность
            </strong>
          </summary>


          <div
            className="chips"
            style={{
              marginTop:
                8,
            }}
          >
            {COMPLEXITIES.map(
              complexity => {
                const key =
                  complexity
                    .toLowerCase();


                const active =
                  selCx.has(
                    key
                  );


                return (
                  <button
                    key={
                      complexity
                    }
                    className={
                      `chip ${
                        active
                          ? 'active'
                          : ''
                      }`
                    }
                    onClick={() =>
                      toggleSet(
                        setSelCx,
                        key
                      )
                    }
                    title="Фильтр по сложности"
                  >
                    {complexity}
                  </button>
                );
              }
            )}
          </div>

        </details>


        {/* =========================
            РОЛИ
            ========================= */}

        <details
          open
          style={{
            marginTop:
              10,
          }}
        >
          <summary>
            <strong>
              Роли
            </strong>
          </summary>


          <div
            className="chips"
            style={{
              marginTop:
                8,
            }}
          >
            {ALL.map(
              role => {
                const key =
                  role
                    .toLowerCase();


                const active =
                  selRoles.has(
                    key
                  );


                return (
                  <button
                    key={
                      role
                    }
                    className={
                      `chip ${
                        active
                          ? 'active'
                          : ''
                      }`
                    }
                    onClick={() =>
                      toggleSet(
                        setSelRoles,
                        key
                      )
                    }
                    title="Фильтр по ролям"
                  >
                    {role}
                  </button>
                );
              }
            )}
          </div>

        </details>


        {/* =========================
            КАТАЛОГ
            ========================= */}

        <h1
          style={{
            margin:
              '10px 0 10px',
          }}
        >
          Каталог классов · найдено{' '}

          {list.length}

          {' '}из{' '}

          {total}
        </h1>


        <div className="grid">

          {list.map(
            (
              item:
                any
            ) => (
              <ClassCard
                key={
                  item.id ??
                  item.name
                }
                {...item}
              />
            )
          )}

        </div>

      </div>


      {/* =========================
          ПОРТАЛ
          ========================= */}

      <Portal
        open={
          portalOpen
        }

        onClose={() =>
          setPortalOpen(
            false
          )
        }

        onLoginSuccess={
          user => {
            setPortalOpen(
              false
            );


            setActiveUser(
              user
            );


            setAdminCharacterId(
              null
            );


            if (
              user.role ===
              'admin'
            ) {
              setPage(
                'admin'
              );

            } else {
              setPage(
                'cabinet'
              );
            }
          }
        }
      />

    </div>
  );
}