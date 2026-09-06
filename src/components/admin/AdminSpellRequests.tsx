import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  spellCalculationLabel,
  spellDurationLabel,
  spellSpatialLabels,
  type CanonicalSpell,
} from '../../lib/spellSchema';

import './admin-spell-requests.css';


const API =
  '/.netlify/functions/admin-spell-requests';


type SpellRequest = {
  id: string;
  characterId: string;
  characterName: string;
  playerLogin: string;
  requestType:
    | 'new'
    | 'upgrade';
  cost: number;
  status:
    | 'pending'
    | 'processing'
    | 'approved'
    | 'rejected';
  spellIndex: number | null;
  sourceSpell?: CanonicalSpell | null;
  proposedSpell?: CanonicalSpell | null;
  approvedSpell?: CanonicalSpell | null;
  pointsAtSubmission: number;
  pointsBefore: number | null;
  pointsAfter: number | null;
  appliedSpellIndex: number | null;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  adminNote?: string;
};


type ResponseData = {
  ok: boolean;
  requests: SpellRequest[];
  counts: {
    pending: number;
    approved: number;
    rejected: number;
  };
  error?: string;
};


type HitRule =
  | 'pending'
  | 'required'
  | 'none';


function formatDate(
  value?: string
) {
  if (!value) return '';

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '';
  }

  return new Intl.DateTimeFormat(
    'ru-RU',
    {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }
  ).format(date);
}


async function readJson(
  response: Response
) {
  return response
    .json()
    .catch(() => ({}));
}


function SpellPreview({
  spell,
}: {
  spell?: CanonicalSpell | null;
}) {
  if (!spell) {
    return (
      <div className="admin-spell-request-empty">
        Данные заклинания не найдены.
      </div>
    );
  }

  return (
    <div className="admin-spell-request-preview">
      <div className="admin-spell-request-preview-head">
        <div>
          <span>{spell.powerType}</span>
          <h4>{spell.name}</h4>
        </div>

        <b>
          {spell.basePower == null
            ? 'без d20'
            : `d20: ${spell.basePower}`}
        </b>
      </div>

      <div className="admin-spell-request-meta">
        {spellSpatialLabels(
          spell
        ).map(label => (
          <span key={label}>
            {label}
          </span>
        ))}
        <span>
          {spellDurationLabel(
            spell
          )}
        </span>
      </div>

      <p>
        {spell.effect ||
          'Эффект не указан.'}
      </p>

      <small>
        {spellCalculationLabel(
          spell
        )}{' '}
        · мана по классу
      </small>
    </div>
  );
}


