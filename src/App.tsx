// src/App.tsx

import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import CLASSES from './data/merged';

import ClassCard from './components/ClassCard';

import Portal, { type LoginUser } from './components/Portal';

import NeroCabinet from './components/NeroCabinet';

import './styles.css';


/* =========================
   РОЛИ
   ========================= */

function splitRoles(
  input?: string,
  extraTags?: string[]
): string[] {

  const raw =
    (input ?? '')
      .toString();


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
        (t) =>
          t.trim()
      )
      .filter(
        Boolean
      );


  const tags =
    (extraTags ?? [])
      .map(
        (t) =>
          t.trim()
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
    (w: string) =>
      w.length
        ? w[0].toUpperCase() +
          w
            .slice(1)
            .toLowerCase()
        : w;


  const out: string[] =
    [];


  for (
    const w of merged
  ) {

    const key =
      w.toLowerCase();


    if (
      !seen.has(key)
    ) {

      seen.add(key);

      out.push(
        nice(w)
      );
    }
  }


  if (
    out.length > 2 &&
    !out
      .map(
        (x) =>
          x.toLowerCase()
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
  input: unknown
): string[] {

  const mapCx =
    (
      v: string
    ): string | null => {

      const x =
        v.toLowerCase();


      if (
        x === '1' ||
        x.startsWith(
          'низк'
        )
      ) {
        return 'низкая';
      }


      if (
        x === '2' ||
        x.startsWith(
          'средн'
        )
      ) {
        return 'средняя';
      }


      if (
        x === '3' ||
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
      val: string
    ) =>
      val
        .replace(
          /[—–]/g,
          '-'
        )
        .split(
          /(?:\s+|-|,|\/|;|(?:\sи\s))/i
        )
        .map(
          (t) =>
            t.trim()
        )
        .filter(
          Boolean
        );


  let parts: string[] =
    [];


  if (
    Array.isArray(
      input
    )
  ) {

    parts =
      input.flatMap(
        (v) =>
          toTokens(
            String(
              v ?? ''
            )
              .toLowerCase()
              .trim()
          )
      );

  } else {

    const raw =
      String(
        input ?? ''
      )
        .toLowerCase()
        .trim();


    if (!raw) {
      return [];
    }


    parts =
      toTokens(raw);
  }


  const mapped =
    parts
      .map(
        mapCx
      )
      .filter(
        Boolean
      ) as string[];


  return Array.from(
    new Set(
      mapped
    )
  );
}


/* =========================
   APP
   ========================= */

export default function App() {

  /* =========================
     ТЕМА
     ========================= */

  const [
    theme,
    setTheme
  ] =
    useState<
      'light' |
      'dark'
    >(
      'light'
    );


  const [
    fx,
    setFx
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
    setFxKey
  ] =
    useState(0);


  useEffect(() => {

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


    const t =
      saved ??
      (
        prefersDark
          ? 'dark'
          : 'light'
      );


    setTheme(t);


    document
      .documentElement
      .setAttribute(
        'data-theme',
        t
      );

  }, []);


  useEffect(() => {

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

  }, [theme]);


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
        (k) =>
          k + 1
      );


      window.setTimeout(
        () =>
          setTheme(
            target
          ),
        1000
      );


      window.setTimeout(
        () =>
          setFx(
            null
          ),
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
    setPortalOpen
  ] =
    useState(false);


  /* =========================
     ТЕКУЩАЯ СТРАНИЦА
     ========================= */

  const [
    page,
    setPage
  ] =
    useState<
      'catalog' |
      'cabinet'
    >(
      'catalog'
    );


  const [
    activeUser,
    setActiveUser
  ] =
    useState<LoginUser | null>(
      null
    );


  /* =========================
     РОЛИ ДЛЯ ФИЛЬТРА
     ========================= */

  const ALL =
    useMemo(() => {

      const rolesSet =
        new Set<string>();


      for (
        const c of
        (
          CLASSES as any[]
        )
      ) {

        const tokens =
          splitRoles(
            c.role,
            c.tags
          );


        if (
          tokens.length > 2 &&
          !tokens
            .map(
              (x) =>
                x.toLowerCase()
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
          const t of tokens
        ) {

          rolesSet.add(
            t
          );
        }
      }


      return Array
        .from(
          rolesSet
        )
        .sort(
          (a, b) =>
            a.localeCompare(
              b,
              'ru'
            )
        );

    }, []);


  const COMPLEXITIES =
    [
      'низкая',
      'средняя',
      'высокая',
    ];


  const [
    selRoles,
    setSelRoles
  ] =
    useState<
      Set<string>
    >(
      new Set()
    );


  const [
    selCx,
    setSelCx
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

      val: string
    ) =>

      setter(
        (prev) => {

          const n =
            new Set(
              prev
            );


          if (
            n.has(val)
          ) {
            n.delete(val);
          } else {
            n.add(val);
          }


          return n;
        }
      );


  /* =========================
     ФИЛЬТРАЦИЯ
     ========================= */

  const {
    list,
    total,
  } =
    useMemo(() => {

      const all =
        CLASSES as any[];


      const placeholder =
        all.find(
          (c) =>
            c.placeholder
        );


      const pass =
        (c: any) => {

          const roleTokens =
            splitRoles(
              c.role,
              c.tags
            );


          const roleSet =
            new Set(
              roleTokens.map(
                (t) =>
                  t.toLowerCase()
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
              (r) =>
                roleSet.has(
                  r.toLowerCase()
                )
            );


          const cxTokens =
            splitComplexity(
              c.complexity
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
              (k) =>
                cxSet.has(
                  k.toLowerCase()
                )
            );


          return (
            okRoles &&
            okCx
          );
        };


      const normal =
        all.filter(
          (c) =>
            !c.placeholder
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

    }, [
      selRoles,
      selCx,
    ]);


  /* =========================
     ВЫХОД ИЗ КАБИНЕТА
     ========================= */

  const leaveCabinet =
    () => {

      fetch(
        '/.netlify/functions/logout',
        {
          method: 'POST',
        }
      ).catch(
        () => {
          // Даже если сеть недоступна,
          // интерфейс всё равно возвращаем в каталог.
        }
      );


      setActiveUser(
        null
      );


      setPage(
        'catalog'
      );
    };


  /* =========================
     ЛИЧНЫЙ КАБИНЕТ

     ВАЖНО:
     мы НИКОГДА не открываем Неро
     просто потому, что кто-то вошёл.
     Сначала смотрим characterId,
     который вернул сервер.
     ========================= */

  if (
    page === 'cabinet' &&
    activeUser
  ) {

    if (
      activeUser.characterId ===
      'nero'
    ) {

      return (

        <div
          className="book nero-mode"
          style={{
            minHeight:
              '100vh',
          }}
        >

          <NeroCabinet
            onBack={
              leaveCabinet
            }
          />

        </div>
      );
    }


    return (

      <div className="book">

        <div
          className="page"
          style={{
            paddingTop: 70,
          }}
        >

          <button
            className="btn"
            onClick={
              leaveCabinet
            }
          >
            ← Назад в каталог
          </button>


          <div
            className="card"
            style={{
              marginTop: 24,
              maxWidth: 620,
            }}
          >

            <h1>
              Кабинет готовится
            </h1>

            <p>
              Вход выполнен как
              {' '}
              <strong>
                {activeUser.displayName}
              </strong>,
              но кабинет этого персонажа
              ещё не подключён к сайту.
            </p>

          </div>

        </div>

      </div>
    );
  }


  /* =========================
     КАТАЛОГ
     ========================= */

  return (

    <div className="book">

      {fx && (

        <div
          className={
            `theme-bloom ${fx}`
          }
          key={fxKey}
          aria-hidden
        >

          <div className="veil" />

          <div className="grain" />

        </div>

      )}


      <div className="page">

        <div
          className="toolbar"
          style={{
            position:
              'relative',

            zIndex:
              1,
          }}
        >

          {/* КНОПКА ПОРТАЛ */}

          <button
            className="btn"
            type="button"
            onClick={
              () =>
                setPortalOpen(
                  true
                )
            }
          >
            🌀 Портал
          </button>


          {/* ТЕМА */}

          {theme === 'dark' ? (

            <button
              className="btn theme-toggle"
              onClick={
                goLight
              }
            >
              Свет ☀️
            </button>

          ) : (

            <button
              className="btn theme-toggle"
              onClick={
                goDark
              }
            >
              Тьма 🌙
            </button>

          )}

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
              (cx) => {

                const key =
                  cx.toLowerCase();


                const on =
                  selCx.has(
                    key
                  );


                return (

                  <button
                    key={cx}

                    className={
                      `chip ${
                        on
                          ? 'active'
                          : ''
                      }`
                    }

                    onClick={
                      () =>
                        toggleSet(
                          setSelCx,
                          key
                        )
                    }

                    title="Фильтр по сложности"
                  >
                    {cx}
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
              (r) => {

                const key =
                  r.toLowerCase();


                const on =
                  selRoles.has(
                    key
                  );


                return (

                  <button
                    key={r}

                    className={
                      `chip ${
                        on
                          ? 'active'
                          : ''
                      }`
                    }

                    onClick={
                      () =>
                        toggleSet(
                          setSelRoles,
                          key
                        )
                    }

                    title="Фильтр по ролям"
                  >
                    {r}
                  </button>

                );
              }
            )}

          </div>

        </details>


        <h1
          style={{
            margin:
              '10px 0 10px',
          }}
        >
          Каталог классов · найдено{' '}
          {list.length}{' '}
          из{' '}
          {total}
        </h1>


        <div className="grid">

          {list.map(
            (c: any) => (

              <ClassCard
                key={
                  c.id ??
                  c.name
                }
                {...c}
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

        onClose={
          () =>
            setPortalOpen(
              false
            )
        }

        onLoginSuccess={
          (
            user
          ) => {

            setPortalOpen(
              false
            );


            setActiveUser(
              user
            );


            setPage(
              'cabinet'
            );
          }
        }
      />

    </div>
  );
}