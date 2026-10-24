import React, {useCallback, useEffect, useMemo, useState} from 'react';
import type {LoginUser} from './Portal';
import './bank.css';

type StarAccount = {
  characterId: string;
  name: string;
  stars: number;
  version: number;
};
type StarsResponse = {
  ok: boolean;
  available?: boolean;
  stale?: boolean;
  readOnly?: boolean;
  count?: number;
  observedAt?: string;
  canManageBank?: boolean;
  accounts?: StarAccount[];
  ownAccount?: StarAccount | null;
  error?: string;
};
type Props = {user: LoginUser; onBack: () => void};
const API = '/.netlify/functions/bank-stars-v2';
const formatStars = (stars: number) => `${new Intl.NumberFormat('ru-RU').format(stars)} ⭐`;

export default function BankPage({user, onBack}: Props) {
  const [accounts, setAccounts] = useState<StarAccount[]>([]);
  const [mine, setMine] = useState<StarAccount | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [observedAt, setObservedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`${API}?t=${Date.now()}`, {method:'GET',cache:'no-store'});
      const data = await response.json() as StarsResponse;
      if (!response.ok || data.ok !== true) throw new Error(data.error || 'Не удалось загрузить звёзды');
      if (!data.available) throw new Error(data.stale
        ? 'Данные звёзд устарели. Дождитесь синхронизации с Google.'
        : 'Новый банк звёзд пока не синхронизирован с Google.');
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setMine(data.ownAccount || null);
      setCanManage(data.canManageBank === true);
      setTotalCount(data.count || 0);
      setObservedAt(data.observedAt || '');
      setError('');
    } catch (err) {
      // Never show stale balances as current, even after a failed refresh.
      setAccounts([]);
      setMine(null);
      setTotalCount(0);
      setObservedAt('');
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {void load(true);}, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('ru');
    return accounts.filter(x => !search ||
      `${x.name} ${x.characterId}`.toLocaleLowerCase('ru').includes(search));
  }, [accounts, query]);

  const lastSync = observedAt ? new Date(observedAt).toLocaleString('ru-RU',
    {dateStyle:'short',timeStyle:'short'}) : '—';

  return (
    <main className="star-bank-root">
      <div className="star-bank-shell">
        <header className="star-bank-topbar">
          <div>
            <div className="star-bank-kicker">ГОСУДАРСТВЕННЫЕ МАГИЧЕСКИЕ УСЛУГИ</div>
            <h1>Банк звёзд</h1>
            <p>Новые счета в Google: звёзды и их собственная история. Юли здесь не используются.</p>
          </div>
          <div className="star-bank-topbar-actions">
            {canManage ? <span className="star-bank-role-badge">★ Банкир</span> : null}
            <button className="star-bank-secondary-button" type="button" onClick={onBack}>← На главную</button>
          </div>
        </header>

        <section className="star-bank-summary-grid">
          <article className="star-bank-summary-card star-bank-summary-primary">
            <span>Ваш счёт</span>
            <strong>{mine ? formatStars(mine.stars) : '—'}</strong>
            <small>{mine ? mine.name : 'Счёт по вашему ID не найден или данные недоступны'}</small>
          </article>
          <article className="star-bank-summary-card">
            <span>Счета звёзд</span>
            <strong>{totalCount || '—'}</strong>
            <small>{canManage ? 'Полный список доступен банкиру' : 'Обычный игрок видит только свой счёт'}</small>
          </article>
          <article className="star-bank-summary-card">
            <span>Последняя синхронизация с Google</span>
            <strong className="star-bank-summary-date">{lastSync}</strong>
            <small>Автоматическое обновление страницы каждые 30 секунд</small>
          </article>
        </section>

        {error ? <div className="star-bank-message star-bank-message-error" role="alert">{error}</div> : null}
        <section className="star-bank-directory">
          <div className="star-bank-directory-head">
            <div>
              <h2>Счета звёзд</h2>
              <p>На этапе B2 доступен только просмотр. Начисление и списание включим после защиты записи и истории операций в Google.</p>
            </div>
            <div className="star-bank-directory-tools">
              {canManage ? <input type="search" aria-label="Поиск персонажа" value={query}
                onChange={event => setQuery(event.target.value)} placeholder="Поиск по имени или ID"/> : null}
              <button type="button" className="star-bank-secondary-button" onClick={() => void load()}>
                Обновить
              </button>
            </div>
          </div>
          {loading ? <div className="star-bank-empty">Загрузка счетов…</div> : null}
          {!loading && !error && visible.length === 0 ?
            <div className="star-bank-empty">Нет доступных счетов. Проверьте привязку персонажа.</div> : null}
          {!error && !loading ? <div className="star-bank-list">
            {visible.map((account, index) =>
              <article key={account.characterId} className={`star-bank-row${account.characterId === user.characterId ? ' is-own':''}`}>
                <div className="star-bank-number">{index + 1}</div>
                <div className="star-bank-account-copy">
                  <strong>{account.name}</strong>
                  <span>{account.characterId === user.characterId ? 'Ваш счёт' : account.characterId}</span>
                </div>
                <div className="star-bank-balance">{formatStars(account.stars)}</div>
              </article>)}
          </div> : null}
        </section>
      </div>
    </main>
  );
}
