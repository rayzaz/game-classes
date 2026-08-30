import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import CLASSES from './data/merged';

import ClassCard from './components/ClassCard';
import WorldCalendarBadge from './components/WorldCalendarBadge';
import PortalHome from './components/PortalHome';
import CharacterRankings from './components/CharacterRankings';
import NpcDirectory from './components/NpcDirectory';
import './components/class-catalog.css';

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
  | 'home'
  | 'catalog'
  | 'rankings'
  | 'npcs'
  | 'cabinet'
  | 'admin'
  | 'eventer';


type CabinetView =
  | 'cabinet'
  | 'events';


type PortalNavigationSnapshot = {
  page: AppPage;
  adminCharacterId: string | null;
  cabinetInitialView: CabinetView;
};


const PORTAL_NAVIGATION_STORAGE_KEY =
  'gosmag.portal.navigation.v1';


function readPortalNavigation(): PortalNavigationSnapshot {
  const fallback: PortalNavigationSnapshot = {
    page: 'home',
    adminCharacterId: null,
    cabinetInitialView: 'cabinet',
  };

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw =
      window.sessionStorage.getItem(
        PORTAL_NAVIGATION_STORAGE_KEY
      );

    if (!raw) {
      return fallback;
    }

    const parsed =
      JSON.parse(raw) as Partial<PortalNavigationSnapshot>;

    const allowedPages: AppPage[] = [
      'home',
      'catalog',
      'rankings',
      'npcs',
      'cabinet',
      'admin',
      'eventer',
    ];

    return {
      page:
        parsed.page &&
        allowedPages.includes(parsed.page)
          ? parsed.page
          : 'home',
      adminCharacterId:
        typeof parsed.adminCharacterId === 'string' &&
        parsed.adminCharacterId.trim()
          ? parsed.adminCharacterId.trim()
          : null,
      cabinetInitialView:
        parsed.cabinetInitialView === 'events'
          ? 'events'
          : 'cabinet',
    };
  } catch {
    return fallback;
  }
}


function writePortalNavigation(
  snapshot: PortalNavigationSnapshot
) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(
      PORTAL_NAVIGATION_STORAGE_KEY,
      JSON.stringify(snapshot)
    );
  } catch {
    // Навигация не должна ломать приложение, если storage недоступен.
  }
}


function playerCabinetViewStorageKey(
  characterId: string,
  adminView: boolean
) {
  return `gosmag.player.view.v1:${
    adminView ? 'admin' : 'self'
  }:${characterId}`;
}


function rememberPlayerCabinetView(
  characterId: string,
  adminView: boolean,
  view: 'cabinet' | 'events' | 'family'
) {
  if (typeof window === 'undefined' || !characterId) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      playerCabinetViewStorageKey(characterId, adminView),
      view
    );
  } catch {
    // Не критично.
  }
}


function allowedPageForUser(
  wantedPage: AppPage,
  user: LoginUser | null
): AppPage {
  if (wantedPage === 'home' || wantedPage === 'catalog') {
    return wantedPage;
  }

  if (!user) {
    return 'home';
  }

  if (wantedPage === 'admin') {
    return user.role === 'admin'
      ? 'admin'
      : 'home';
  }

  if (wantedPage === 'eventer') {
    return user.permissions?.canManageEvents
      ? 'eventer'
      : 'home';
  }

  if (wantedPage === 'cabinet') {
    return user.characterId
      ? 'cabinet'
      : 'home';
  }

  return wantedPage;
}


