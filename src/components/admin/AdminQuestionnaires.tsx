import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  CLASSES,
} from '../../data/classes';

import QuestionnaireGooglePreview from './GooglePreview';
import QuestionnaireWizard, {
  type QuestionnaireData,
} from '../questionnaire/QuestionnaireWizard';

import {
  SPELL_SCHEMA_VERSION,
  normalizeCanonicalSpell,
} from '../../lib/spellSchema';


/* ============================================================
   ТИПЫ
   ============================================================ */

type QuestionnaireSummary = {
  key: string;
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  isTest?: boolean;

  assistant: {
    id: string;
    name: string;
  };
};


type QuestionnaireDetails = {
  key: string;
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  name: string;

  isTest?: boolean;
  testFixtureId?: string;

  assistant: {
    id: string;
    name: string;
  };

  applicantFeedback?: {
    text: string;
    adminName: string;
    updatedAt: string;
  } | null;

  data: Record<
    string,
    unknown
  >;
};


const isTestQuestionnaire = (
  questionnaire:
    | QuestionnaireSummary
    | QuestionnaireDetails
    | null
    | undefined
) => {
  if (!questionnaire) {
    return false;
  }

  const data =
    'data' in questionnaire &&
    questionnaire.data &&
    typeof questionnaire.data ===
      'object'
      ? questionnaire.data as Record<string, unknown>
      : {};

  const key =
    String(
      questionnaire.key ||
      ''
    );

  const id =
    String(
      questionnaire.id ||
      ''
    );

  return Boolean(
    questionnaire.isTest ||
    data.isTest ||
    id ===
      'test-pes-testovich' ||
    key.includes(
      'test_pes_testovich'
    ) ||
    key.includes(
      '00000000-0000-4000-8000-000000000001'
    )
  );
};


function questionnaireNeedsSpellMigration(
  data: Record<string, unknown> | null | undefined,
) {
  const spells = Array.isArray(data?.spells)
    ? data!.spells as Array<Record<string, unknown>>
    : [];

  if (!spells.length) {
    return false;
  }

  return spells.some((spell) => {
    const schemaVersion = Number(spell?.schemaVersion || 0);

    const powerType = String(spell?.powerType || '').trim();
    const basePower = Number(spell?.basePower);
    const needsFixedPower = powerType !== 'Без расчёта';

    return (
      schemaVersion !== SPELL_SCHEMA_VERSION ||
      !String(spell?.form || '').trim() ||
      !String(spell?.target || '').trim() ||
      !String(spell?.durationMode || '').trim() ||
      typeof spell?.requiresHit !== 'boolean' ||
      (needsFixedPower && (!Number.isInteger(basePower) || basePower < 1 || basePower > 20))
    );
  });
}


type QuestionnaireNote = {
  id: string;
  questionnaireId: string;
  createdAt: string;

  admin: {
    login: string;
    name: string;
  };

  text: string;
};


type ListResponse = {
  ok: boolean;
  questionnaires?: QuestionnaireSummary[];
  total?: number;
  error?: string;
};


type DetailResponse = {
  ok: boolean;
  questionnaire?: QuestionnaireDetails;
  error?: string;
};


type StatusResponse = {
  ok: boolean;

  questionnaire?: {
    key: string;
    id: string;
    status: string;
    updatedAt: string;

    applicantFeedback?: {
      text: string;
      adminName: string;
      updatedAt: string;
    } | null;
  };

  error?: string;
};


type UpdateQuestionnaireResponse = {
  ok: boolean;
  questionnaire?: QuestionnaireDetails;
  error?: string;
};


type DeleteResponse = {
  ok: boolean;
  deleted?: {
    key: string;
    id: string;
    notesDeleted: number;
  };
  error?: string;
};


type NotesResponse = {
  ok: boolean;
  notes?: QuestionnaireNote[];
  total?: number;
  error?: string;
};


type AddNoteResponse = {
  ok: boolean;
  note?: QuestionnaireNote;
  error?: string;
};


type CreateTestQuestionnaireResponse = {
  ok: boolean;
  created?: boolean;
  updated?: boolean;
  questionnaire?: {
    key: string;
    id: string;
    status: string;
    name: string;
    hasPortrait: boolean;
    hasGrimoire: boolean;
  };
  error?: string;
};


type ResetTestQuestionnaireResponse = {
  ok: boolean;
  deleted?: Array<{
    key: string;
    id: string;
    name: string;
    notesDeleted: number;
  }>;
  totalDeleted?: number;
  error?: string;
};


const TEST_ASSET_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'webp',
] as const;


async function blobToDataUrl(
  blob: Blob
): Promise<string> {

  return await new Promise(
    (
      resolve,
      reject
    ) => {

      const reader =
        new FileReader();

      reader.onload =
        () => {

          if (
            typeof reader.result ===
              'string'
          ) {

            resolve(
              reader.result
            );

          } else {

            reject(
              new Error(
                'Не удалось прочитать тестовое изображение'
              )
            );
          }
        };

      reader.onerror =
        () => {
          reject(
            new Error(
              'Не удалось прочитать тестовое изображение'
            )
          );
        };

      reader.readAsDataURL(
        blob
      );
    }
  );
}


async function loadTestAsset(
  basePath: string
): Promise<
  | {
      dataUrl: string;
      fileName: string;
    }
  | null
> {

  for (
    const extension of
      TEST_ASSET_EXTENSIONS
  ) {

    const path =
      `${basePath}.${extension}`;

    try {

      const response =
        await fetch(
          `${path}?t=${Date.now()}`,
          {
            method:
              'GET',
            cache:
              'no-store',
          }
        );

      if (!response.ok) {
        continue;
      }

      const blob =
        await response.blob();

      if (
        !blob.type.startsWith(
          'image/'
        )
      ) {
        continue;
      }

      return {
        dataUrl:
          await blobToDataUrl(
            blob
          ),
        fileName:
          `pes-testovich-${basePath.includes('grimoire') ? 'grimoire' : 'portrait'}.${extension}`,
      };

    } catch {
      // Пробуем следующее расширение.
    }
  }

  return null;
}


/* ============================================================
   ДАТА
   ============================================================ */

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
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',

      hour: '2-digit',
      minute: '2-digit',
    }
  )
    .format(
      date
    );
}


/* ============================================================
   СТАТУС
   ============================================================ */

function statusTitle(
  status?: string
) {

  switch (
    status
  ) {

    case 'new':
      return 'Новая';

    case 'review':
      return 'На рассмотрении';

    case 'revision':
      return 'На доработке';

    case 'approved':
      return 'Одобрена';

    case 'rejected':
      return 'Отклонена';

    default:
      return (
        status ||
        'Без статуса'
      );
  }
}


/* ============================================================
   РУССКИЕ НАЗВАНИЯ ПОЛЕЙ
   ============================================================ */

const FIELD_TITLES:
  Record<
    string,
    string
  > = {

    name:
      'Имя',

    characterName:
      'Имя персонажа',

    character_name:
      'Имя персонажа',

    fullName:
      'Полное имя',

    full_name:
      'Полное имя',

    nickname:
      'Прозвище',

    nick:
      'Прозвище',

    age:
      'Возраст',

    plannedAge:
      'Планируемый возраст',

    gender:
      'Пол',

    pronouns:
      'Местоимения',

    race:
      'Раса',

    suit:
      'Королевство',

    kingdom:
      'Королевство',

    homeland:
      'Родина',

    biography:
      'Биография',

    bio:
      'Биография',

    history:
      'История',

    height:
      'Рост',

    weight:
      'Вес',

    body:
      'Телосложение',

    build:
      'Телосложение',

    hairColor:
      'Цвет волос',

    hairLength:
      'Длина волос',

    eyes:
      'Глаза',

    eyeColor:
      'Цвет глаз',

    marks:
      'Особые приметы',

    appearance:
      'Внешность',

    personality:
      'Характер',

    hasGrimoire:
      'Есть гримуар',

    grimoire:
      'Гримуар',

    noviceNote:
      'Примечание новичка',

    class:
      'Класс',

    className:
      'Класс',

    classKey:
      'Класс',

    role:
      'Роль',

    magic:
      'Магия',

    magicType:
      'Тип магии',

    magicName:
      'Название магии',

    magicInspiration:
      'Магия-вдохновитель',

    magicDescription:
      'Описание магии',

    elementKeys:
      'Системные ключи природ',

    elements:
      'Стихии',

    abilities:
      'Способности',

    skills:
      'Навыки',

    spells:
      'Заклинания',

    combatNotes:
      'Боевые примечания',

    squad:
      'Отряд',

    rank:
      'Ранг',

    inventory:
      'Инвентарь',

    equipment:
      'Снаряжение',

    photo:
      'Арт персонажа',

    portrait:
      'Арт персонажа',

    image:
      'Арт персонажа',

    images:
      'Арты персонажа',

    description:
      'Описание',

    castTime:
      'Время сотворения',

    radius:
      'Радиус',

    effect:
      'Эффект',

    duration:
      'Длительность',

    manaCost:
      'Расход маны',

    cooldown:
      'Перезарядка',

    range:
      'Дальность',

    damage:
      'Урон',

    powerType:
      'Тип силы',

    power:
      'Сила',

    powerRoll:
      'Сила',

    powerDie:
      'Кубик',

    universalRoll:
      'Бросок d100',

    healing:
      'Лечение',

    type:
      'Тип',

    count:
      'Количество',

    level:
      'Уровень',

    unlockLevel:
      'Уровень открытия',
  };


function fieldTitle(
  key: string
) {

  if (
    FIELD_TITLES[key]
  ) {

    return FIELD_TITLES[
      key
    ];
  }


  if (
    /[а-яё]/i.test(
      key
    )
  ) {

    return key;
  }


  return 'Дополнительное поле';
}


/* ============================================================
   ТЕХНИЧЕСКИЕ ПОЛЯ ФАЙЛОВ
   ============================================================ */

