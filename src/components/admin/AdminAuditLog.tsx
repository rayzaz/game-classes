import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';


/* =========================
   ТИП ЗАПИСИ ЖУРНАЛА
   ========================= */

type AuditEntry = {
  id: string;

  createdAt: string;

  admin?: {
    login?: string;
    name?: string;
  };

  action?: string;

  target?: {
    type?: string;
    id?: string;
    name?: string;
  };

  details?: string;
};


type AuditResponse = {
  ok: boolean;

  entries?: AuditEntry[];

  total?: number;

  error?: string;
};


/* =========================
   НАЗВАНИЯ ДЕЙСТВИЙ
   ========================= */

function actionTitle(
  action?: string
) {

  switch (
    action
  ) {

    case 'ADMIN_LOGIN':
      return 'Вход в админ-центр';

    case 'ADMIN_LOGOUT':
      return 'Выход из админ-центра';

    case 'VIEW_CHARACTER':
      return 'Просмотр персонажа';

    case 'VIEW_QUESTIONNAIRE':
      return 'Просмотр анкеты';

    case 'EDIT_QUESTIONNAIRE':
      return 'Изменение анкеты';

    case 'CREATE_EVENT':
      return 'Создание ивента';

    case 'EDIT_EVENT':
      return 'Изменение ивента';

    case 'ADD_EVENT_MEMBER':
      return 'Добавление участника';

    case 'REMOVE_EVENT_MEMBER':
      return 'Удаление участника';

    case 'SEND_NOTIFICATION':
      return 'Отправка уведомления';

    default:
      return (
        action ||
        'Действие администратора'
      );
  }
}


/* =========================
   ДАТА
   ========================= */

function formatDate(
  value?: string
) {

  if (!value) {
    return '—';
  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return value;
  }


  return new Intl.DateTimeFormat(
    'ru-RU',
    {
      day:
        '2-digit',

      month:
        '2-digit',

      year:
        'numeric',

      hour:
        '2-digit',

      minute:
        '2-digit',

      second:
        '2-digit',
    }
  )
    .format(
      date
    );
}


/* =========================
   ЖУРНАЛ
   ========================= */

