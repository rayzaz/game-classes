import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AdminEventerAccess from './AdminEventerAccess';
import './admin-eventer-access.css';
import './admin-role-management.css';

type BankerUser = {
  login: string;
  displayName: string;
  characterId: string;
  banker: boolean;
  locked: boolean;
};
type BankerResponse = {
  ok: boolean;
  users?: BankerUser[];
  warning?: string;
  error?: string;
};
const API = '/.netlify/functions/admin-banker-access';

function BankerRoles() {
  const [users, setUsers] = useState<BankerUser[]>([]);
  const [busyLogin, setBusyLogin] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API}?t=${Date.now()}`, {
        credentials: 'same-origin', cache: 'no-store',
      });
      const data = await response.json() as BankerResponse;
      if (!response.ok || data.ok !== true) {
        throw new Error(data.error || 'Не удалось загрузить роли банкиров');
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
      setWarning(String(data.warning || ''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    return users.filter(item => !needle ||
      `${item.displayName} ${item.login} ${item.characterId}`
        .toLocaleLowerCase('ru').includes(needle));
  }, [users, query]);

  const setBanker = async (item: BankerUser) => {
    if (item.locked || busyLogin) return;
    setBusyLogin(item.login);
    setError('');
    try {
      const response = await fetch(API, {
        method: 'POST', credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({login: item.login, enabled: !item.banker}),
      });
      const data = await response.json() as BankerResponse;
      if (!response.ok || data.ok !== true) {
        throw new Error(data.error || 'Не удалось изменить роль банкира');
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyLogin('');
    }
  };

  return <section className="admin-eventer-access">
    <div className="admin-section-heading">
      <div>
        <h2>Банкиры</h2>
        <p>Выдача и отзыв права начислять и списывать звёзды. Назначение производится по логину пользователя.</p>
      </div>
      <button type="button" className="admin-button" onClick={() => void load()} disabled={loading || Boolean(busyLogin)}>Обновить</button>
    </div>
    <input className="admin-input admin-eventer-search" type="search"
      aria-label="Поиск пользователей для назначения банкира"
      placeholder="Поиск по имени, логину или ID персонажа"
      value={query} onChange={event => setQuery(event.target.value)}/>
    {error ? <div role="alert" className="admin-error">{error}</div> : null}
    {warning ? <div className="admin-role-warning">{warning}</div> : null}
    {loading ? <div className="admin-empty">Загружаю пользователей…</div> :
      filtered.length === 0 ? <div className="admin-empty">Никого не найдено.</div> :
      <div className="admin-eventer-list">
        {filtered.map(item => <article key={item.login}
          className={`admin-eventer-row ${item.banker ? 'active' : ''}`}>
          <div className="admin-eventer-copy">
            <strong>{item.displayName || item.login}</strong>
            <span>@{item.login}</span>
            <small>{item.characterId || 'Без ID персонажа'}</small>
          </div>
          <div className="admin-eventer-state">
            {item.locked ? <span className="admin-eventer-badge admin-eventer-badge-admin">Администратор · доступ всегда</span> : <>
              <span className="admin-eventer-badge">{item.banker ? 'Банкир' : 'Игрок'}</span>
              <button type="button"
                className={`admin-button ${item.banker ? 'admin-button-danger' : 'admin-button-primary'}`}
                disabled={Boolean(busyLogin)}
                onClick={() => void setBanker(item)}>
                {busyLogin === item.login ? 'Сохраняю…' : item.banker ? 'Отозвать роль' : 'Назначить банкиром'}
              </button>
            </>}
          </div>
        </article>)}
      </div>}
  </section>;
}

export default function AdminRoleManagement() {
  const [active, setActive] = useState<'eventers' | 'bankers'>('eventers');
  return <section className="admin-modern-section">
    <div className="admin-section-head"><div>
      <div className="admin-kicker">ДОСТУП</div>
      <h2>Выдача ролей</h2>
      <p>Назначайте права ивентеров и банкиров в одном месте. Обычным игрокам этот раздел недоступен.</p>
    </div></div>
    <div className="admin-role-tabs" role="tablist" aria-label="Тип роли">
      <button type="button" role="tab" aria-selected={active === 'eventers'}
        className={`admin-button ${active === 'eventers' ? 'admin-button-primary' : ''}`}
        onClick={() => setActive('eventers')}>Ивентеры</button>
      <button type="button" role="tab" aria-selected={active === 'bankers'}
        className={`admin-button ${active === 'bankers' ? 'admin-button-primary' : ''}`}
        onClick={() => setActive('bankers')}>Банкиры</button>
    </div>
    <div role="tabpanel" aria-label={active === 'eventers' ? 'Выдача роли ивентера' : 'Выдача роли банкира'}>
      {active === 'eventers' ? <AdminEventerAccess /> : <BankerRoles />}
    </div>
  </section>;
}
