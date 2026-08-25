import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import './admin-eventer-access.css';


type EventerUser = {
  login: string;
  displayName: string;
  role: string;
  characterId: string;
  eventer: boolean;
  canManageEvents: boolean;
  locked: boolean;
};


type ResponseData = {
  ok: boolean;
  users?: EventerUser[];
  error?: string;
};


const API =
  '/.netlify/functions/admin-eventer-access';


export default function AdminEventerAccess() {
  const [users, setUsers] = useState<EventerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyLogin, setBusyLogin] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API}?t=${Date.now()}`, {
        cache: 'no-store',
      });
      const result: ResponseData = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Не удалось загрузить пользователей');
      }

      setUsers(Array.isArray(result.users) ? result.users : []);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;

    return users.filter(user =>
      [user.displayName, user.login, user.characterId]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [users, query]);

  const setPermission = async (
    user: EventerUser,
    enabled: boolean
  ) => {
    if (user.locked || busyLogin) return;

    setBusyLogin(user.login);
    setError('');

    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          login: user.login,
          enabled,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || 'Не удалось изменить права');
      }

      setUsers(current =>
        current.map(item =>
          item.login === user.login
            ? {
                ...item,
                eventer: enabled,
                canManageEvents: enabled,
              }
            : item
        )
      );
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusyLogin('');
    }
  };

  return (
    <section className="admin-eventer-access">
      <div className="admin-section-heading">
        <div>
          <h2>Права ивентеров</h2>
          <p>
            Ивентер может создавать ивенты, управлять участниками и позже завершать ивенты с наградами и отчётом. Доступ к анкетам, персонажам и журналу администрации он не получает.
          </p>
        </div>

        <button
          type="button"
          className="admin-button"
          onClick={() => void load()}
          disabled={loading}
        >
          Обновить
        </button>
      </div>

      <input
        className="admin-input admin-eventer-search"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Поиск по имени, логину или characterId"
      />

      {error ? (
        <div className="admin-error">{error}</div>
      ) : null}

      {loading ? (
        <div className="admin-empty">Загружаю пользователей…</div>
      ) : (
        <div className="admin-eventer-list">
          {filtered.map(user => (
            <article
              className={`admin-eventer-row ${user.canManageEvents ? 'active' : ''}`}
              key={user.login}
            >
              <div className="admin-eventer-copy">
                <strong>{user.displayName || user.login}</strong>
                <span>@{user.login}</span>
                <small>{user.characterId || 'Без characterId'}</small>
              </div>

              <div className="admin-eventer-state">
                {user.locked ? (
                  <span className="admin-eventer-badge admin-eventer-badge-admin">
                    Администратор · доступ всегда
                  </span>
                ) : (
                  <>
                    <span className="admin-eventer-badge">
                      {user.eventer ? 'Ивентер' : 'Игрок'}
                    </span>

                    <button
                      type="button"
                      className={`admin-button ${user.eventer ? 'admin-button-danger' : 'admin-button-primary'}`}
                      disabled={busyLogin === user.login}
                      onClick={() => void setPermission(user, !user.eventer)}
                    >
                      {busyLogin === user.login
                        ? 'Сохраняю…'
                        : user.eventer
                          ? 'Забрать права'
                          : 'Выдать права'}
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