const INITIAL_PORTAL_NAVIGATION =
  readPortalNavigation();


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
      INITIAL_PORTAL_NAVIGATION.page
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
      INITIAL_PORTAL_NAVIGATION.adminCharacterId
    );


  const [
    cabinetInitialView,
    setCabinetInitialView,
  ] =
    useState<
      'cabinet' |
      'events'
    >(
      INITIAL_PORTAL_NAVIGATION.cabinetInitialView
    );


  useEffect(
    () => {
      writePortalNavigation({
        page,
        adminCharacterId,
        cabinetInitialView,
      });
    },
    [
      page,
      adminCharacterId,
      cabinetInitialView,
    ]
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

              setPage(
                current =>
                  allowedPageForUser(
                    current,
                    result.user
                  )
              );

              if (
                result.user.role !==
                'admin'
              ) {
                setAdminCharacterId(
                  null
                );
              }

            } else {
              setActiveUser(
                null
              );

              setAdminCharacterId(
                null
              );

              setPage(
                current =>
                  current === 'catalog'
                    ? 'catalog'
                    : 'home'
              );
            }

          } catch (
            error
          ) {
            console.error(
              'session restore error:',
              error
            );

            if (!cancelled) {
              setActiveUser(
                null
              );

              setAdminCharacterId(
                null
              );

              setPage(
                current =>
                  current === 'catalog'
                    ? 'catalog'
                    : 'home'
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

  const goHome =
    () => {
      setAdminCharacterId(
        null
      );

      setCabinetInitialView(
        'cabinet'
      );

      setPage(
        'home'
      );
    };


  const openPortalHome =
    () => {
      if (
        !activeUser
      ) {
        setPortalOpen(
          true
        );

        return;
      }

      goHome();
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


        try {
          window.sessionStorage.removeItem(
            PORTAL_NAVIGATION_STORAGE_KEY
          );
        } catch {
          // Не критично.
        }


        setPage(
          'home'
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


  const [
    catalogQuery,
    setCatalogQuery,
  ] =
    useState(
      ''
    );


  const [
    catalogPickerOpen,
    setCatalogPickerOpen,
  ] =
    useState(
      false
    );


  useEffect(
    () => {
      if (!catalogPickerOpen) {
        return;
      }

      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setCatalogPickerOpen(false);
        }
      };

      window.addEventListener('keydown', onKeyDown);

      return () => {
        document.body.style.overflow = previousOverflow;
        window.removeEventListener('keydown', onKeyDown);
      };
    },
    [catalogPickerOpen]
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


            const query =
              catalogQuery
                .trim()
                .toLowerCase();


            const searchText =
              [
                item.name,
                item.role,
                ...(Array.isArray(item.tags) ? item.tags : []),
              ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();


            const okQuery =
              !query ||
              searchText.includes(query);


            return (
              okRoles &&
              okCx &&
              okQuery
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


        const showPlaceholder =
          Boolean(placeholder) &&
          !catalogQuery.trim() &&
          selRoles.size === 0 &&
          selCx.size === 0;


        const result =
          showPlaceholder && placeholder
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
        catalogQuery,
      ]
    );


  if (
    !sessionChecked &&
    page !== 'home' &&
    page !== 'catalog'
  ) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: theme === 'dark' ? '#11101a' : '#f7f5fb',
          color: theme === 'dark' ? '#f4f0ff' : '#201a2a',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <strong style={{ fontSize: '20px' }}>
            Восстанавливаем раздел…
          </strong>
          <div style={{ marginTop: '8px', opacity: 0.7 }}>
            Проверяем активную сессию
          </div>
        </div>
      </main>
    );
  }


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
          goHome
        }

        onOpenCharacter={
          characterId => {
            rememberPlayerCabinetView(
              characterId,
              true,
              'cabinet'
            );

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
    activeUser?.permissions
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
          goHome
        }
        onOpenOwnCharacter={() => {
          if (
            activeUser.characterId
          ) {
            rememberPlayerCabinetView(
              activeUser.characterId,
              activeUser.role === 'admin',
              'cabinet'
            );
          }

          setCabinetInitialView(
            'cabinet'
          );

          setPage(
            'cabinet'
          );
        }}
      />
    );
  }


  /* =========================
     РЕЙТИНГ ПЕРСОНАЖЕЙ
     ========================= */

  if (
    page ===
      'rankings' &&
    activeUser
  ) {
    return (
      <CharacterRankings
        ownCharacterId={
          activeUser.characterId
        }
        onBack={
          goHome
        }
      />
    );
  }


  /* =========================
     КАТАЛОГ НПС
     ========================= */

  if (
    page ===
      'npcs' &&
    activeUser
  ) {
    return (
      <NpcDirectory
        onBack={
          goHome
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
    activeUser &&
    activeUser.characterId
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

          adminView={
            activeUser.role ===
            'admin'
          }

          initialView={
            cabinetInitialView
          }

          onBack={
            goHome
          }
        />
      </div>
    );
  }


  /* =========================
     ГЛАВНАЯ ПОРТАЛА
     ========================= */

  if (
    page ===
      'home'
  ) {
    return (
      <>
        <PortalHome
          user={
            activeUser
          }

          sessionChecked={
            sessionChecked
          }

          theme={
            theme
          }

          onLogin={() =>
            setPortalOpen(
              true
            )
          }

          onLogout={() =>
            void logoutAccount()
          }

          onToggleTheme={() =>
            setTheme(
              theme === 'dark'
                ? 'light'
                : 'dark'
            )
          }

          onOpenCatalog={() =>
            setPage(
              'catalog'
            )
          }

          onOpenCharacter={() => {
            if (
              !activeUser
                ?.characterId
            ) {
              return;
            }

            rememberPlayerCabinetView(
              activeUser.characterId,
              activeUser.role === 'admin',
              'cabinet'
            );

            setCabinetInitialView(
              'cabinet'
            );

            setPage(
              'cabinet'
            );
          }}

          onOpenEvents={() => {
            if (
              !activeUser
                ?.characterId
            ) {
              return;
            }

            rememberPlayerCabinetView(
              activeUser.characterId,
              activeUser.role === 'admin',
              'events'
            );

            setCabinetInitialView(
              'events'
            );

            setPage(
              'cabinet'
            );
          }}

          onOpenRankings={() => {
            if (!activeUser) {
              return;
            }

            setPage(
              'rankings'
            );
          }}

          onOpenNpcs={() => {
            if (!activeUser) {
              return;
            }

            setPage(
              'npcs'
            );
          }}

          onOpenAdmin={() => {
            if (
              activeUser
                ?.role !==
              'admin'
            ) {
              return;
            }

            setAdminCharacterId(
              null
            );

            setPage(
              'admin'
            );
          }}

          onOpenEventer={() => {
            if (
              !activeUser
                ?.permissions
                ?.canManageEvents
            ) {
              return;
            }

            setPage(
              'eventer'
            );
          }}
        />

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

              setCabinetInitialView(
                'cabinet'
              );

              setPage(
                'home'
              );
            }
          }
        />
      </>
    );
  }


  /* =========================
     КАТАЛОГ
     ========================= */

  const hasCatalogFilters =
    Boolean(
      catalogQuery.trim() ||
      selRoles.size ||
      selCx.size
    );

  const activeCatalogFilters =
    selRoles.size +
    selCx.size +
    (catalogQuery.trim() ? 1 : 0);


  return (
    <main className="class-catalog-shell">
      <div className="class-catalog-inner">
        <header className="class-catalog-topbar">
          <button
            type="button"
            className="class-catalog-back"
            onClick={goHome}
          >
            ← Главная
          </button>

          <WorldCalendarBadge />
        </header>

        <section className="class-catalog-heading">
          <div className="class-catalog-heading-main">
            <h1>Каталог классов</h1>
            <span className="class-catalog-count">
              {list.length} из {total}
            </span>
          </div>

          <div className="class-catalog-heading-meta">
            <button
              type="button"
              className="class-catalog-picker-button"
              onClick={() => setCatalogPickerOpen(true)}
            >
              Подбор
              {activeCatalogFilters ? <b>{activeCatalogFilters}</b> : null}
            </button>
          </div>
        </section>

        {hasCatalogFilters ? (
          <div className="class-catalog-active-filters" aria-label="Активные фильтры">
            {Array.from(selCx).map(value => (
              <button
                key={`cx-${value}`}
                type="button"
                className="class-catalog-active-filter"
                onClick={() => toggleSet(setSelCx, value)}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}
                <b aria-hidden="true">×</b>
              </button>
            ))}

            {Array.from(selRoles).map(value => (
              <button
                key={`role-${value}`}
                type="button"
                className="class-catalog-active-filter"
                onClick={() => toggleSet(setSelRoles, value)}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}
                <b aria-hidden="true">×</b>
              </button>
            ))}

            <button
              type="button"
              className="class-catalog-active-reset"
              onClick={() => {
                setCatalogQuery('');
                setSelRoles(new Set());
                setSelCx(new Set());
              }}
            >
              Сбросить
            </button>
          </div>
        ) : null}

        <section className="class-catalog-grid" aria-label="Классы">
          {list.length ? (
            list.map((item: any) => (
              <ClassCard
                key={item.id ?? item.name}
                {...item}
              />
            ))
          ) : (
            <div className="class-catalog-empty">
              Ничего не найдено. Измени параметры подбора.
            </div>
          )}
        </section>
      </div>

      {catalogPickerOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="class-catalog-picker-overlay"
              role="presentation"
              onMouseDown={event => {
                if (event.currentTarget === event.target) {
                  setCatalogPickerOpen(false);
                }
              }}
            >
              <section
                className="class-catalog-picker-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Подбор класса"
              >
                <button
                  type="button"
                  className="class-catalog-picker-close"
                  onClick={() => setCatalogPickerOpen(false)}
                  aria-label="Закрыть подбор"
                >
                  ×
                </button>

                <header className="class-catalog-picker-head">
                  <span>Фильтры</span>
                  <h2>Подбор класса</h2>
                </header>

                <div className="class-catalog-picker-sections">
                  <section className="class-catalog-picker-group">
                    <h3>Сложность</h3>
                    <div className="class-catalog-picker-chips">
                      {COMPLEXITIES.map(complexity => {
                        const key = complexity.toLowerCase();
                        const active = selCx.has(key);

                        return (
                          <button
                            key={complexity}
                            type="button"
                            className={`class-catalog-picker-chip ${active ? 'active' : ''}`}
                            onClick={() => toggleSet(setSelCx, key)}
                          >
                            {complexity.charAt(0).toUpperCase() + complexity.slice(1)}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="class-catalog-picker-group">
                    <h3>Роль в группе</h3>
                    <div className="class-catalog-picker-chips">
                      {ALL.map(role => {
                        const key = role.toLowerCase();
                        const active = selRoles.has(key);

                        return (
                          <button
                            key={role}
                            type="button"
                            className={`class-catalog-picker-chip ${active ? 'active' : ''}`}
                            onClick={() => toggleSet(setSelRoles, key)}
                          >
                            {role}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>

                <footer className="class-catalog-picker-actions">
                  {hasCatalogFilters ? (
                    <button
                      type="button"
                      className="class-catalog-picker-reset"
                      onClick={() => {
                        setCatalogQuery('');
                        setSelRoles(new Set());
                        setSelCx(new Set());
                      }}
                    >
                      Сбросить
                    </button>
                  ) : <span />}

                  <button
                    type="button"
                    className="class-catalog-picker-apply"
                    onClick={() => setCatalogPickerOpen(false)}
                  >
                    Показать {list.length}
                  </button>
                </footer>
              </section>
            </div>,
            document.body
          )
        : null}

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


            setCabinetInitialView(
              'cabinet'
            );

            setPage(
              'home'
            );
          }
        }
      />

    </main>
  );
}