const HIDDEN_OBJECT_KEYS =
  new Set([
    'dataUrl',
    'mime',
    'size',
    'fileName',
    'filename',
    'lastModified',
  ]);


/* ============================================================
   ИЗОБРАЖЕНИЯ
   ============================================================ */

function isImageSource(
  value: unknown
): value is string {

  if (
    typeof value !==
    'string'
  ) {

    return false;
  }


  const clean =
    value.trim();


  return (
    clean.startsWith(
      'data:image/'
    ) ||

    clean.startsWith(
      'blob:'
    ) ||

    /^https?:\/\/.+\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i
      .test(
        clean
      )
  );
}


function collectImages(
  value: unknown,
  output: string[] = []
): string[] {

  if (
    isImageSource(
      value
    )
  ) {

    if (
      !output.includes(
        value
      )
    ) {

      output.push(
        value
      );
    }


    return output;
  }


  if (
    Array.isArray(
      value
    )
  ) {

    for (
      const item of value
    ) {

      collectImages(
        item,
        output
      );
    }


    return output;
  }


  if (
    value &&
    typeof value ===
      'object'
  ) {

    for (
      const item of Object.values(
        value as Record<
          string,
          unknown
        >
      )
    ) {

      collectImages(
        item,
        output
      );
    }
  }


  return output;
}


/* ============================================================
   ГАЛЕРЕЯ
   ============================================================ */

function ImageGallery({
  images,
}: {
  images: string[];
}) {

  return (

    <div className="admin-questionnaire-art-gallery">

      {
        images.map(
          (
            src,
            index
          ) => (

            <img
              key={
                `${index}-${src.slice(
                  0,
                  40
                )}`
              }

              className="admin-questionnaire-art"

              src={
                src
              }

              alt={
                images.length > 1
                  ? `Арт персонажа ${index + 1}`
                  : 'Арт персонажа'
              }

              loading="lazy"
            />

          )
        )
      }

    </div>
  );
}


/* ============================================================
   НАЗВАНИЕ КЛАССА
   ============================================================ */

function getClassTitle(
  value: unknown
) {

  const key =
    String(
      value ??
      ''
    )
      .trim();


  if (!key) {
    return '—';
  }


  try {

    const classes =
      CLASSES as readonly any[];


    const found =
      classes.find(
        item => {

          const possibleKeys = [
            item?.key,
            item?.id,
            item?.classKey,
            item?.slug,
            item?.value,
          ]
            .filter(
              Boolean
            )
            .map(
              itemKey =>
                String(
                  itemKey
                )
                  .trim()
                  .toLowerCase()
            );


          return possibleKeys.includes(
            key.toLowerCase()
          );
        }
      );


    const title =
      found?.name ||
      found?.title ||
      found?.label;


    if (title) {

      return String(
        title
      );
    }

  } catch {

    /*
      Если структура классов
      изменится, анкета
      всё равно откроется.
    */
  }


  return 'Класс выбран';
}


/* ============================================================
   ПРОСТЫЕ ЗНАЧЕНИЯ
   ============================================================ */

function primitiveValue(
  value: unknown
) {

  if (
    value === null ||
    value === undefined
  ) {

    return '—';
  }


  if (
    typeof value ===
    'boolean'
  ) {

    return value
      ? 'Да'
      : 'Нет';
  }


  const text =
    String(
      value
    )
      .trim();


  return (
    text ||
    '—'
  );
}


/* ============================================================
   ОБЪЕКТ
   ============================================================ */

function renderObject(
  value: Record<
    string,
    unknown
  >
): React.ReactNode {

  /*
    Если внутри объекта находится
    прикреплённый арт — показываем
    только изображение.

    mime, size, dataUrl и имя файла
    администратору не нужны.
  */

  const images =
    collectImages(
      value
    );


  if (
    images.length >
    0
  ) {

    return (

      <ImageGallery
        images={
          images
        }
      />

    );
  }


  const entries =
    Object.entries(
      value
    )
      .filter(
        ([key]) =>
          !HIDDEN_OBJECT_KEYS.has(
            key
          )
      );


  if (
    entries.length ===
    0
  ) {

    return '—';
  }


  const looksLikeSpell =
    (
      'castTime' in value ||
      'effect' in value ||
      'radius' in value ||
      'duration' in value ||
      'manaCost' in value
    );


  return (

    <div
      style={{
        display: 'grid',
        gap: 10,
      }}
    >

      {
        entries.map(
          ([
            key,
            item
          ]) => {

            const title =
              (
                looksLikeSpell &&
                key === 'name'
              )
                ? 'Название'
                : fieldTitle(
                    key
                  );


            return (

              <div
                key={
                  key
                }

                style={{
                  padding:
                    '10px 12px',

                  border:
                    '1px solid var(--admin-line-soft)',

                  borderRadius:
                    10,

                  background:
                    'rgba(255,255,255,.018)',
                }}
              >

                <div
                  style={{
                    marginBottom:
                      6,

                    color:
                      'var(--admin-accent-2)',

                    fontSize:
                      10,

                    fontWeight:
                      800,

                    letterSpacing:
                      '.06em',

                    textTransform:
                      'uppercase',
                  }}
                >
                  {title}
                </div>


                <div>

                  {
                    renderValue(
                      item,
                      key
                    )
                  }

                </div>

              </div>
            );
          }
        )
      }

    </div>
  );
}


/* ============================================================
   ОТОБРАЖЕНИЕ ЛЮБОГО ЗНАЧЕНИЯ
   ============================================================ */

function renderValue(
  value: unknown,
  fieldKey = ''
): React.ReactNode {

  if (
    fieldKey ===
    'classKey'
  ) {

    return getClassTitle(
      value
    );
  }


  if (
    isImageSource(
      value
    )
  ) {

    return (

      <ImageGallery
        images={[
          value
        ]}
      />

    );
  }


  if (
    value === null ||

    value === undefined ||

    typeof value ===
      'string' ||

    typeof value ===
      'number' ||

    typeof value ===
      'boolean'
  ) {

    return primitiveValue(
      value
    );
  }


  if (
    Array.isArray(
      value
    )
  ) {

    if (
      value.length ===
      0
    ) {

      return '—';
    }


    const images =
      collectImages(
        value
      );


    if (
      images.length >
      0
    ) {

      return (

        <ImageGallery
          images={
            images
          }
        />

      );
    }


    return (

      <div
        style={{
          display: 'grid',
          gap: 8,
        }}
      >

        {
          value.map(
            (
              item,
              index
            ) => (

              <div
                key={
                  index
                }

                style={
                  item &&
                  typeof item ===
                    'object'
                    ? {
                        padding:
                          10,

                        border:
                          '1px solid var(--admin-line-soft)',

                        borderRadius:
                          10,

                        background:
                          'rgba(255,255,255,.012)',
                      }
                    : undefined
                }
              >

                {
                  renderValue(
                    item
                  )
                }

              </div>

            )
          )
        }

      </div>
    );
  }


  if (
    typeof value ===
    'object'
  ) {

    return renderObject(
      value as Record<
        string,
        unknown
      >
    );
  }


  return '—';
}



/* ============================================================
   КРАСИВОЕ ЛИЧНОЕ ДЕЛО АНКЕТЫ
   ============================================================ */

type AnyRecord = Record<string, unknown>;

function asRecord(
  value: unknown
): AnyRecord | null {

  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as AnyRecord;
}


function firstText(
  data: AnyRecord,
  keys: string[]
) {

  for (const key of keys) {
    const value = data[key];

    if (
      typeof value === 'string' ||
      typeof value === 'number'
    ) {
      const clean = String(value).trim();
      if (clean) return clean;
    }
  }

  return '';
}


function stringArray(
  value: unknown
): string[] {

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => String(item ?? '').trim())
    .filter(Boolean);
}


function classDisplayName(
  data: AnyRecord
) {

  const raw =
    data.classKey ??
    data.className ??
    data.class ??
    '';

  return getClassTitle(raw);
}