export default function AdminAuditLog() {

  const [
    entries,
    setEntries
  ] =
    useState<
      AuditEntry[]
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
    search,
    setSearch
  ] =
    useState(
      ''
    );


  const [
    adminFilter,
    setAdminFilter
  ] =
    useState(
      'all'
    );


  /* =========================
     ЗАГРУЗКА
     ========================= */

  const loadLog =
    useCallback(
      async () => {

        setLoading(
          true
        );

        setError(
          ''
        );


        try {

          const response =
            await fetch(
              `/.netlify/functions/admin-audit-log?t=${Date.now()}`,
              {
                method:
                  'GET',

                cache:
                  'no-store',
              }
            );


          let result:
            AuditResponse |
            null =
              null;


          try {

            result =
              await response.json();

          } catch {

            result =
              null;
          }


          if (
            !response.ok ||
            !result?.ok
          ) {

            throw new Error(
              result?.error ||
              'Не удалось загрузить журнал'
            );
          }


          setEntries(
            Array.isArray(
              result.entries
            )
              ? result.entries
              : []
          );

        } catch (
          err: any
        ) {

          setError(
            err?.message ||
            String(
              err
            )
          );

        } finally {

          setLoading(
            false
          );
        }
      },
      []
    );


  useEffect(
    () => {

      loadLog();

    },
    [
      loadLog,
    ]
  );


  /* =========================
     СПИСОК АДМИНОВ
     ========================= */

  const admins =
    useMemo(
      () => {

        const map =
          new Map<
            string,
            string
          >();


        for (
          const entry of entries
        ) {

          const login =
            String(
              entry.admin?.login ||
              ''
            )
              .trim();


          if (!login) {
            continue;
          }


          const name =
            String(
              entry.admin?.name ||
              login
            );


          map.set(
            login,
            name
          );
        }


        return Array.from(
          map.entries()
        )
          .sort(
            (
              a,
              b
            ) =>
              a[1]
                .localeCompare(
                  b[1],
                  'ru'
                )
          );

      },
      [
        entries,
      ]
    );


  /* =========================
     ФИЛЬТРАЦИЯ
     ========================= */

  const filtered =
    useMemo(
      () => {

        const query =
          search
            .trim()
            .toLowerCase();


        return entries.filter(
          entry => {

            const login =
              String(
                entry.admin?.login ||
                ''
              );


            if (
              adminFilter !==
                'all' &&
              login !==
                adminFilter
            ) {

              return false;
            }


            if (!query) {
              return true;
            }


            const haystack = [

              entry.admin?.name,

              entry.admin?.login,

              actionTitle(
                entry.action
              ),

              entry.action,

              entry.target?.type,

              entry.target?.id,

              entry.target?.name,

              entry.details,

            ]
              .filter(
                Boolean
              )
              .join(
                ' '
              )
              .toLowerCase();


            return haystack.includes(
              query
            );
          }
        );

      },
      [
        entries,
        search,
        adminFilter,
      ]
    );


  return (

    <section className="admin-audit">

      {/* =========================
          ЗАГОЛОВОК
          ========================= */}

      <div className="admin-section-head">

        <div>

          <div className="admin-eyebrow">
            БЕЗОПАСНОСТЬ
          </div>

          <h2>
            Журнал действий
          </h2>

          <p>
            История входов и действий
            администраторов ГосМАГ-услуг.
          </p>

        </div>


        <button
          type="button"
          className="admin-button"
          onClick={
            loadLog
          }
          disabled={
            loading
          }
        >

          {
            loading
              ? 'Обновляем…'
              : '↻ Обновить'
          }

        </button>

      </div>


      {/* =========================
          ФИЛЬТРЫ
          ========================= */}

      <div className="admin-audit-tools">

        <label className="admin-search">

          <span>
            Поиск
          </span>

          <input
            type="search"
            value={
              search
            }
            onChange={
              event =>
                setSearch(
                  event.target.value
                )
            }
            placeholder="Админ, действие, персонаж..."
          />

        </label>


        <label className="admin-audit-filter">

          <span>
            Администратор
          </span>

          <select
            value={
              adminFilter
            }
            onChange={
              event =>
                setAdminFilter(
                  event.target.value
                )
            }
          >

            <option value="all">
              Все администраторы
            </option>


            {
              admins.map(
                ([
                  login,
                  name
                ]) => (

                  <option
                    key={
                      login
                    }
                    value={
                      login
                    }
                  >
                    {name}
                  </option>

                )
              )
            }

          </select>

        </label>

      </div>


      {/* =========================
          СОСТОЯНИЯ
          ========================= */}

      {
        loading &&
        entries.length ===
          0
          ? (

            <div className="admin-empty-state">

              <span className="admin-empty-symbol">
                ✦
              </span>

              <strong>
                Загружаем журнал...
              </strong>

            </div>

          )
          : null
      }


      {
        error
          ? (

            <div className="admin-error-state">

              <strong>
                Не удалось загрузить журнал
              </strong>

              <p>
                {error}
              </p>

            </div>

          )
          : null
      }


      {
        !loading &&
        !error &&
        entries.length ===
          0
          ? (

            <div className="admin-empty-state">

              <span className="admin-empty-symbol">
                ◌
              </span>

              <strong>
                Журнал пока пуст
              </strong>

              <p>
                Первые записи появятся
                после действий администраторов.
              </p>

            </div>

          )
          : null
      }


      {
        !error &&
        entries.length >
          0 &&
        filtered.length ===
          0
          ? (

            <div className="admin-empty-state">

              <span className="admin-empty-symbol">
                ⌕
              </span>

              <strong>
                По этому фильтру ничего нет
              </strong>

            </div>

          )
          : null
      }


      {/* =========================
          ЗАПИСИ
          ========================= */}

      {
        !error &&
        filtered.length >
          0
          ? (

            <div className="admin-audit-list">

              {
                filtered.map(
                  entry => (

                    <article
                      className="admin-audit-entry"
                      key={
                        entry.id
                      }
                    >

                      <div className="admin-audit-time">
                        {
                          formatDate(
                            entry.createdAt
                          )
                        }
                      </div>


                      <div className="admin-audit-body">

                        <div className="admin-audit-entry-top">

                          <strong>
                            {
                              entry.admin?.name ||
                              entry.admin?.login ||
                              'Администратор'
                            }
                          </strong>


                          <span className="admin-audit-action">
                            {
                              actionTitle(
                                entry.action
                              )
                            }
                          </span>

                        </div>


                        {
                          entry.target?.name ||
                          entry.target?.id
                            ? (

                              <div className="admin-audit-target">

                                Объект:{' '}

                                <strong>
                                  {
                                    entry.target?.name ||
                                    entry.target?.id
                                  }
                                </strong>

                              </div>

                            )
                            : null
                        }


                        {
                          entry.details
                            ? (

                              <div className="admin-audit-details">
                                {
                                  entry.details
                                }
                              </div>

                            )
                            : null
                        }


                        <div className="admin-audit-meta">

                          {
                            entry.admin?.login
                              ? (
                                  <span>
                                    @{entry.admin.login}
                                  </span>
                                )
                              : null
                          }


                          {
                            entry.action
                              ? (
                                  <span>
                                    {entry.action}
                                  </span>
                                )
                              : null
                          }


                          {
                            entry.target?.id
                              ? (
                                  <span>
                                    ID: {entry.target.id}
                                  </span>
                                )
                              : null
                          }

                        </div>

                      </div>

                    </article>

                  )
                )
              }

            </div>

          )
          : null
      }

    </section>
  );
}