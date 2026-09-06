import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  SPELL_AREAS,
  SPELL_CAST_TIMES,
  SPELL_DURATION_MODES,
  SPELL_FORMS,
  defaultSpellRequiresHit,
  makeCanonicalSpell,
  normalizeCanonicalSpell,
  spellCalculationLabel,
  spellSpatialLabels,
  spellTargetOptions,
  spellUsesArea,
  spellUsesFixedPower,
  spellUsesMovement,
  spellUsesRange,
  spellUsesSummonCount,
  validateCanonicalSpell,
  type CanonicalSpell,
  type SpellArea,
  type SpellCastTime,
  type SpellDurationMode,
  type SpellForm,
  type SpellTarget,
} from '../../lib/spellSchema';

import {
  getSpellTypes,
  type SpellPowerType,
} from '../questionnaire/questionnaireLogic';

import './player-spell-development.css';


const API =
  '/.netlify/functions/player-spell-requests';


type ExistingSpell =
  Partial<CanonicalSpell> & {
    slotIndex?: number;
    name: string;
    description?: string;
    valid?: boolean;
  };


type SpellRequest = {
  id: string;
  characterId: string;
  characterName: string;
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
  adminNote?: string;
};


type RequestState = {
  ok: boolean;
  characterId: string;
  upgradePoints: number;
  reservedPoints: number;
  availablePoints: number;
  costs: {
    new: number;
    upgrade: number;
  };
  requests: SpellRequest[];
  error?: string;
};


type RequestType =
  | 'new'
  | 'upgrade';


function classKeyFromName(
  name: string
) {
  const normalized =
    name
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(
        /[^a-zа-я0-9]+/g,
        ' '
      )
      .trim();

  const map:
    Array<[
      string,
      string,
    ]> = [
      ['сапорт x3 знахарь', 'support_x3_alchemist'],
      ['саппорт x3 знахарь', 'support_x3_alchemist'],
      ['сапорт x3', 'support_x3'],
      ['саппорт x3', 'support_x3'],
      ['хилер знахарь', 'healer_alchemist'],
      ['хилер дебаффер', 'healer_debuffer'],
      ['хилер баффер', 'healer_buffer'],
      ['баффер знахарь', 'buffer_alchemist'],
      ['дебаффер знахарь', 'debuffer_alchemist'],
      ['баффер дебаффер', 'buffer_debuffer'],
      ['призыватель мульти', 'summoner_multi'],
      ['призыватель сап', 'summoner_sup'],
      ['призыватель дд', 'summoner_dps'],
      ['брузер', 'bruiser'],
      ['убийца', 'assassin'],
      ['дамагер', 'dps'],
      ['танк', 'tank'],
      ['знахарь', 'alchemist'],
      ['дебаффер', 'debuffer'],
      ['баффер', 'buffer'],
      ['хилер', 'healer'],
    ];

  return (
    map.find(
      ([label]) =>
        normalized.includes(
          label
        )
    )?.[1] ??
    null
  );
}


function secureRoll(
  max: number
) {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues ===
      'function'
  ) {
    const values =
      new Uint32Array(1);

    crypto.getRandomValues(
      values
    );

    return (
      values[0] % max
    ) + 1;
  }

  return (
    Math.floor(
      Math.random() * max
    ) + 1
  );
}


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


function requestStatusLabel(
  status: SpellRequest['status']
) {
  if (status === 'approved') {
    return 'Одобрено';
  }

  if (status === 'rejected') {
    return 'Отклонено';
  }

  if (status === 'processing') {
    return 'Обрабатывается';
  }

  return 'На рассмотрении';
}