function DossierSection({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {

  return (
    <section
      style={{
        padding: 18,
        border: '1px solid var(--admin-line-soft)',
        borderRadius: 16,
        background: 'rgba(255,255,255,.015)',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 11,
          alignItems: 'flex-start',
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 34,
            height: 34,
            flex: '0 0 34px',
            borderRadius: 10,
            background: 'rgba(255,255,255,.055)',
            border: '1px solid var(--admin-line-soft)',
            fontSize: 16,
          }}
        >
          {icon}
        </div>

        <div>
          <h3
            style={{
              margin: 0,
              color: 'var(--admin-text)',
              fontSize: 15,
              lineHeight: 1.25,
            }}
          >
            {title}
          </h3>

          {subtitle ? (
            <p
              style={{
                margin: '4px 0 0',
                color: 'var(--admin-muted)',
                fontSize: 11,
                lineHeight: 1.45,
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      {children}
    </section>
  );
}


function InfoTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {

  return (
    <div
      style={{
        minWidth: 0,
        padding: '11px 12px',
        borderRadius: 11,
        border: '1px solid var(--admin-line-soft)',
        background: 'rgba(255,255,255,.018)',
      }}
    >
      <span
        style={{
          display: 'block',
          marginBottom: 5,
          color: 'var(--admin-muted-2)',
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>

      <strong
        style={{
          display: 'block',
          minWidth: 0,
          overflowWrap: 'anywhere',
          color: accent
            ? 'var(--admin-accent-2)'
            : 'var(--admin-text)',
          fontSize: 13,
          lineHeight: 1.45,
          fontWeight: 750,
        }}
      >
        {value || '—'}
      </strong>
    </div>
  );
}


function Pill({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 28,
        padding: '5px 9px',
        borderRadius: 999,
        border: '1px solid var(--admin-line-soft)',
        background: 'rgba(255,255,255,.025)',
        color: '#d8dae1',
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}


function SpellCard({
  spell,
  index,
}: {
  spell: AnyRecord;
  index: number;
}) {

  const name = firstText(spell, ['name', 'title']) || `Заклинание ${index + 1}`;
  const castTime = firstText(spell, ['castTime', 'cast', 'time']);
  const form = firstText(spell, ['form']);
  const target = firstText(spell, ['target']);
  const rangeMeters = firstText(spell, ['rangeMeters']);
  const radius = firstText(spell, ['radius', 'range']);
  const area = firstText(spell, ['area']);
  const areaMeters = firstText(spell, ['areaMeters']);
  const movementMeters = firstText(spell, ['movementMeters']);
  const summonCount = firstText(spell, ['summonCount']);
  const durationMode = firstText(spell, ['durationMode']);
  const durationRounds = firstText(spell, ['durationRounds']);
  const duration = durationMode === 'Ходы'
    ? `${durationRounds || '—'} ход.`
    : durationMode || firstText(spell, ['duration']);
  const effect = firstText(spell, ['effect', 'description']);
  const powerType = firstText(spell, ['powerType', 'type']);
  const power = firstText(spell, ['basePower', 'power', 'powerRoll', 'damage', 'healing']);
  const die = firstText(spell, ['powerDie']) || (power ? 'd20' : '');
  const spellSchemaVersion = Number(spell.schemaVersion || 0);
  const isCurrentSchema = spellSchemaVersion === SPELL_SCHEMA_VERSION;
  const isCanonical = spellSchemaVersion >= 1 || Boolean(target || rangeMeters || area);
  const hitReviewed = spell.hitReviewed === true || target === 'На себя';
  const requiresHit = spell.requiresHit === true;
  const masterPending = isCurrentSchema && target !== 'На себя' && !hitReviewed;

  return (
    <article
      style={{
        padding: 15,
        border: '1px solid var(--admin-line-soft)',
        borderRadius: 14,
        background: 'rgba(0,0,0,.10)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
          marginBottom: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              color: 'var(--admin-muted-2)',
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Заклинание #{index + 1}
          </span>

          <strong
            style={{
              display: 'block',
              color: 'var(--admin-text)',
              fontSize: 15,
              overflowWrap: 'anywhere',
            }}
          >
            {name}
          </strong>

          <span
            style={{
              display: 'inline-flex',
              marginTop: 6,
              padding: '3px 7px',
              borderRadius: 999,
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '.04em',
              color: isCurrentSchema ? '#7fe0a7' : '#efb36a',
              border: `1px solid ${isCurrentSchema ? 'rgba(90,210,145,.24)' : 'rgba(230,175,80,.28)'}`,
              background: isCurrentSchema ? 'rgba(90,210,145,.08)' : 'rgba(230,175,80,.08)',
            }}
          >
            {isCurrentSchema
              ? `Формат v${SPELL_SCHEMA_VERSION} · готово`
              : `Формат v${spellSchemaVersion || 0} · нужно сохранить заново`}
          </span>
        </div>

        {power ? (
          <div
            style={{
              flex: '0 0 auto',
              minWidth: 86,
              padding: '8px 10px',
              borderRadius: 11,
              border: '1px solid rgba(192,160,255,.25)',
              background: 'rgba(125,88,190,.10)',
              textAlign: 'right',
            }}
          >
            <span
              style={{
                display: 'block',
                color: 'var(--admin-muted-2)',
                fontSize: 9,
              }}
            >
              {isCanonical ? 'Базовая сила' : (powerType || 'Сила')} · {die}
            </span>
            <b
              style={{
                color: 'var(--admin-accent-2)',
                fontSize: 22,
                lineHeight: 1.1,
              }}
            >
              {power}
            </b>
            <small
              style={{
                display: 'block',
                color: 'var(--admin-muted-2)',
                fontSize: 9,
              }}
            >
              из 20
            </small>
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 8,
          marginBottom: effect ? 10 : 0,
        }}
      >
        {powerType ? <InfoTile label="Тип" value={powerType} /> : null}
        {form ? <InfoTile label="Форма" value={form} /> : null}
        {castTime ? <InfoTile label="Время каста" value={castTime} /> : null}
        {target ? <InfoTile label="Цель" value={target} /> : null}
        {rangeMeters ? <InfoTile label="Дальность" value={`${rangeMeters} м`} /> : radius ? <InfoTile label="Радиус / дальность" value={radius} /> : null}
        {area && area !== 'Одна цель' ? <InfoTile label="Область" value={`${area}${areaMeters ? ` · ${areaMeters} м` : ''}`} /> : null}
        {movementMeters ? <InfoTile label="Перемещение" value={`${movementMeters} м`} /> : null}
        {summonCount ? <InfoTile label="Количество призывов" value={summonCount} /> : null}
        {duration ? <InfoTile label="Длительность" value={duration} /> : null}
        {isCurrentSchema && target !== 'На себя' ? (
          <InfoTile
            label="Попадание"
            value={hitReviewed ? (requiresHit ? 'D20 против сложности' : 'Проверка не нужна') : '⚠ Требуется решение мастера'}
          />
        ) : null}
      </div>

      {masterPending ? (
        <div
          style={{
            marginBottom: 10,
            padding: '10px 12px',
            borderRadius: 11,
            border: '1px solid rgba(225,175,70,.22)',
            background: 'rgba(205,155,60,.07)',
            color: '#e8c77f',
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          <b>⚠ Это не ошибка игрока.</b> Мастеру нужно открыть редактирование анкеты и выбрать для этого заклинания: нужен D20 против сложности цели или проверка попадания не требуется.
        </div>
      ) : null}

      {effect ? (
        <div
          style={{
            padding: '11px 12px',
            borderRadius: 11,
            border: '1px solid var(--admin-line-soft)',
            background: 'rgba(255,255,255,.014)',
          }}
        >
          <span
            style={{
              display: 'block',
              marginBottom: 5,
              color: 'var(--admin-muted-2)',
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
            }}
          >
            Эффект
          </span>
          <div
            style={{
              color: '#d1d3da',
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {effect}
          </div>
        </div>
      ) : null}
    </article>
  );
}


const DOSSIER_KNOWN_KEYS = new Set([
  'name',
  'characterName',
  'character_name',
  'fullName',
  'full_name',
  'nickname',
  'nick',
  'age',
  'suit',
  'kingdom',
  'homeland',
  'race',
  'bio',
  'biography',
  'history',
  'height',
  'weight',
  'body',
  'build',
  'hairColor',
  'hairLength',
  'eyes',
  'eyeColor',
  'marks',
  'appearance',
  'photo',
  'portrait',
  'image',
  'images',
  'hasGrimoire',
  'plannedAge',
  'noviceNote',
  'grimoire',
  'magic',
  'magicType',
  'magicName',
  'magicInspiration',
  'magicDescription',
  'elements',
  'elementKeys',
  'class',
  'className',
  'classKey',
  'role',
  'universalRoll',
  'spells',
  'combatNotes',
]);


function QuestionnaireDossier({
  questionnaire,
}: {
  questionnaire: QuestionnaireDetails;
}) {

  const data = questionnaire.data ?? {};

  const name = firstText(data, [
    'name',
    'characterName',
    'character_name',
    'fullName',
    'full_name',
    'nickname',
    'nick',
  ]) || questionnaire.name || 'Без имени';

  const age = firstText(data, ['age']);
  const kingdom = firstText(data, ['suit', 'kingdom', 'homeland']);
  const race = firstText(data, ['race']);
  const bio = firstText(data, ['bio', 'biography', 'history']);

  const height = firstText(data, ['height']);
  const weight = firstText(data, ['weight']);
  const body = firstText(data, ['body', 'build']);
  const hairColor = firstText(data, ['hairColor']);
  const hairLength = firstText(data, ['hairLength']);
  const eyes = firstText(data, ['eyes', 'eyeColor']);
  const marks = firstText(data, ['marks']);
  const appearance = firstText(data, ['appearance']);

  const magicName = firstText(data, ['magicName', 'magic', 'magicType']);
  const magicInspiration = firstText(data, ['magicInspiration']);
  const magicDescription = firstText(data, ['magicDescription']);
  const universalRoll = firstText(data, ['universalRoll']);

  let elements = stringArray(data.elements);
  if (elements.length === 0) {
    elements = stringArray(data.elementKeys).map(key => {
      const dictionary: Record<string, string> = {
        water: 'Вода',
        air: 'Воздух',
        earth: 'Земля',
        fire: 'Огонь',
        light: 'Свет',
        dark: 'Тьма',
        space: 'Пространство',
        wild: 'Дикая магия',
      };
      return dictionary[key] || key;
    });
  }

  const className = classDisplayName(data);

  const spells = Array.isArray(data.spells)
    ? data.spells
        .map(asRecord)
        .filter((item): item is AnyRecord => Boolean(item))
    : [];

  const portraitSources = collectImages(
    data.photo ??
    data.portrait ??
    data.image ??
    data.images ??
    []
  );

  const extraEntries = Object.entries(data)
    .filter(([key, value]) => {
      if (DOSSIER_KNOWN_KEYS.has(key)) return false;
      if (value === null || value === undefined || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    });

  return (
    <div
      style={{
        display: 'grid',
        gap: 14,
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: portraitSources.length > 0
            ? 'minmax(150px, 210px) 1fr'
            : '1fr',
          gap: 18,
          alignItems: 'stretch',
          padding: 18,
          border: '1px solid var(--admin-line-soft)',
          borderRadius: 18,
          background: 'linear-gradient(135deg, rgba(120,85,185,.10), rgba(255,255,255,.015))',
        }}
      >
        {portraitSources.length > 0 ? (
          <div
            style={{
              overflow: 'hidden',
              borderRadius: 14,
              border: '1px solid var(--admin-line-soft)',
              background: 'rgba(0,0,0,.18)',
              minHeight: 190,
            }}
          >
            <img
              src={portraitSources[0]}
              alt={`Портрет ${name}`}
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                minHeight: 190,
                objectFit: 'cover',
              }}
            />
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minWidth: 0,
          }}
        >
          <span
            style={{
              color: 'var(--admin-accent-2)',
              fontSize: 10,
              fontWeight: 850,
              letterSpacing: '.10em',
              textTransform: 'uppercase',
            }}
          >
            Личное дело кандидата
          </span>

          <h3
            style={{
              margin: '5px 0 5px',
              color: 'var(--admin-text)',
              fontSize: 24,
              lineHeight: 1.15,
              overflowWrap: 'anywhere',
            }}
          >
            {name}
          </h3>

          <div
            style={{
              color: 'var(--admin-muted)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {[age ? `${age} лет` : '', kingdom, race]
              .filter(Boolean)
              .join(' · ') || 'Основные сведения не указаны'}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 7,
              flexWrap: 'wrap',
              marginTop: 13,
            }}
          >
            {magicName ? <Pill>✨ {magicName}</Pill> : null}
            {className && className !== 'Класс выбран' ? <Pill>⚔ {className}</Pill> : null}
            {elements.map((element, index) => (
              <Pill key={`${element}-${index}`}>{element}</Pill>
            ))}
          </div>
        </div>
      </div>

      <DossierSection
        icon="✦"
        title="Основное"
        subtitle="Происхождение и история кандидата"
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
            gap: 9,
            marginBottom: bio ? 12 : 0,
          }}
        >
          <InfoTile label="Возраст" value={age ? `${age} лет` : '—'} />
          <InfoTile label="Королевство" value={kingdom || '—'} />
          <InfoTile label="Раса" value={race || '—'} />
          <InfoTile
            label="Гримуар"
            value={
              data.hasGrimoire === false
                ? 'Нет'
                : data.hasGrimoire === true
                  ? 'Получен'
                  : firstText(data, ['grimoire']) || '—'
            }
          />
        </div>

        {bio ? (
          <div
            style={{
              padding: '13px 14px',
              borderRadius: 12,
              border: '1px solid var(--admin-line-soft)',
              background: 'rgba(0,0,0,.10)',
              color: '#d0d2d9',
              fontSize: 12,
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {bio}
          </div>
        ) : null}
      </DossierSection>

      <DossierSection
        icon="◈"
        title="Внешность"
        subtitle="Параметры и отличительные признаки"
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
            gap: 9,
          }}
        >
          <InfoTile label="Рост" value={height || '—'} />
          <InfoTile label="Вес" value={weight || '—'} />
          <InfoTile label="Телосложение" value={body || '—'} />
          <InfoTile
            label="Волосы"
            value={
              [hairColor, hairLength]
                .filter(Boolean)
                .join(', ') || '—'
            }
          />
          <InfoTile label="Глаза" value={eyes || '—'} />
          <InfoTile label="Особые приметы" value={marks || 'Нет'} />
        </div>

        {appearance ? (
          <div
            style={{
              marginTop: 10,
              color: '#d0d2d9',
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {appearance}
          </div>
        ) : null}
      </DossierSection>

      <DossierSection
        icon="✧"
        title="Магия"
        subtitle="Природы, вдохновитель и собственная концепция"
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 9,
          }}
        >
          <InfoTile
            label="Название магии"
            value={magicName || '—'}
            accent
          />
          <InfoTile
            label="Магия-вдохновитель"
            value={magicInspiration || 'Своя идея / не указана'}
          />
          <InfoTile
            label="Боевой класс"
            value={className || '—'}
          />
          {universalRoll ? (
            <InfoTile
              label="Бросок d100"
              value={`${universalRoll} / 100`}
            />
          ) : null}
        </div>

        {elements.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 7,
              marginTop: 11,
            }}
          >
            {elements.map((element, index) => (
              <Pill key={`${element}-${index}`}>◆ {element}</Pill>
            ))}
          </div>
        ) : null}

        {magicDescription ? (
          <div
            style={{
              marginTop: 11,
              padding: '13px 14px',
              borderRadius: 12,
              border: '1px solid var(--admin-line-soft)',
              background: 'rgba(0,0,0,.10)',
              color: '#d0d2d9',
              fontSize: 12,
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {magicDescription}
          </div>
        ) : null}
      </DossierSection>

      <DossierSection
        icon="🎲"
        title={`Стартовые заклинания${spells.length ? ` · ${spells.length}` : ''}`}
        subtitle="Новые анкеты сразу используют единый формат боевого калькулятора"
      >
        {spells.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gap: 10,
            }}
          >
            {spells.map((spell, index) => (
              <SpellCard
                key={index}
                spell={spell}
                index={index}
              />
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--admin-muted)', fontSize: 12 }}>
            Заклинания в анкете не указаны.
          </div>
        )}
      </DossierSection>

      {extraEntries.length > 0 ? (
        <DossierSection
          icon="⋯"
          title="Дополнительные данные"
          subtitle="Поля из старых или расширенных версий анкеты"
        >
          <div className="admin-questionnaire-fields">
            {extraEntries.map(([key, value]) => (
              <div
                className="admin-questionnaire-field"
                key={key}
              >
                <span>{fieldTitle(key)}</span>
                <div>{renderValue(value, key)}</div>
              </div>
            ))}
          </div>
        </DossierSection>
      ) : null}
    </div>
  );
}


/* ============================================================
   ГЛАВНЫЙ КОМПОНЕНТ
   ============================================================ */

export default function AdminQuestionnaires() {

  const [
    questionnaires,
    setQuestionnaires
  ] =
    useState<
      QuestionnaireSummary[]
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
    testBusy,
    setTestBusy
  ] =
    useState(
      false
    );


  const [
    testMessage,
    setTestMessage
  ] =
    useState(
      ''
    );


  const [
    testError,
    setTestError
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
    selected,
    setSelected
  ] =
    useState<
      QuestionnaireDetails |
      null
    >(
      null
    );


  const [
    detailLoading,
    setDetailLoading
  ] =
    useState(
      false
    );


  const [
    detailError,
    setDetailError
  ] =
    useState(
      ''
    );


  const [
    statusBusy,
    setStatusBusy
  ] =
    useState(
      false
    );


  const [
    statusError,
    setStatusError
  ] =
    useState(
      ''
    );


  const [
    applicantFeedback,
    setApplicantFeedback
  ] =
    useState(
      ''
    );


  const [
    deleteBusy,
    setDeleteBusy
  ] =
    useState(
      false
    );


  const [
    deleteError,
    setDeleteError
  ] =
    useState(
      ''
    );


  const [
    questionnaireEditOpen,
    setQuestionnaireEditOpen
  ] = useState(false);

  const [
    questionnaireEditBusy,
    setQuestionnaireEditBusy
  ] = useState(false);

  const [
    questionnaireEditError,
    setQuestionnaireEditError
  ] = useState('');

  const [
    questionnaireEditMessage,
    setQuestionnaireEditMessage
  ] = useState('');

  const [
    questionnaireAccessBusy,
    setQuestionnaireAccessBusy
  ] = useState(false);

  const [
    questionnaireAccessError,
    setQuestionnaireAccessError
  ] = useState('');

  const [
    questionnaireAccessCode,
    setQuestionnaireAccessCode
  ] = useState('');


  /* =========================
     КОММЕНТАРИИ
     ========================= */

  const [
    notes,
    setNotes
  ] =
    useState<
      QuestionnaireNote[]
    >(
      []
    );


  const [
    notesLoading,
    setNotesLoading
  ] =
    useState(
      false
    );


  const [
    notesError,
    setNotesError
  ] =
    useState(
      ''
    );


  const [
    noteText,
    setNoteText
  ] =
    useState(
      ''
    );


  const [
    noteBusy,
    setNoteBusy
  ] =
    useState(
      false
    );


  /* ============================================================
     ЗАГРУЗКА СПИСКА АНКЕТ
     ============================================================ */

  const loadQuestionnaires =
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
              `/.netlify/functions/admin-questionnaires?t=${Date.now()}`,
              {
                method:
                  'GET',

                cache:
                  'no-store',
              }
            );


          let result:
            ListResponse |
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
              'Не удалось загрузить анкеты'
            );
          }


          setQuestionnaires(
            Array.isArray(
              result.questionnaires
            )
              ? result.questionnaires
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

      loadQuestionnaires();

    },
    [
      loadQuestionnaires,
    ]
  );


  /* ============================================================
     ТЕСТОВАЯ АНКЕТА «ПЁС ТЕСТОВИЧ»
     ============================================================ */

  const createTestQuestionnaire =
    useCallback(
      async () => {

        if (testBusy) {
          return;
        }

        setTestBusy(
          true
        );

        setTestError(
          ''
        );

        setTestMessage(
          ''
        );


        try {

          const portrait =
            await loadTestAsset(
              '/test-assets/pes-testovich-portrait'
            );

          if (!portrait) {

            throw new Error(
              'Не найден портрет Пса Тестовича. Положите картинку в public/test-assets под именем pes-testovich-portrait.png, .jpg, .jpeg или .webp.'
            );
          }


          /*
            Гримуар необязателен для создания тестовой анкеты.
            Если картинка уже лежит в public/test-assets — она тоже
            автоматически попадёт в анкету и позволит проверить перенос.
          */
          const grimoire =
            await loadTestAsset(
              '/test-assets/pes-testovich-grimoire'
            );


          const response =
            await fetch(
              '/.netlify/functions/admin-create-test-questionnaire',
              {
                method:
                  'POST',

                headers: {
                  'Content-Type':
                    'application/json',
                },

                body:
                  JSON.stringify({
                    portraitDataUrl:
                      portrait.dataUrl,
                    portraitFileName:
                      portrait.fileName,
                    grimoireDataUrl:
                      grimoire?.dataUrl ||
                      null,
                    grimoireFileName:
                      grimoire?.fileName ||
                      null,
                  }),
              }
            );


          let result:
            CreateTestQuestionnaireResponse |
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
            !result?.ok ||
            !result.questionnaire
          ) {

            throw new Error(
              result?.error ||
              'Не удалось создать тестовую анкету'
            );
          }


          setTestMessage(
            result.updated
              ? `Пёс Тестович обновлён. Портрет: да. Гримуар: ${result.questionnaire.hasGrimoire ? 'да' : 'пока нет'}.`
              : `Пёс Тестович создан и сразу одобрен. Портрет: да. Гримуар: ${result.questionnaire.hasGrimoire ? 'да' : 'пока нет'}.`
          );

          await loadQuestionnaires();

        } catch (
          err: any
        ) {

          setTestError(
            err?.message ||
            String(
              err
            )
          );

        } finally {

          setTestBusy(
            false
          );
        }
      },
      [
        testBusy,
        loadQuestionnaires,
      ]
    );


  const resetTestQuestionnaire =
    useCallback(
      async () => {

        if (testBusy) {
          return;
        }

        const confirmed =
          window.confirm(
            'Сбросить тестовую анкету «Пёс Тестович»?\n\n' +
            'Будет удалено только состояние тестовой анкеты в приложении. ' +
            'Google-таблицы персонажа эта кнопка НЕ удаляет.\n\n' +
            'Перед новым переносом убедитесь, что Пёс уже удалён/откачен из Основной, Системы и САЙТ.'
          );

        if (!confirmed) {
          return;
        }

        setTestBusy(
          true
        );

        setTestError(
          ''
        );

        setTestMessage(
          ''
        );

        try {

          const response =
            await fetch(
              '/.netlify/functions/admin-reset-test-questionnaire',
              {
                method:
                  'POST',

                headers: {
                  'Content-Type':
                    'application/json',
                },

                body:
                  JSON.stringify({
                    fixture:
                      'pes-testovich-v1',
                  }),
              }
            );

          let result:
            ResetTestQuestionnaireResponse |
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
              'Не удалось сбросить Пса Тестовича'
            );
          }

          if (
            selected &&
            isTestQuestionnaire(
              selected
            )
          ) {
            setSelected(
              null
            );
          }

          setNotes(
            []
          );

          setNoteText(
            ''
          );

          setTestMessage(
            result.totalDeleted
              ? `Пёс Тестович сброшен. Удалено тестовых записей: ${result.totalDeleted}. Теперь кнопку «🐶 Пёс Тестович» можно нажать заново.`
              : 'Тестовой анкеты Пса уже не было. Можно сразу создать её заново.'
          );

          await loadQuestionnaires();

        } catch (
          err: any
        ) {

          setTestError(
            err?.message ||
            String(
              err
            )
          );

        } finally {

          setTestBusy(
            false
          );
        }
      },
      [
        testBusy,
        selected,
        loadQuestionnaires,
      ]
    );


  /* ============================================================
     ЗАГРУЗКА КОММЕНТАРИЕВ
     ============================================================ */

  const loadNotes =
    useCallback(
      async (
        questionnaireKey:
          string
      ) => {

        setNotesLoading(
          true
        );

        setNotesError(
          ''
        );


        try {

          const response =
            await fetch(
              `/.netlify/functions/admin-questionnaire-notes?key=${encodeURIComponent(
                questionnaireKey
              )}&t=${Date.now()}`,
              {
                method:
                  'GET',

                cache:
                  'no-store',
              }
            );


          let result:
            NotesResponse |
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
              'Не удалось загрузить комментарии'
            );
          }


          setNotes(
            Array.isArray(
              result.notes
            )
              ? result.notes
              : []
          );

        } catch (
          err: any
        ) {

          setNotesError(
            err?.message ||
            String(
              err
            )
          );

        } finally {

          setNotesLoading(
            false
          );
        }
      },
      []
    );


  /* ============================================================
     ОТКРЫВАЕМ АНКЕТУ
     ============================================================ */

  const openQuestionnaire =
    async (
      questionnaire:
        QuestionnaireSummary
    ) => {

      setDetailLoading(
        true
      );

      setDetailError(
        ''
      );

      setStatusError(
        ''
      );

      setDeleteError(
        ''
      );

      setNotes(
        []
      );

      setNotesError(
        ''
      );

      setNoteText(
        ''
      );

      setApplicantFeedback(
        ''
      );

      setSelected(
        null
      );

      setQuestionnaireEditOpen(false);
      setQuestionnaireEditError('');
      setQuestionnaireEditMessage('');
      setQuestionnaireAccessError('');
      setQuestionnaireAccessCode('');


      try {

        const response =
          await fetch(
            `/.netlify/functions/admin-questionnaire-data?key=${encodeURIComponent(
              questionnaire.key
            )}&t=${Date.now()}`,
            {
              method:
                'GET',

              cache:
                'no-store',
            }
          );


        let result:
          DetailResponse |
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
          !result?.ok ||
          !result.questionnaire
        ) {

          throw new Error(
            result?.error ||
            'Не удалось открыть анкету'
          );
        }


        setSelected(
          result.questionnaire
        );

        setApplicantFeedback(
          result.questionnaire
            .applicantFeedback
            ?.text ||
          ''
        );


        /*
          Тестовая анкета нужна только для прогонки пайплайна.
          Комментарии для неё не загружаем вообще, чтобы
          не трогать backend заметок и не создавать шум.
        */
        if (
          !isTestQuestionnaire(
            result.questionnaire
          )
        ) {
          await loadNotes(
            result.questionnaire.key
          );
        }

      } catch (
        err: any
      ) {

        setDetailError(
          err?.message ||
          String(
            err
          )
        );

      } finally {

        setDetailLoading(
          false
        );
      }
    };


  /* ============================================================
     РЕДАКТИРОВАНИЕ / МИГРАЦИЯ АНКЕТЫ
     ============================================================ */

  const generateQuestionnaireAccess = async () => {
    if (!selected || questionnaireAccessBusy) {
      return;
    }

    const confirmed = window.confirm(
      'Перевыпустить код доступа к этой анкете?\n\nСтарый код доступа перестанет работать. Это нужно для анкет, отправленных до появления сохранения статуса у игрока.',
    );

    if (!confirmed) return;

    setQuestionnaireAccessBusy(true);
    setQuestionnaireAccessError('');
    setQuestionnaireAccessCode('');

    try {
      const response = await fetch(
        '/.netlify/functions/admin-questionnaire-access',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: selected.key,
          }),
        },
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result?.access?.accessCode) {
        throw new Error(
          result?.error ||
          'Не удалось получить код доступа',
        );
      }

      setQuestionnaireAccessCode(String(result.access.accessCode));
    } catch (error) {
      setQuestionnaireAccessError(
        error instanceof Error
          ? error.message
          : 'Не удалось получить код доступа',
      );
    } finally {
      setQuestionnaireAccessBusy(false);
    }
  };


  const saveQuestionnaireData = async (
    data: QuestionnaireData,
  ) => {
    if (!selected || questionnaireEditBusy) {
      return;
    }

    setQuestionnaireEditBusy(true);
    setQuestionnaireEditError('');
    setQuestionnaireEditMessage('');

    try {
      // Даже если старая анкета уже визуально выглядит как новая,
      // при сохранении принудительно переписываем каждое заклинание
      // в текущую версию схемы. Иначе Google Preview может видеть
      // schemaVersion текущего формата и блокировать запись как «старый формат».
      const normalizedData: QuestionnaireData = {
        ...data,
        spells: Array.isArray(data.spells)
          ? data.spells.map((spell) =>
              normalizeCanonicalSpell(
                spell as unknown as Record<string, unknown>,
                String(spell.powerType || 'Урон'),
              ) as QuestionnaireData['spells'][number],
            )
          : [],
      };

      const response = await fetch(
        '/.netlify/functions/admin-questionnaire-update',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: selected.key,
            data: normalizedData,
          }),
        },
      );

      let result: UpdateQuestionnaireResponse | null = null;

      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (!response.ok || !result?.ok || !result.questionnaire) {
        throw new Error(
          result?.error ||
          'Не удалось сохранить исправленную анкету',
        );
      }

      setSelected(result.questionnaire);
      setQuestionnaireEditOpen(false);

      const reviewedHitRules = normalizedData.spells.filter(
        (spell) => spell.target === 'На себя' || spell.hitReviewed === true,
      ).length;

      setQuestionnaireEditMessage(
        `Анкета сохранена в текущем формате. Правило попадания подтверждено для ${reviewedHitRules} из ${normalizedData.spells.length} заклинаний.`,
      );

      setQuestionnaires((current) =>
        current.map((item) =>
          item.key === result!.questionnaire!.key
            ? {
                ...item,
                updatedAt: result!.questionnaire!.updatedAt,
                status: result!.questionnaire!.status,
              }
            : item,
        ),
      );
    } catch (error) {
      setQuestionnaireEditError(
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить исправленную анкету',
      );
    } finally {
      setQuestionnaireEditBusy(false);
    }
  };


  /* ============================================================
     ИЗМЕНЕНИЕ СТАТУСА
     ============================================================ */

  const changeStatus =
    async (
      nextStatus:
        | 'review'
        | 'revision'
        | 'approved'
        | 'rejected'
    ) => {

      if (
        !selected ||
        statusBusy
      ) {

        return;
      }


      if (
        nextStatus ===
          'revision' &&
        !applicantFeedback.trim()
      ) {

        setStatusError(
          'Напишите игроку, что именно нужно исправить.'
        );

        return;
      }


      setStatusBusy(
        true
      );

      setStatusError(
        ''
      );


      try {

        const response =
          await fetch(
            '/.netlify/functions/admin-questionnaire-status',
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  key:
                    selected.key,

                  status:
                    nextStatus,

                  feedback:
                    nextStatus ===
                      'revision'
                      ? applicantFeedback.trim()
                      : undefined,
                }),
            }
          );


        let result:
          StatusResponse |
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
          !result?.ok ||
          !result.questionnaire
        ) {

          throw new Error(
            result?.error ||
            'Не удалось изменить статус анкеты'
          );
        }


        const updatedAt =
          result.questionnaire
            .updatedAt ||
          new Date()
            .toISOString();


        setSelected(
          current => {

            if (!current) {
              return current;
            }


            return {
              ...current,

              status:
                nextStatus,

              updatedAt,

              applicantFeedback:
                result.questionnaire
                  ?.applicantFeedback ??
                current.applicantFeedback ??
                null,
            };
          }
        );


        setQuestionnaires(
          current =>
            current.map(
              questionnaire => {

                if (
                  questionnaire.key !==
                  selected.key
                ) {

                  return questionnaire;
                }


                return {
                  ...questionnaire,

                  status:
                    nextStatus,

                  updatedAt,
                };
              }
            )
        );

      } catch (
        err: any
      ) {

        setStatusError(
          err?.message ||
          String(
            err
          )
        );

      } finally {

        setStatusBusy(
          false
        );
      }
    };


  /* ============================================================
     УДАЛЕНИЕ АНКЕТЫ
     ============================================================ */

  const deleteQuestionnaire =
    async () => {

      if (
        !selected ||
        deleteBusy
      ) {

        return;
      }


      const questionnaireName =
        selected.name ||
        `Анкета ${selected.id.slice(0, 8)}`;


      const confirmed =
        window.confirm(
          `Удалить анкету «${questionnaireName}» навсегда?\n\n` +
          'Анкета и все внутренние комментарии к ней будут удалены. Это действие нельзя отменить.'
        );


      if (!confirmed) {
        return;
      }


      setDeleteBusy(
        true
      );

      setDeleteError(
        ''
      );

      setStatusError(
        ''
      );


      try {

        const response =
          await fetch(
            '/.netlify/functions/admin-questionnaire-delete',
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  key:
                    selected.key,
                }),
            }
          );


        let result:
          DeleteResponse |
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
          !result?.ok ||
          !result.deleted
        ) {

          throw new Error(
            result?.error ||
            'Не удалось удалить анкету'
          );
        }


        const deletedKey =
          selected.key;


        setQuestionnaires(
          current =>
            current.filter(
              questionnaire =>
                questionnaire.key !==
                deletedKey
            )
        );


        setSelected(
          null
        );

        setNotes(
          []
        );

        setNoteText(
          ''
        );

        setNotesError(
          ''
        );

      } catch (
        err: any
      ) {

        setDeleteError(
          err?.message ||
          String(
            err
          )
        );

      } finally {

        setDeleteBusy(
          false
        );
      }
    };


  /* ============================================================
     ДОБАВЛЕНИЕ КОММЕНТАРИЯ
     ============================================================ */

  const addNote =
    async () => {

      if (
        !selected ||
        noteBusy
      ) {

        return;
      }


      const clean =
        noteText
          .trim();


      if (!clean) {

        setNotesError(
          'Введите комментарий'
        );

        return;
      }


      setNoteBusy(
        true
      );

      setNotesError(
        ''
      );


      try {

        const response =
          await fetch(
            '/.netlify/functions/admin-questionnaire-notes',
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  key:
                    selected.key,

                  text:
                    clean,
                }),
            }
          );


        let result:
          AddNoteResponse |
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
          !result?.ok ||
          !result.note
        ) {

          throw new Error(
            result?.error ||
            'Не удалось добавить комментарий'
          );
        }


        setNotes(
          current => [
            result!.note!,
            ...current,
          ]
        );


        setNoteText(
          ''
        );

      } catch (
        err: any
      ) {

        setNotesError(
          err?.message ||
          String(
            err
          )
        );

      } finally {

        setNoteBusy(
          false
        );
      }
    };


  /* ============================================================
     ПОИСК
     ============================================================ */

  const filtered =
    useMemo(
      () => {

        const query =
          search
            .trim()
            .toLowerCase();


        if (!query) {

          return questionnaires;
        }


        return questionnaires.filter(
          questionnaire => {

            const haystack = [
              questionnaire.id,
              questionnaire.status,

              statusTitle(
                questionnaire.status
              ),

              questionnaire.assistant?.id,
              questionnaire.assistant?.name,
              questionnaire.createdAt,
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
        questionnaires,
        search,
      ]
    );


  /* ============================================================
     JSX
     ============================================================ */

  return (

    <section className="admin-questionnaires">

      {/* ======================================================
          ЗАГОЛОВОК
          ====================================================== */}

      <div className="admin-section-head">

        <div>

          <div className="admin-eyebrow">
            РЕЕСТР
          </div>


          <h2>
            Анкеты персонажей
          </h2>


          <p>
            Все анкеты,
            отправленные через
            ГосМАГ-услуги.
          </p>

        </div>


        <div
          style={{
            display:
              'flex',
            flexWrap:
              'wrap',
            gap:
              8,
            justifyContent:
              'flex-end',
          }}
        >

          <button
            type="button"

            className="admin-button admin-button-primary"

            onClick={
              createTestQuestionnaire
            }

            disabled={
              testBusy
            }

            title="Создаёт или обновляет заранее заполненную approved-анкету Пса Тестовича. Реальных игроков не затрагивает."
          >

            {
              testBusy
                ? 'Создаём Пса…'
                : '🐶 Пёс Тестович'
            }

          </button>


          <button
            type="button"

            className="admin-button"

            onClick={
              resetTestQuestionnaire
            }

            disabled={
              testBusy
            }

            title="Удаляет только тестовую анкету Пса из приложения и сбрасывает её жизненный цикл. Google-таблицы не удаляет."
          >

            {
              testBusy
                ? 'Подождите…'
                : '♻ Сбросить Пса'
            }

          </button>


          <button
            type="button"

            className="admin-button"

            onClick={
              loadQuestionnaires
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

      </div>


      {
        testMessage
          ? (
            <div
              style={{
                marginBottom:
                  12,
                padding:
                  '10px 12px',
                border:
                  '1px solid rgba(69, 224, 161, .32)',
                borderRadius:
                  12,
                background:
                  'rgba(69, 224, 161, .08)',
                color:
                  '#78f0bd',
              }}
            >
              ✓ {testMessage}
            </div>
          )
          : null
      }


      {
        testError
          ? (
            <div
              style={{
                marginBottom:
                  12,
                padding:
                  '10px 12px',
                border:
                  '1px solid rgba(255, 105, 125, .35)',
                borderRadius:
                  12,
                background:
                  'rgba(255, 105, 125, .08)',
                color:
                  '#ff9cab',
              }}
            >
              ✕ {testError}
            </div>
          )
          : null
      }


      {/* ======================================================
          ПОИСК
          ====================================================== */}

      <div className="admin-questionnaire-tools">

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

            placeholder="Помощник, ID, статус..."
          />

        </label>

      </div>


      {/* ======================================================
          ОШИБКИ И ЗАГРУЗКА
          ====================================================== */}

      {
        error
          ? (

            <div className="admin-error-state">

              <strong>
                Не удалось загрузить анкеты
              </strong>

              <p>
                {error}
              </p>

            </div>

          )
          : null
      }


      {
        loading &&
        questionnaires.length ===
          0
          ? (

            <div className="admin-empty-state">

              <span className="admin-empty-symbol">
                ✦
              </span>

              <strong>
                Загружаем анкеты...
              </strong>

            </div>

          )
          : null
      }


      {
        !loading &&
        !error &&
        questionnaires.length ===
          0
          ? (

            <div className="admin-empty-state">

              <span className="admin-empty-symbol">
                ◌
              </span>

              <strong>
                Анкет пока нет
              </strong>

              <p>
                Здесь появится первая анкета
                после её отправки через портал.
              </p>

            </div>

          )
          : null
      }


      {
        !loading &&
        !error &&
        questionnaires.length >
          0 &&
        filtered.length ===
          0
          ? (

            <div className="admin-empty-state">

              <span className="admin-empty-symbol">
                ⌕
              </span>

              <strong>
                Ничего не найдено
              </strong>

            </div>

          )
          : null
      }


      {/* ======================================================
          СПИСОК
          ====================================================== */}

      {
        filtered.length >
          0
          ? (

            <div className="admin-questionnaire-list">

              {
                filtered.map(
                  questionnaire => (

                    <article
                      className="admin-questionnaire-card"

                      key={
                        questionnaire.key
                      }
                    >

                      <div className="admin-questionnaire-card-top">

                        <div>

                          <span className="admin-questionnaire-status">

                            {
                              statusTitle(
                                questionnaire.status
                              )
                            }

                          </span>


                          {
                            questionnaire.isTest
                              ? (
                                <span
                                  style={{
                                    display:
                                      'inline-flex',
                                    marginLeft:
                                      8,
                                    padding:
                                      '2px 7px',
                                    borderRadius:
                                      999,
                                    border:
                                      '1px solid rgba(255, 208, 92, .35)',
                                    background:
                                      'rgba(255, 208, 92, .08)',
                                    color:
                                      '#ffd96b',
                                    fontSize:
                                      10,
                                    fontWeight:
                                      800,
                                    letterSpacing:
                                      '.08em',
                                  }}
                                >
                                  TEST
                                </span>
                              )
                              : null
                          }


                          <h3>
                            {
                              questionnaire.isTest
                                ? 'Пёс Тестович'
                                : 'Анкета персонажа'
                            }
                          </h3>

                        </div>


                        <span className="admin-questionnaire-date">

                          {
                            formatDate(
                              questionnaire.createdAt
                            )
                          }

                        </span>

                      </div>


                      <div className="admin-questionnaire-info">

                        <div>

                          <span>
                            Помощник
                          </span>

                          <strong>

                            {
                              questionnaire.assistant?.name ||
                              questionnaire.assistant?.id ||
                              '—'
                            }

                          </strong>

                        </div>


                        <div>

                          <span>
                            ID анкеты
                          </span>

                          <strong>

                            {
                              questionnaire.id
                                ? questionnaire.id.slice(
                                    0,
                                    8
                                  )
                                : '—'
                            }

                          </strong>

                        </div>

                      </div>


                      <button
                        type="button"

                        className="admin-button admin-button-primary"

                        onClick={
                          () =>
                            openQuestionnaire(
                              questionnaire
                            )
                        }

                        disabled={
                          detailLoading
                        }
                      >
                        Открыть анкету
                      </button>

                    </article>

                  )
                )
              }

            </div>

          )
          : null
      }


      {/* ======================================================
          ЗАГРУЗКА ОДНОЙ АНКЕТЫ
          ====================================================== */}

      {
        detailLoading
          ? (

            <div className="admin-questionnaire-view">

              <div className="admin-empty-state">

                <span className="admin-empty-symbol">
                  ✦
                </span>

                <strong>
                  Открываем анкету...
                </strong>

              </div>

            </div>

          )
          : null
      }


      {
        detailError
          ? (

            <div className="admin-questionnaire-view">

              <div className="admin-error-state">

                <strong>
                  Не удалось открыть анкету
                </strong>

                <p>
                  {detailError}
                </p>

              </div>

            </div>

          )
          : null
      }


      {/* ======================================================
          ПОЛНАЯ АНКЕТА
          ====================================================== */}

      {
        selected &&
        !detailLoading
          ? (

            <div className="admin-questionnaire-view">

              {/* ==============================================
                  ШАПКА
                  ============================================== */}

              <div className="admin-questionnaire-view-head">

                <div>

                  <div className="admin-eyebrow">
                    АНКЕТА ПЕРСОНАЖА
                  </div>


                  <h2>

                    {
                      selected.name ||
                      'Анкета персонажа'
                    }

                  </h2>


                  <p>

                    Подана{' '}

                    {
                      formatDate(
                        selected.createdAt
                      )
                    }

                  </p>

                </div>


                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="admin-button admin-button-primary"
                    disabled={questionnaireEditBusy}
                    onClick={() => {
                      setQuestionnaireEditError('');
                      setQuestionnaireEditMessage('');
                      setQuestionnaireEditOpen(true);
                    }}
                  >
                    ✎ Редактировать / обновить формат
                  </button>

                  <button
                    type="button"
                    className="admin-button"
                    disabled={questionnaireAccessBusy}
                    onClick={() => {
                      void generateQuestionnaireAccess();
                    }}
                    title="Для старых анкет, у которых игрок не получил сохранённый ключ статуса"
                  >
                    {questionnaireAccessBusy ? 'Готовлю код…' : '🔑 Выдать доступ игроку'}
                  </button>

                  <button
                    type="button"
                    className="admin-button"
                    onClick={() => {
                      setSelected(null);
                      setDetailError('');
                      setStatusError('');
                      setDeleteError('');
                      setNotes([]);
                      setNotesError('');
                      setNoteText('');
                      setQuestionnaireEditOpen(false);
                      setQuestionnaireEditError('');
                      setQuestionnaireEditMessage('');
                      setQuestionnaireAccessError('');
                      setQuestionnaireAccessCode('');
                    }}
                  >
                    × Закрыть
                  </button>
                </div>

              </div>


              {/* ==============================================
                  СВОДКА
                  ============================================== */}

              <div className="admin-questionnaire-summary">

                <div>

                  <span>
                    Статус
                  </span>

                  <strong>

                    {
                      statusTitle(
                        selected.status
                      )
                    }

                  </strong>

                </div>


                <div>

                  <span>
                    Помощник
                  </span>

                  <strong>

                    {
                      selected.assistant?.name ||
                      '—'
                    }

                  </strong>

                </div>


                <div>

                  <span>
                    ID
                  </span>

                  <strong>

                    {
                      selected.id ||
                      '—'
                    }

                  </strong>

                </div>

                <div>
                  <span>Формат</span>
                  <strong
                    style={{
                      color: questionnaireNeedsSpellMigration(selected.data)
                        ? '#e7c27c'
                        : undefined,
                    }}
                  >
                    {questionnaireNeedsSpellMigration(selected.data)
                      ? 'Нужно обновить'
                      : 'Актуальный'}
                  </strong>
                </div>

              </div>


              {questionnaireAccessError && (
                <div className="admin-error-state" style={{ marginBottom: 16 }}>
                  {questionnaireAccessError}
                </div>
              )}

              {questionnaireAccessCode && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: 14,
                    border: '1px solid rgba(190,145,245,.28)',
                    borderRadius: 14,
                    background: 'rgba(135,85,190,.08)',
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <strong>Код доступа для игрока</strong>
                  <span style={{ color: 'var(--admin-muted-2)', fontSize: 11, lineHeight: 1.5 }}>
                    Отправьте этот код игроку. В ГосМАГ → «Создать анкету» он сможет выбрать «Уже отправляли анкету?» и вставить код. После этого увидит статус и, если анкета на доработке, сможет её исправить.
                  </span>
                  <textarea
                    readOnly
                    value={questionnaireAccessCode}
                    rows={3}
                    onFocus={(event) => event.currentTarget.select()}
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
                  />
                  <small style={{ color: '#e7c27c' }}>Важно: новый код заменил старый доступ к этой анкете.</small>
                </div>
              )}

              {questionnaireEditMessage && (
                <div className="admin-success-state" style={{ marginBottom: 16 }}>
                  {questionnaireEditMessage}
                </div>
              )}

              {questionnaireEditError && !questionnaireEditOpen && (
                <div className="admin-error-state" style={{ marginBottom: 16 }}>
                  {questionnaireEditError}
                </div>
              )}

              {questionnaireEditOpen && (
                <div
                  style={{
                    marginBottom: 20,
                    padding: 16,
                    border: '1px solid var(--admin-line-soft)',
                    borderRadius: 16,
                    background: 'rgba(255,255,255,.015)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                    <div>
                      <div className="admin-eyebrow">РЕДАКТОР АНКЕТЫ</div>
                      <strong>Старая анкета будет открыта в текущем формате</strong>
                      <p style={{ margin: '6px 0 0', color: 'var(--admin-muted-2)', fontSize: 12, lineHeight: 1.55 }}>
                        При открытии старые заклинания переводятся в новую структуру редактора. Ничего не меняется в Google-персонаже: здесь редактируется именно сохранённая заявка. Статус анкеты также не меняется автоматически.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="admin-button"
                      disabled={questionnaireEditBusy}
                      onClick={() => {
                        setQuestionnaireEditOpen(false);
                        setQuestionnaireEditError('');
                      }}
                    >
                      Закрыть редактор
                    </button>
                  </div>

                  {questionnaireEditError && (
                    <div className="admin-error-state" style={{ marginBottom: 12 }}>
                      {questionnaireEditError}
                    </div>
                  )}

                  <QuestionnaireWizard
                    assistant={{
                      name: selected.assistant?.name || 'Администратор',
                    }}
                    classes={CLASSES}
                    initial={selected.data as Partial<QuestionnaireData>}
                    adminMode
                    onCancel={() => {
                      if (!questionnaireEditBusy) {
                        setQuestionnaireEditOpen(false);
                        setQuestionnaireEditError('');
                      }
                    }}
                    onFinish={(data) => {
                      void saveQuestionnaireData(data);
                    }}
                  />
                </div>
              )}

              {!questionnaireEditOpen && (<>
              {/* ==============================================
                  РЕШЕНИЕ АДМИНА
                  ============================================== */}

              <div
                style={{
                  marginBottom:
                    20,

                  padding:
                    16,

                  border:
                    '1px solid var(--admin-line-soft)',

                  borderRadius:
                    16,

                  background:
                    'rgba(255,255,255,.015)',
                }}
              >

                <div
                  style={{
                    marginBottom:
                      18,

                    padding:
                      16,

                    border:
                      '1px solid rgba(220,170,70,.22)',

                    borderRadius:
                      14,

                    background:
                      'rgba(220,170,70,.045)',
                  }}
                >
                  <div
                    style={{
                      marginBottom:
                        8,

                      color:
                        '#e2bd72',

                      fontSize:
                        10,

                      fontWeight:
                        900,

                      letterSpacing:
                        '.08em',

                      textTransform:
                        'uppercase',
                    }}
                  >
                    Сообщение игроку
                  </div>

                  <textarea
                    value={
                      applicantFeedback
                    }

                    onChange={
                      event =>
                        setApplicantFeedback(
                          event.target.value
                            .slice(0, 3000)
                        )
                    }

                    placeholder="Например: допишите биографию и переделайте второе заклинание — его эффект не подходит выбранному классу."

                    rows={4}

                    style={{
                      boxSizing:
                        'border-box',

                      width:
                        '100%',

                      resize:
                        'vertical',

                      border:
                        '1px solid var(--admin-line-soft)',

                      borderRadius:
                        12,

                      background:
                        'rgba(255,255,255,.025)',

                      color:
                        'var(--admin-text)',

                      padding:
                        '12px 13px',

                      font:
                        'inherit',

                      fontSize:
                        12,

                      lineHeight:
                        1.55,

                      outline:
                        'none',
                    }}
                  />

                  <div
                    style={{
                      display:
                        'flex',

                      justifyContent:
                        'space-between',

                      gap:
                        12,

                      marginTop:
                        7,

                      color:
                        'var(--admin-muted-2)',

                      fontSize:
                        10,
                    }}
                  >
                    <span>
                      Этот текст увидит игрок только при статусе «На доработке». Внутренние комментарии ниже игроку не показываются.
                    </span>

                    <span
                      style={{
                        whiteSpace:
                          'nowrap',
                      }}
                    >
                      {applicantFeedback.length} / 3000
                    </span>
                  </div>
                </div>


                <div
                  style={{
                    marginBottom:
                      10,

                    color:
                      'var(--admin-muted-2)',

                    fontSize:
                      10,

                    fontWeight:
                      800,

                    letterSpacing:
                      '.08em',

                    textTransform:
                      'uppercase',
                  }}
                >
                  Решение администратора
                </div>


                <div
                  style={{
                    display:
                      'flex',

                    flexWrap:
                      'wrap',

                    gap:
                      10,
                  }}
                >

                  <button
                    type="button"

                    className="admin-button"

                    disabled={
                      statusBusy ||
                      selected.status ===
                        'review'
                    }

                    onClick={
                      () =>
                        changeStatus(
                          'review'
                        )
                    }
                  >

                    {
                      selected.status ===
                      'review'
                        ? '✓ На рассмотрении'
                        : 'На рассмотрение'
                    }

                  </button>


                  <button
                    type="button"

                    className="admin-button"

                    disabled={
                      statusBusy ||
                      selected.status ===
                        'revision'
                    }

                    onClick={
                      () =>
                        changeStatus(
                          'revision'
                        )
                    }

                    style={
                      selected.status ===
                      'revision'
                        ? undefined
                        : {
                            borderColor:
                              'rgba(220,170,70,.35)',

                            color:
                              '#e7c27c',
                          }
                    }
                  >
                    {
                      selected.status ===
                      'revision'
                        ? '✓ На доработке'
                        : '↺ На доработку'
                    }
                  </button>


                  <button
                    type="button"

                    className="admin-button admin-button-primary"

                    disabled={
                      statusBusy ||
                      selected.status ===
                        'approved'
                    }

                    onClick={
                      () =>
                        changeStatus(
                          'approved'
                        )
                    }
                  >

                    {
                      selected.status ===
                      'approved'
                        ? '✓ Одобрена'
                        : '✓ Одобрить'
                    }

                  </button>


                  <button
                    type="button"

                    className="admin-button"

                    disabled={
                      statusBusy ||
                      selected.status ===
                        'rejected'
                    }

                    onClick={
                      () =>
                        changeStatus(
                          'rejected'
                        )
                    }

                    style={
                      selected.status ===
                      'rejected'
                        ? undefined
                        : {
                            borderColor:
                              'rgba(210,80,100,.32)',

                            color:
                              '#f0a0ad',
                          }
                    }
                  >

                    {
                      selected.status ===
                      'rejected'
                        ? '✓ Отклонена'
                        : 'Отклонить'
                    }

                  </button>


                  <button
                    type="button"

                    className="admin-button"

                    disabled={
                      statusBusy ||
                      deleteBusy
                    }

                    onClick={
                      deleteQuestionnaire
                    }

                    style={{
                      marginLeft:
                        'auto',

                      borderColor:
                        'rgba(220,70,85,.48)',

                      background:
                        'rgba(160,30,45,.10)',

                      color:
                        '#ff9aa8',
                    }}
                  >

                    {
                      deleteBusy
                        ? 'Удаляем…'
                        : '🗑 Удалить анкету'
                    }

                  </button>

                </div>


                {
                  statusBusy
                    ? (

                      <div
                        style={{
                          marginTop:
                            10,

                          color:
                            'var(--admin-muted)',
                        }}
                      >
                        Сохраняем решение...
                      </div>

                    )
                    : null
                }


                {
                  statusError
                    ? (

                      <div
                        className="admin-error-state"

                        style={{
                          marginTop:
                            12,
                        }}
                      >

                        <strong>
                          Не удалось изменить статус
                        </strong>

                        <p>
                          {statusError}
                        </p>

                      </div>

                    )
                    : null
                }



                {
                  deleteError
                    ? (

                      <div
                        className="admin-error-state"

                        style={{
                          marginTop:
                            12,
                        }}
                      >

                        <strong>
                          Не удалось удалить анкету
                        </strong>

                        <p>
                          {deleteError}
                        </p>

                      </div>

                    )
                    : null
                }

              </div>


              {/* ==============================================
                  ВНУТРЕННИЕ КОММЕНТАРИИ
                  ============================================== */}

              {
                isTestQuestionnaire(
                  selected
                )
                  ? (

                    <div
                      style={{
                        marginBottom:
                          20,
                        padding:
                          '14px 18px',
                        border:
                          '1px dashed rgba(255, 208, 92, .28)',
                        borderRadius:
                          16,
                        background:
                          'rgba(255, 208, 92, .035)',
                        color:
                          'var(--admin-muted)',
                        fontSize:
                          12,
                        lineHeight:
                          1.55,
                      }}
                    >
                      🐶 Тестовая анкета — внутренние комментарии отключены.
                    </div>

                  )
                  : (

              <div
                style={{
                  marginBottom:
                    20,

                  padding:
                    18,

                  border:
                    '1px solid var(--admin-line-soft)',

                  borderRadius:
                    16,

                  background:
                    'rgba(255,255,255,.015)',
                }}
              >

                <div
                  style={{
                    marginBottom:
                      6,

                    color:
                      'var(--admin-accent-2)',

                    fontSize:
                      11,

                    fontWeight:
                      800,

                    letterSpacing:
                      '.08em',

                    textTransform:
                      'uppercase',
                  }}
                >
                  Внутренние комментарии
                </div>


                <div
                  style={{
                    marginBottom:
                      14,

                    color:
                      'var(--admin-muted)',

                    fontSize:
                      12,

                    lineHeight:
                      1.5,
                  }}
                >
                  Эти заметки видят только
                  МераМера, Рен и Люмин.
                </div>


                {/* ============================================
                    ФОРМА КОММЕНТАРИЯ
                    ============================================ */}

                <textarea
                  value={
                    noteText
                  }

                  onChange={
                    event => {

                      setNoteText(
                        event.target.value
                      );

                      setNotesError(
                        ''
                      );
                    }
                  }

                  placeholder="Например: уточнить ограничения магии, проверить биографию, связаться с игроком..."

                  maxLength={
                    3000
                  }

                  rows={
                    4
                  }

                  style={{
                    width:
                      '100%',

                    boxSizing:
                      'border-box',

                    resize:
                      'vertical',

                    padding:
                      '12px 14px',

                    border:
                      '1px solid var(--admin-line)',

                    borderRadius:
                      12,

                    outline:
                      'none',

                    background:
                      'rgba(0,0,0,.18)',

                    color:
                      'var(--admin-text)',

                    font:
                      'inherit',

                    fontSize:
                      13,

                    lineHeight:
                      1.55,
                  }}
                />


                <div
                  style={{
                    display:
                      'flex',

                    justifyContent:
                      'space-between',

                    alignItems:
                      'center',

                    gap:
                      12,

                    flexWrap:
                      'wrap',

                    marginTop:
                      10,
                  }}
                >

                  <span
                    style={{
                      color:
                        'var(--admin-muted-2)',

                      fontSize:
                        10,
                    }}
                  >
                    {noteText.length} / 3000
                  </span>


                  <button
                    type="button"

                    className="admin-button admin-button-primary"

                    onClick={
                      addNote
                    }

                    disabled={
                      noteBusy ||
                      !noteText.trim()
                    }
                  >

                    {
                      noteBusy
                        ? 'Сохраняем…'
                        : 'Добавить комментарий'
                    }

                  </button>

                </div>


                {
                  notesError
                    ? (

                      <div
                        className="admin-error-state"

                        style={{
                          marginTop:
                            12,
                        }}
                      >

                        <strong>
                          Ошибка комментариев
                        </strong>

                        <p>
                          {notesError}
                        </p>

                      </div>

                    )
                    : null
                }


                {/* ============================================
                    СПИСОК КОММЕНТАРИЕВ
                    ============================================ */}

                <div
                  style={{
                    display:
                      'grid',

                    gap:
                      10,

                    marginTop:
                      18,
                  }}
                >

                  {
                    notesLoading
                      ? (

                        <div
                          style={{
                            color:
                              'var(--admin-muted)',
                          }}
                        >
                          Загружаем комментарии...
                        </div>

                      )
                      : null
                  }


                  {
                    !notesLoading &&
                    notes.length ===
                      0
                      ? (

                        <div
                          style={{
                            padding:
                              14,

                            border:
                              '1px dashed var(--admin-line-soft)',

                            borderRadius:
                              12,

                            color:
                              'var(--admin-muted)',

                            fontSize:
                              12,
                          }}
                        >
                          Комментариев пока нет.
                        </div>

                      )
                      : null
                  }


                  {
                    notes.map(
                      note => (

                        <article
                          key={
                            note.id
                          }

                          style={{
                            padding:
                              14,

                            border:
                              '1px solid var(--admin-line-soft)',

                            borderRadius:
                              14,

                            background:
                              'rgba(255,255,255,.018)',
                          }}
                        >

                          <div
                            style={{
                              display:
                                'flex',

                              justifyContent:
                                'space-between',

                              gap:
                                10,

                              flexWrap:
                                'wrap',

                              marginBottom:
                                8,
                            }}
                          >

                            <strong
                              style={{
                                color:
                                  'var(--admin-text)',

                                fontSize:
                                  13,
                              }}
                            >

                              {
                                note.admin?.name ||
                                note.admin?.login ||
                                'Администратор'
                              }

                            </strong>


                            <span
                              style={{
                                color:
                                  'var(--admin-muted-2)',

                                fontSize:
                                  10,

                                fontVariantNumeric:
                                  'tabular-nums',
                              }}
                            >

                              {
                                formatDate(
                                  note.createdAt
                                )
                              }

                            </span>

                          </div>


                          <div
                            style={{
                              color:
                                '#c9cbd3',

                              fontSize:
                                13,

                              lineHeight:
                                1.65,

                              whiteSpace:
                                'pre-wrap',

                              overflowWrap:
                                'anywhere',
                            }}
                          >
                            {note.text}
                          </div>

                        </article>

                      )
                    )
                  }

                </div>

              </div>


                  )
              }


              </>)}

              {!questionnaireEditOpen && (<>
              {/* ==============================================
                  КРАСИВОЕ ЛИЧНОЕ ДЕЛО
                  ============================================== */}

              <QuestionnaireDossier
                questionnaire={selected}
              />

              <QuestionnaireGooglePreview
                data={selected.data}
                questionnaireId={selected.id}
                questionnaireKey={selected.key}
                questionnaireStatus={selected.status}
              />
              </>)}

            </div>

          )
          : null
      }

    </section>
  );
}