export default function AdminSpellRequests() {
  const [data, setData] =
    useState<ResponseData | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [showHistory, setShowHistory] =
    useState(false);

  const [busyId, setBusyId] =
    useState('');

  const [notes, setNotes] =
    useState<Record<string, string>>(
      {}
    );

  const [hitRules, setHitRules] =
    useState<Record<string, HitRule>>(
      {}
    );


  async function load(
    silent = false
  ) {
    if (!silent) {
      setLoading(true);
    }

    try {
      const response =
        await fetch(
          `${API}?t=${Date.now()}`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        );

      const result =
        await readJson(
          response
        ) as ResponseData;

      if (
        !response.ok ||
        !result?.ok
      ) {
        throw new Error(
          result?.error ||
          'Не удалось загрузить заявки на заклинания'
        );
      }

      setData(result);
      setError('');

    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : String(loadError)
      );

    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }


  useEffect(
    () => {
      void load();

      const timer =
        window.setInterval(
          () => {
            void load(true);
          },
          20_000
        );

      return () =>
        window.clearInterval(
          timer
        );
    },
    []
  );


  const pending =
    useMemo(
      () =>
        (data?.requests || [])
          .filter(
            request =>
              request.status ===
              'pending'
          ),
      [data]
    );

  const history =
    useMemo(
      () =>
        (data?.requests || [])
          .filter(
            request =>
              request.status ===
                'approved' ||
              request.status ===
                'rejected'
          )
          .slice(0, 30),
      [data]
    );


  async function decide(
    request: SpellRequest,
    decision:
      | 'approve'
      | 'reject'
  ) {
    const proposed =
      request.proposedSpell;

    const hitRule =
      hitRules[request.id] ||
      'pending';

    if (
      decision === 'approve' &&
      proposed?.target !==
        'На себя' &&
      hitRule === 'pending'
    ) {
      setError(
        'Перед одобрением выберите правило попадания.'
      );
      return;
    }

    setBusyId(
      request.id
    );
    setError('');

    try {
      const response =
        await fetch(
          API,
          {
            method: 'POST',
            headers: {
              'content-type':
                'application/json; charset=utf-8',
            },
            body: JSON.stringify({
              requestId:
                request.id,
              decision,
              hitRule,
              adminNote:
                notes[request.id] ||
                '',
            }),
          }
        );

      const result =
        await readJson(
          response
        ) as {
          ok?: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !result?.ok
      ) {
        throw new Error(
          result?.error ||
          'Не удалось сохранить решение'
        );
      }

      setNotes(
        current => {
          const next = {
            ...current,
          };
          delete next[
            request.id
          ];
          return next;
        }
      );

      setHitRules(
        current => {
          const next = {
            ...current,
          };
          delete next[
            request.id
          ];
          return next;
        }
      );

      await load(true);

    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : String(
              decisionError
            )
      );

    } finally {
      setBusyId('');
    }
  }


  return (
    <div className="admin-spell-requests">
      <div className="admin-spell-requests-head">
        <div>
          <div className="admin-kicker">
            ЗАЯВКИ ИГРОКОВ
          </div>
          <h3>
            Покупка и улучшение заклинаний
          </h3>
          <p>
            Новое заклинание стоит 3 балла, улучшение — 5. Баллы списывает Google только в момент успешного одобрения.
          </p>
        </div>

        <button
          type="button"
          className="admin-button"
          onClick={() =>
            void load()
          }
          disabled={loading}
        >
          ↻ Обновить
        </button>
      </div>

      <div className="admin-spell-request-stats">
        <div className="pending">
          <span>На рассмотрении</span>
          <b>
            {data?.counts.pending ||
              0}
          </b>
        </div>
        <div className="approved">
          <span>Одобрено</span>
          <b>
            {data?.counts.approved ||
              0}
          </b>
        </div>
        <div className="rejected">
          <span>Отклонено</span>
          <b>
            {data?.counts.rejected ||
              0}
          </b>
        </div>
      </div>

      {error ? (
        <div className="admin-spell-request-error">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="admin-spell-request-empty">
          Загружаю заявки…
        </div>
      ) : pending.length ? (
        <div className="admin-spell-request-list">
          {pending.map(
            request => {
              const proposed =
                request.proposedSpell;

              return (
                <article
                  className="admin-spell-request-card"
                  key={request.id}
                >
                  <div className="admin-spell-request-card-head">
                    <div>
                      <span>
                        {request.requestType ===
                        'upgrade'
                          ? `↑ Улучшение заклинания #${request.spellIndex}`
                          : '＋ Новое заклинание'}
                      </span>
                      <h4>
                        {request.characterName}
                      </h4>
                      <small>
                        {request.playerLogin ||
                          'игрок'}{' '}
                        · {formatDate(
                          request.createdAt
                        )}
                      </small>
                    </div>

                    <div className="admin-spell-request-price">
                      <b>
                        {request.cost}
                      </b>
                      <span>
                        баллов
                      </span>
                      <small>
                        было {request.pointsAtSubmission}
                      </small>
                    </div>
                  </div>

                  {request.requestType ===
                    'upgrade' &&
                  request.sourceSpell ? (
                    <details className="admin-spell-request-before">
                      <summary>
                        Показать текущую версию до улучшения
                      </summary>
                      <SpellPreview
                        spell={
                          request.sourceSpell
                        }
                      />
                    </details>
                  ) : null}

                  <div className="admin-spell-request-proposed">
                    <span>
                      ПРЕДЛОЖЕННАЯ ВЕРСИЯ
                    </span>
                    <SpellPreview
                      spell={proposed}
                    />
                  </div>

                  {proposed?.target !==
                  'На себя' ? (
                    <label className="admin-spell-request-hit">
                      <span>
                        Правило попадания · обязательно перед одобрением
                      </span>
                      <select
                        value={
                          hitRules[
                            request.id
                          ] ||
                          'pending'
                        }
                        onChange={event =>
                          setHitRules(
                            current => ({
                              ...current,
                              [request.id]:
                                event.target.value as HitRule,
                            })
                          )
                        }
                      >
                        <option value="pending">
                          Выберите решение…
                        </option>
                        <option value="required">
                          Нужен d20 против сложности цели
                        </option>
                        <option value="none">
                          Проверка попадания не нужна
                        </option>
                      </select>
                    </label>
                  ) : (
                    <div className="admin-spell-request-self-hit">
                      На себя · проверка попадания не нужна
                    </div>
                  )}

                  <label className="admin-spell-request-note">
                    <span>
                      Комментарий игроку · необязательно
                    </span>
                    <textarea
                      rows={2}
                      value={
                        notes[
                          request.id
                        ] || ''
                      }
                      onChange={event =>
                        setNotes(
                          current => ({
                            ...current,
                            [request.id]:
                              event.target.value,
                          })
                        )
                      }
                      placeholder="Например: слишком большая область, подай ещё раз с меньшим радиусом."
                    />
                  </label>

                  <div className="admin-spell-request-actions">
                    <button
                      type="button"
                      className="admin-button danger"
                      disabled={
                        busyId ===
                        request.id
                      }
                      onClick={() =>
                        void decide(
                          request,
                          'reject'
                        )
                      }
                    >
                      Отклонить · 0 баллов
                    </button>

                    <button
                      type="button"
                      className="admin-button primary"
                      disabled={
                        busyId ===
                          request.id ||
                        (
                          proposed?.target !==
                            'На себя' &&
                          (
                            hitRules[
                              request.id
                            ] ||
                            'pending'
                          ) ===
                            'pending'
                        )
                      }
                      onClick={() =>
                        void decide(
                          request,
                          'approve'
                        )
                      }
                    >
                      {busyId ===
                      request.id
                        ? 'Применяю…'
                        : `Одобрить · списать ${request.cost}`}
                    </button>
                  </div>
                </article>
              );
            }
          )}
        </div>
      ) : (
        <div className="admin-spell-request-empty ready">
          Новых заявок нет.
        </div>
      )}

      <div className="admin-spell-request-history-toggle">
        <button
          type="button"
          className="admin-button"
          onClick={() =>
            setShowHistory(
              current =>
                !current
            )
          }
        >
          {showHistory
            ? 'Скрыть историю'
            : `История решений · ${history.length}`}
        </button>
      </div>

      {showHistory ? (
        <div className="admin-spell-request-history">
          {history.map(request => (
            <article
              key={request.id}
              className={
                request.status
              }
            >
              <div>
                <span>
                  {request.status ===
                  'approved'
                    ? '✓ Одобрено'
                    : '× Отклонено'}
                </span>
                <strong>
                  {request.characterName} · {request.approvedSpell?.name || request.proposedSpell?.name || 'Заклинание'}
                </strong>
                <small>
                  {formatDate(
                    request.resolvedAt
                  )}{' '}
                  · {request.resolvedBy || 'администратор'}
                </small>
              </div>

              <div>
                {request.status ===
                'approved' ? (
                  <b>
                    −{request.cost} · осталось {request.pointsAfter ?? '—'}
                  </b>
                ) : (
                  <b>
                    0 · баллы сохранены
                  </b>
                )}

                {request.adminNote ? (
                  <small>
                    {request.adminNote}
                  </small>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