export default function PlayerSpellDevelopment({
  characterId,
  className,
  spells,
  initialUpgradePoints,
  onRefreshCabinet,
}: {
  characterId: string;
  className: string;
  spells: ExistingSpell[];
  initialUpgradePoints: number;
  onRefreshCabinet: () => void;
}) {
  const [state, setState] =
    useState<RequestState | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [requestType, setRequestType] =
    useState<RequestType | null>(
      null
    );

  const [upgradeSlot, setUpgradeSlot] =
    useState<number | null>(
      null
    );

  const [draft, setDraft] =
    useState<CanonicalSpell | null>(
      null
    );

  const [submitting, setSubmitting] =
    useState(false);

  const [submitMessage, setSubmitMessage] =
    useState('');

  const classKey =
    useMemo(
      () =>
        classKeyFromName(
          className
        ),
      [className]
    );

  const allowedTypes =
    useMemo(
      () =>
        classKey
          ? getSpellTypes(
              classKey
            )
          : [
              'Урон',
              'Лечение',
              'Защита',
              'Бафф',
              'Дебафф',
              'Контроль',
              'Призыв',
              'Ресурс',
              'Без расчёта',
            ] as SpellPowerType[],
      [classKey]
    );

  const upgradeableSpells =
    useMemo(
      () =>
        spells.filter(
          spell =>
            spell.valid === true &&
            Number.isInteger(
              Number(
                spell.slotIndex
              )
            )
        ),
      [spells]
    );

  async function loadState(
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
        ) as RequestState;

      if (
        !response.ok ||
        !result?.ok
      ) {
        throw new Error(
          result?.error ||
          'Не удалось загрузить заявки на заклинания'
        );
      }

      setState(result);
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
      void loadState();

      const timer =
        window.setInterval(
          () => {
            void loadState(true);
          },
          30_000
        );

      return () =>
        window.clearInterval(
          timer
        );
    },
    [characterId]
  );


  const costs =
    state?.costs ?? {
      new: 3,
      upgrade: 5,
    };

  const totalPoints =
    state?.upgradePoints ??
    initialUpgradePoints;

  const reservedPoints =
    state?.reservedPoints ??
    0;

  const availablePoints =
    state?.availablePoints ??
    Math.max(
      0,
      totalPoints -
      reservedPoints
    );


  function startNew() {
    const fallbackType =
      String(
        allowedTypes[0] ||
        'Урон'
      );

    const spell =
      makeCanonicalSpell(
        fallbackType
      );

    spell.hitReviewed =
      spell.target === 'На себя';

    setRequestType('new');
    setUpgradeSlot(null);
    setDraft(spell);
    setSubmitMessage('');
  }


  function startUpgrade(
    slotIndex?: number
  ) {
    const chosen =
      upgradeableSpells.find(
        spell =>
          Number(
            spell.slotIndex
          ) ===
          Number(
            slotIndex
          )
      ) ||
      upgradeableSpells[0];

    if (!chosen) {
      setError(
        'Нет заклинаний в актуальном формате, которые можно улучшить.'
      );
      return;
    }

    const fallbackType =
      String(
        chosen.powerType ||
        allowedTypes[0] ||
        'Урон'
      );

    const normalized =
      normalizeCanonicalSpell(
        chosen,
        fallbackType
      );

    normalized.hitReviewed =
      normalized.target ===
      'На себя';

    setRequestType(
      'upgrade'
    );
    setUpgradeSlot(
      Number(
        chosen.slotIndex
      )
    );
    setDraft(normalized);
    setSubmitMessage('');
  }


  function patch(
    next: Partial<CanonicalSpell>
  ) {
    setDraft(
      current =>
        current
          ? {
              ...current,
              ...next,
            }
          : current
    );
  }


  function normalizePatch(
    next: Partial<CanonicalSpell>
  ) {
    setDraft(
      current => {
        if (!current) {
          return current;
        }

        const normalized =
          normalizeCanonicalSpell(
            {
              ...current,
              ...next,
            },
            String(
              next.powerType ||
              current.powerType
            )
          );

        normalized.hitReviewed =
          normalized.target ===
          'На себя';

        return normalized;
      }
    );
  }


  async function submitRequest() {
    if (
      !requestType ||
      !draft
    ) {
      return;
    }

    const issues =
      validateCanonicalSpell(
        draft,
        {
          requireMasterReview:
            false,
        }
      );

    if (issues.length > 0) {
      setError(
        issues
          .map(
            issue =>
              issue.message
          )
          .join(' ')
      );
      return;
    }

    setSubmitting(true);
    setError('');
    setSubmitMessage('');

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
              requestType,
              spellIndex:
                requestType ===
                  'upgrade'
                  ? upgradeSlot
                  : null,
              spell: {
                ...draft,
                hitReviewed:
                  draft.target ===
                  'На себя',
                requiresHit:
                  draft.target ===
                  'На себя'
                    ? false
                    : draft.requiresHit,
              },
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
          'Не удалось отправить заявку'
        );
      }

      setRequestType(null);
      setUpgradeSlot(null);
      setDraft(null);
      setSubmitMessage(
        'Заявка отправлена администратору. Баллы пока не списаны.'
      );

      await loadState(true);

    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : String(submitError)
      );

    } finally {
      setSubmitting(false);
    }
  }


  const selectedSourceSpell =
    requestType === 'upgrade'
      ? upgradeableSpells.find(
          spell =>
            Number(
              spell.slotIndex
            ) ===
            Number(
              upgradeSlot
            )
        ) || null
      : null;

  const issues =
    draft
      ? validateCanonicalSpell(
          draft,
          {
            requireMasterReview:
              false,
          }
        )
      : [];

  const targetOptions =
    draft
      ? spellTargetOptions(
          draft.form
        )
      : [];

  const requestCost =
    requestType
      ? costs[
          requestType
        ]
      : 0;

  const canAfford =
    availablePoints >=
    requestCost;

  return (
    <div className="spell-development">
      <div className="spell-development-head">
        <div>
          <span>РАЗВИТИЕ ГРИМУАРА</span>
          <h3>Заклинания за баллы прокачки</h3>
          <p>
            Баллы списываются только после одобрения администратора. Отклонённая заявка ничего не стоит.
          </p>
        </div>

        <button
          type="button"
          className="spell-dev-refresh"
          onClick={() =>
            void loadState()
          }
          disabled={loading}
        >
          ↻
        </button>
      </div>

      <div className="spell-dev-balance">
        <div>
          <span>Баллы</span>
          <b>{totalPoints}</b>
        </div>
        <div>
          <span>Ждут решения</span>
          <b>{reservedPoints}</b>
        </div>
        <div className="available">
          <span>Можно потратить</span>
          <b>{availablePoints}</b>
        </div>
      </div>

      <div className="spell-dev-products">
        <button
          type="button"
          className="spell-dev-product"
          onClick={startNew}
          disabled={
            availablePoints <
            costs.new
          }
        >
          <span>＋</span>
          <div>
            <strong>Новое заклинание</strong>
            <small>
              Создать ещё одно заклинание и отправить мастеру на проверку.
            </small>
          </div>
          <b>{costs.new} балла</b>
        </button>

        <button
          type="button"
          className="spell-dev-product"
          onClick={() =>
            startUpgrade()
          }
          disabled={
            availablePoints <
              costs.upgrade ||
            upgradeableSpells.length ===
              0
          }
        >
          <span>↑</span>
          <div>
            <strong>Улучшить заклинание</strong>
            <small>
              Изменить эффект или параметры существующего заклинания. Старый d20 не перебрасывается.
            </small>
          </div>
          <b>{costs.upgrade} баллов</b>
        </button>
      </div>

      {error ? (
        <div className="spell-dev-message error">
          {error}
        </div>
      ) : null}

      {submitMessage ? (
        <div className="spell-dev-message success">
          {submitMessage}
        </div>
      ) : null}

      {draft && requestType ? (
        <div className="spell-dev-editor">
          <div className="spell-dev-editor-head">
            <div>
              <span>
                {requestType ===
                'new'
                  ? `НОВОЕ ЗАКЛИНАНИЕ · ${costs.new} БАЛЛА`
                  : `УЛУЧШЕНИЕ · ${costs.upgrade} БАЛЛОВ`}
              </span>
              <h4>
                {requestType ===
                'upgrade'
                  ? selectedSourceSpell?.name ||
                    'Выберите заклинание'
                  : 'Заявка мастеру'}
              </h4>
            </div>

            <button
              type="button"
              onClick={() => {
                setRequestType(null);
                setDraft(null);
                setUpgradeSlot(null);
              }}
              disabled={submitting}
            >
              ×
            </button>
          </div>

          {requestType ===
          'upgrade' ? (
            <label className="spell-dev-field wide">
              <span>Какое заклинание улучшить</span>
              <select
                value={
                  upgradeSlot ?? ''
                }
                onChange={event =>
                  startUpgrade(
                    Number(
                      event.target.value
                    )
                  )
                }
              >
                {upgradeableSpells.map(
                  spell => (
                    <option
                      key={
                        spell.slotIndex
                      }
                      value={
                        spell.slotIndex
                      }
                    >
                      #{spell.slotIndex} · {spell.name}
                    </option>
                  )
                )}
              </select>
            </label>
          ) : null}

          <div className="spell-dev-grid">
            <label className="spell-dev-field wide">
              <span>Название</span>
              <input
                value={draft.name}
                onChange={event =>
                  patch({
                    name:
                      event.target.value,
                  })
                }
              />
            </label>

            <label className="spell-dev-field">
              <span>Боевой тип</span>
              <select
                value={draft.powerType}
                onChange={event => {
                  const powerType =
                    event.target.value;

                  normalizePatch({
                    powerType,
                    requiresHit:
                      defaultSpellRequiresHit(
                        powerType
                      ),
                  });
                }}
              >
                {allowedTypes.map(
                  type => (
                    <option
                      key={type}
                      value={type}
                    >
                      {type}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="spell-dev-field">
              <span>Как работает</span>
              <select
                value={draft.form}
                onChange={event =>
                  normalizePatch({
                    form:
                      event.target.value as SpellForm,
                  })
                }
              >
                {SPELL_FORMS.map(
                  value => (
                    <option
                      key={value}
                      value={value}
                    >
                      {value}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="spell-dev-field">
              <span>Время каста</span>
              <select
                value={draft.castTime}
                onChange={event =>
                  patch({
                    castTime:
                      event.target.value as SpellCastTime,
                  })
                }
              >
                {SPELL_CAST_TIMES.map(
                  value => (
                    <option
                      key={value}
                      value={value}
                    >
                      {value}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="spell-dev-field">
              <span>Цель</span>
              <select
                value={draft.target}
                onChange={event =>
                  normalizePatch({
                    target:
                      event.target.value as SpellTarget,
                  })
                }
              >
                {targetOptions.map(
                  value => (
                    <option
                      key={value}
                      value={value}
                    >
                      {value}
                    </option>
                  )
                )}
              </select>
            </label>

            {spellUsesRange(
              draft
            ) ? (
              <label className="spell-dev-field">
                <span>Дальность, м</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={
                    draft.rangeMeters ??
                    ''
                  }
                  onChange={event =>
                    patch({
                      rangeMeters:
                        event.target.value ===
                        ''
                          ? null
                          : Number(
                              event.target.value
                            ),
                    })
                  }
                />
              </label>
            ) : null}

            {[
              'Область',
              'Аура',
              'Создание / барьер',
            ].includes(
              draft.form
            ) ? (
              <label className="spell-dev-field">
                <span>Форма области</span>
                <select
                  value={draft.area}
                  onChange={event =>
                    normalizePatch({
                      area:
                        event.target.value as SpellArea,
                    })
                  }
                >
                  {SPELL_AREAS.map(
                    value => (
                      <option
                        key={value}
                        value={value}
                      >
                        {value}
                      </option>
                    )
                  )}
                </select>
              </label>
            ) : null}

            {spellUsesArea(
              draft
            ) ? (
              <label className="spell-dev-field">
                <span>Размер области, м</span>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={
                    draft.areaMeters ??
                    ''
                  }
                  onChange={event =>
                    patch({
                      areaMeters:
                        event.target.value ===
                        ''
                          ? null
                          : Number(
                              event.target.value
                            ),
                    })
                  }
                />
              </label>
            ) : null}

            {spellUsesMovement(
              draft
            ) ? (
              <label className="spell-dev-field">
                <span>Перемещение, м</span>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={
                    draft.movementMeters ??
                    ''
                  }
                  onChange={event =>
                    patch({
                      movementMeters:
                        event.target.value ===
                        ''
                          ? null
                          : Number(
                              event.target.value
                            ),
                    })
                  }
                />
              </label>
            ) : null}

            {spellUsesSummonCount(
              draft
            ) ? (
              <label className="spell-dev-field">
                <span>Количество существ</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  value={
                    draft.summonCount ??
                    1
                  }
                  onChange={event =>
                    patch({
                      summonCount:
                        Math.max(
                          1,
                          Number(
                            event.target.value ||
                            1
                          )
                        ),
                    })
                  }
                />
              </label>
            ) : null}

            <label className="spell-dev-field">
              <span>Длительность</span>
              <select
                value={
                  draft.durationMode
                }
                onChange={event => {
                  const durationMode =
                    event.target.value as SpellDurationMode;

                  patch({
                    durationMode,
                    durationRounds:
                      durationMode ===
                      'Ходы'
                        ? draft.durationRounds ??
                          1
                        : null,
                  });
                }}
              >
                {SPELL_DURATION_MODES.map(
                  value => (
                    <option
                      key={value}
                      value={value}
                    >
                      {value}
                    </option>
                  )
                )}
              </select>
            </label>

            {draft.durationMode ===
            'Ходы' ? (
              <label className="spell-dev-field">
                <span>Сколько ходов</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={
                    draft.durationRounds ??
                    1
                  }
                  onChange={event =>
                    patch({
                      durationRounds:
                        Math.max(
                          1,
                          Number(
                            event.target.value ||
                            1
                          )
                        ),
                    })
                  }
                />
              </label>
            ) : null}

            {spellUsesFixedPower(
              draft.powerType
            ) ? (
              <div className="spell-dev-roll wide">
                <div>
                  <span>Базовая сила · d20</span>
                  <b>
                    {draft.basePower ??
                    '—'}
                  </b>
                  <small>
                    {requestType ===
                      'upgrade' &&
                    selectedSourceSpell?.basePower !=
                      null
                      ? 'Старый результат закреплён и не меняется при улучшении.'
                      : 'Один бросок. После отправки заявки перебросить его нельзя.'}
                  </small>
                </div>

                {!(
                  requestType ===
                    'upgrade' &&
                  selectedSourceSpell?.basePower !=
                    null
                ) ? (
                  <button
                    type="button"
                    disabled={
                      draft.basePower !=
                      null
                    }
                    onClick={() =>
                      patch({
                        basePower:
                          secureRoll(20),
                        powerDie:
                          'd20',
                      })
                    }
                  >
                    {draft.basePower ==
                    null
                      ? '🎲 Бросить d20'
                      : '✓ Закреплено'}
                  </button>
                ) : null}
              </div>
            ) : null}

            {draft.target !==
            'На себя' ? (
              <div className="spell-dev-master-note wide">
                <b>🎯 Правило попадания назначит мастер</b>
                <span>
                  После отправки администратор решит, требуется ли d20 против сложности цели. Это не влияет на стоимость заявки.
                </span>
              </div>
            ) : null}

            <label className="spell-dev-field wide">
              <span>Эффект</span>
              <textarea
                rows={5}
                value={draft.effect}
                onChange={event =>
                  patch({
                    effect:
                      event.target.value,
                  })
                }
              />
            </label>
          </div>

          <div className="spell-dev-preview">
            <span>
              <b>Структура:</b>{' '}
              {spellSpatialLabels(
                draft
              ).join(' · ')}
            </span>
            <span>
              <b>Расчёт:</b>{' '}
              {spellCalculationLabel(
                draft
              )}
            </span>
            <span>
              <b>Стоимость:</b>{' '}
              {requestCost}{' '}
              {requestCost === 1
                ? 'балл'
                : 'баллов'}
            </span>
          </div>

          {issues.length ? (
            <div className="spell-dev-issues">
              {issues.map(
                issue => (
                  <span
                    key={`${issue.field}-${issue.message}`}
                  >
                    {issue.message}
                  </span>
                )
              )}
            </div>
          ) : null}

          {!canAfford ? (
            <div className="spell-dev-message error">
              Недостаточно свободных баллов: доступно {availablePoints}, нужно {requestCost}.
            </div>
          ) : null}

          <div className="spell-dev-actions">
            <button
              type="button"
              onClick={() => {
                setRequestType(null);
                setDraft(null);
                setUpgradeSlot(null);
              }}
              disabled={submitting}
            >
              Отмена
            </button>

            <button
              type="button"
              className="primary"
              disabled={
                submitting ||
                issues.length > 0 ||
                !canAfford
              }
              onClick={() =>
                void submitRequest()
              }
            >
              {submitting
                ? 'Отправляю…'
                : `Отправить мастеру · ${requestCost} баллов`}
            </button>
          </div>
        </div>
      ) : null}

      <div className="spell-dev-history">
        <div className="spell-dev-history-head">
          <strong>Мои заявки</strong>
          <small>
            {loading
              ? 'Обновляю…'
              : `${state?.requests.length || 0}`}
          </small>
        </div>

        {state?.requests?.length ? (
          state.requests
            .slice(0, 8)
            .map(request => (
              <article
                key={request.id}
                className={`spell-dev-request ${request.status}`}
              >
                <div>
                  <span>
                    {request.requestType ===
                    'upgrade'
                      ? '↑ Улучшение'
                      : '＋ Новое заклинание'}
                  </span>
                  <strong>
                    {request.approvedSpell?.name ||
                      request.proposedSpell?.name ||
                      'Без названия'}
                  </strong>
                  <small>
                    {formatDate(
                      request.createdAt
                    )}
                    {' · '}
                    {request.cost} баллов
                  </small>
                </div>

                <div className="spell-dev-request-result">
                  <b>
                    {requestStatusLabel(
                      request.status
                    )}
                  </b>

                  {request.status ===
                  'approved' ? (
                    <>
                      <small>
                        Списано {request.cost}. Осталось {request.pointsAfter ?? '—'}.
                      </small>
                      <button
                        type="button"
                        onClick={
                          onRefreshCabinet
                        }
                      >
                        Обновить гримуар
                      </button>
                    </>
                  ) : request.status ===
                    'rejected' ? (
                    <small>
                      Баллы не списаны
                      {request.adminNote
                        ? ` · ${request.adminNote}`
                        : ''}
                    </small>
                  ) : (
                    <small>
                      Баллы пока только зарезервированы
                    </small>
                  )}
                </div>
              </article>
            ))
        ) : (
          <div className="spell-dev-empty">
            Заявок пока нет.
          </div>
        )}
      </div>
    </div>
  );
}
