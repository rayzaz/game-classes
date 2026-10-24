import React, {useCallback, useEffect, useMemo, useState, useRef} from 'react';
import type {LoginUser} from './Portal';
import './bank.css';
import './bank-b3.css';

type StarAccount = {
  characterId: string;
  name: string;
  stars: number;
  version: number;
};
type StarHistoryItem = {
  transactionId: string;
  occurredAt: string;
  characterId: string;
  kind: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  bankerLogin?: string;
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
  historyAvailable?: boolean;
  history?: StarHistoryItem[];
  historyHasMore?: boolean;
  error?: string;
};
type Props = {user: LoginUser; onBack: () => void};
const API = '/.netlify/functions/bank-stars-v2';
const formatStars = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ⭐`;
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU',
    {dateStyle:'short',timeStyle:'short'});
};

const TRANSACTION_API = '/.netlify/functions/bank-stars-operation-v3';
function sourceUrl(reason:string) {
  const match = reason.match(/(?:^|\s)Пост:\s*(https:\/\/\S+)/);
  if(!match) return '';
  try {const url=new URL(match[1]);return url.protocol==='https:' ? url.toString() : '';} catch{return '';}
}

export default function BankPage({onBack}: Props) {
  const [accounts, setAccounts] = useState<StarAccount[]>([]);
  const [mine, setMine] = useState<StarAccount | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [observedAt, setObservedAt] = useState('');
  const [history, setHistory] = useState<StarHistoryItem[]>([]);
  const [historyAvailable, setHistoryAvailable] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId,setSelectedId]=useState('');
  const [opKind,setOpKind]=useState<'credit'|'debit'>('credit');
  const [amount,setAmount]=useState('');
  const [postUrl,setPostUrl]=useState('');
  const [reason,setReason]=useState('');
  const [actionBusy,setActionBusy]=useState(false);
  const [actionMessage,setActionMessage]=useState('');
  // Reuse the same id for retries after an uncertain network result.
  const pendingId=useRef('');
  const invalidateRequest=()=>{pendingId.current='';setActionMessage('');};
  const submitOperation=async (event:React.FormEvent)=>{
    event.preventDefault();
    if(!canManage || actionBusy || !selectedId) return;
    const qty=Number(amount);
    if(!Number.isSafeInteger(qty)||qty<1||qty>1000000){setActionMessage('Укажи целое количество от 1 до 1 000 000.');return;}
    if(!reason.trim()&&!postUrl.trim()){setActionMessage('Нужна ссылка на пост или причина операции.');return;}
    if(!pendingId.current) pendingId.current=crypto.randomUUID();
    setActionBusy(true);setActionMessage('');
    try {
      const response=await fetch(TRANSACTION_API,{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({characterId:selectedId,action:opKind,amount:qty,
          postUrl:postUrl.trim(),reason:reason.trim(),requestId:pendingId.current})});
      const result=await response.json();
      if(!response.ok || result.ok!==true) throw new Error(result.error||`Ошибка HTTP ${response.status}`);
      setActionMessage(`${result.status==='duplicate'?'Повтор подтверждён':'Операция выполнена'}: ${
        result.balanceAfter.toLocaleString('ru-RU')} ⭐. Обновление общей таблицы на сайте займёт до 1–2 минут.`);
      pendingId.current='';setAmount('');setPostUrl('');setReason('');
      // Snapshot read may be older until the next minute worker run.
    } catch(err) {setActionMessage((err instanceof Error?err.message:String(err))+
      ' Если повторяешь запрос, не меняй поля: сохранён прежний ключ операции.');}
    finally {setActionBusy(false);}
  };
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`${API}?t=${Date.now()}`,
        {method:'GET',cache:'no-store',credentials:'same-origin'});
      const data = await response.json() as StarsResponse;
      if (!response.ok || data.ok !== true) {
        throw new Error(data.error || 'Не удалось загрузить звёзды');
      }
      if (!data.available) {
        throw new Error(data.stale
          ? 'Данные звёзд устарели. Дождитесь синхронизации с Google.'
          : 'Банк звёзд пока не синхронизирован с Google.');
      }
      const manager = data.canManageBank === true;
      setCanManage(manager);
      // Privileged rosters must come from the server. An ordinary player never
      // gets to choose a characterId in the URL or in a request body.
      setAccounts(manager && Array.isArray(data.accounts) ? data.accounts : []);
      setMine(data.ownAccount || null);
      setTotalCount(manager ? data.count || 0 : 0);
      setObservedAt(manager ? data.observedAt || '' : '');
      setHistoryAvailable(data.historyAvailable === true);
      setHistory(Array.isArray(data.history) ? data.history : []);
      setHistoryHasMore(data.historyHasMore === true);
      setError('');
    } catch (err) {
      // Fail closed after logout, expiry or a revoked banker permission.
      setCanManage(false);
      setAccounts([]);
      setMine(null);
      setTotalCount(0);
      setObservedAt('');
      setHistory([]);
      setHistoryAvailable(false);
      setHistoryHasMore(false);
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

  const visibleAccounts = useMemo(() => {
    if (!canManage) return [];
    const search = query.trim().toLocaleLowerCase('ru');
    return accounts.filter(account => !search ||
      `${account.name} ${account.characterId}`.toLocaleLowerCase('ru').includes(search));
  }, [accounts, canManage, query]);

  const visibleHistory = useMemo(() => {
    if (!canManage || !query.trim()) return history;
    const ids = new Set(visibleAccounts.map(account => account.characterId));
    return history.filter(item => ids.has(item.characterId));
  }, [canManage, history, query, visibleAccounts]);

  return (
    <main className="star-bank-root">
      <div className="star-bank-shell">
        <header className="star-bank-topbar">
          <div>
            <div className="star-bank-kicker">ГОСУДАРСТВЕННЫЕ МАГИЧЕСКИЕ УСЛУГИ</div>
            <h1>Банк звёзд</h1>
            {canManage ? <p>Управление счетами звёзд. Источник — Google Sheets. Юли здесь не используются.</p> : null}
          </div>
          <div className="star-bank-topbar-actions">
            {canManage ? <span className="star-bank-role-badge">★ Банковский доступ</span> : null}
            <button className="star-bank-secondary-button" type="button" onClick={onBack}>← На главную</button>
          </div>
        </header>

        {error ? <div className="star-bank-message star-bank-message-error" role="alert">{error}</div> : null}

        <section className="star-bank-summary-grid">
          {(mine || !canManage) ? (
            <article className="star-bank-summary-card star-bank-summary-primary">
              <span>Ваш счёт</span>
              <strong>{mine ? formatStars(mine.stars) : '—'}</strong>
              <small>{mine ? mine.name : (loading ? 'Загрузка…' : 'Счёт не привязан к вашему персонажу. Обратитесь к администратору.')}</small>
            </article>
          ) : null}
          {canManage ? (
            <>
              <article className="star-bank-summary-card">
                <span>Счета звёзд</span>
                <strong>{totalCount || '—'}</strong>
                <small>Полный список доступен только администратору и банкиру</small>
              </article>
              <article className="star-bank-summary-card">
                <span>Последняя синхронизация с Google</span>
                <strong className="star-bank-summary-date">{observedAt ? formatDate(observedAt) : '—'}</strong>
                <small>Проверка обновлений каждые 30 секунд</small>
              </article>
            </>
          ) : null}
        </section>

        {canManage ? (
          <section className="star-bank-directory">
            <h2>Операция со звёздами</h2>
            <p>Основание: ссылка на вечерний пост или текст причины. Повторные отправки одной операции защищены ключом запроса.</p>
            <form className="star-bank-b3-form" onSubmit={submitOperation}>
              <label>Персонаж
                <select required value={selectedId} onChange={e=>{setSelectedId(e.target.value);invalidateRequest();}}>
                  <option value="">Выбери персонажа</option>
                  {accounts.map(account=><option key={account.characterId} value={account.characterId}>{account.name} — {account.stars} ⭐</option>)}
                </select>
              </label>
              <label>Действие
                <select value={opKind} onChange={e=>{setOpKind(e.target.value as 'credit'|'debit');invalidateRequest();}}>
                  <option value="credit">Начислить ⭐</option><option value="debit">Списать ⭐</option>
                </select>
              </label>
              <label>Количество звёзд
                <input type="number" min="1" max="1000000" step="1" required value={amount}
                  onChange={e=>{setAmount(e.target.value);invalidateRequest();}}/>
              </label>
              <label className="star-bank-b3-wide">Ссылка на вечерний пост (необязательно при наличии причины)
                <input type="url" placeholder="https://vk.com/wall..." value={postUrl}
                  onChange={e=>{setPostUrl(e.target.value);invalidateRequest();}}/>
              </label>
              <label className="star-bank-b3-wide">Причина (необязательно при наличии ссылки)
                <input type="text" maxLength={180} placeholder="Награда за интерактив" value={reason}
                  onChange={e=>{setReason(e.target.value);invalidateRequest();}}/>
              </label>
              <button type="submit" disabled={actionBusy || !selectedId} className="star-bank-secondary-button">
                {actionBusy?'Отправка…':opKind==='credit'?'Начислить звёзды':'Списать звёзды'}
              </button>
            </form>
            {actionMessage ? <p className="star-bank-b3-result" role="status">{actionMessage}</p> : null}
          </section>
        ) : null}

        {canManage ? (
          <section className="star-bank-directory">
            <div className="star-bank-directory-head">
              <div>
                <h2>Все счета звёзд</h2>
                <p>Начисляйте или списывайте звёзды за вечерние посты. Каждая операция записывается в Google.</p>
              </div>
              <div className="star-bank-directory-tools">
                <input type="search" aria-label="Поиск персонажа" value={query}
                  onChange={event => setQuery(event.target.value)} placeholder="Поиск по имени или ID"/>
                <button type="button" className="star-bank-secondary-button" onClick={() => void load()}>Обновить</button>
              </div>
            </div>
            {loading ? <div className="star-bank-empty">Загрузка счетов…</div> : null}
            {!loading && !error && visibleAccounts.length === 0 ?
              <div className="star-bank-empty">Счета не найдены.</div> : null}
            {!loading && !error ? <div className="star-bank-list">
              {visibleAccounts.map((account,index) => (
                <article key={account.characterId} className="star-bank-row">
                  <div className="star-bank-number">{index + 1}</div>
                  <div className="star-bank-account-copy">
                    <strong>{account.name}</strong>
                    <span>{account.characterId}</span>
                  </div>
                  <div className="star-bank-balance">{formatStars(account.stars)}</div>
                  <button type="button" className="star-bank-secondary-button"
                    onClick={()=>{setSelectedId(account.characterId);invalidateRequest();}}
                    aria-label={`Операция для ${account.name}`}>Выбрать</button>
                </article>
              ))}
            </div> : null}
          </section>
        ) : null}

        <section className="star-bank-directory">
          <div className="star-bank-directory-head">
            <div>
              <h2>{canManage ? 'История операций со звёздами' : 'История ваших операций'}</h2>
              {canManage ? <p>Последние операции из вкладки «История звёзд» в Google.</p> : null}
            </div>
            {!canManage ? <button type="button" className="star-bank-secondary-button"
              onClick={() => void load()}>Обновить</button> : null}
          </div>
          {loading ? <div className="star-bank-empty">Загрузка истории…</div> : null}
          {!loading && !error && !historyAvailable ?
            <div className="star-bank-empty">История ещё не синхронизирована с Google.</div> : null}
          {!loading && !error && historyAvailable && visibleHistory.length === 0 ?
            <div className="star-bank-empty">Операций пока нет.</div> : null}
          {!loading && !error && historyAvailable && visibleHistory.length > 0 ? (
            <div className="star-bank-list">
              {visibleHistory.map(item => (
                <article key={item.transactionId} className="star-bank-row">
                  <div className="star-bank-account-copy">
                    <strong>{item.kind} · {formatStars(item.amount)}</strong>
                    <span>{formatDate(item.occurredAt)}{canManage ? ` · ${accounts.find(x=>x.characterId===item.characterId)?.name || item.characterId}` : ''}</span>
                    {item.reason ? <span>{item.reason}</span> : null}
                    {sourceUrl(item.reason) ? <a href={sourceUrl(item.reason)} target="_blank"
                      rel="noopener noreferrer">Открыть вечерний пост ↗</a> : null}
                    {canManage && item.bankerLogin ? <span>Банкир: {item.bankerLogin}</span> : null}
                  </div>
                  <div className="star-bank-balance">{formatStars(item.balanceAfter)}</div>
                </article>
              ))}
            </div>
          ) : null}
          {historyHasMore && historyAvailable && !loading && !error ?
            <div className="star-bank-empty">Показаны последние операции. Полная история хранится в Google.</div> : null}
        </section>
      </div>
    </main>
  );
}
