import React, { useEffect, useMemo, useState } from 'react';

type ProfileItem = {
  label: string;
  value: string;
};

type Props = {
  id?: string;
  name: string;
  emoji?: string;
  image?: string;
  role?: string;
  tags?: string[];
  complexity?: string;
  detailTagline?: string;
  detailHowToPlay?: string;
  detailProfile?: ProfileItem[];
  detailStrengths?: string[];
  detailWeaknesses?: string[];
  detailSynergy?: string[];
  detailMistakes?: string[];
  detailProgression?: string;
};

function splitRoles(input?: string, tags?: string[]) {
  const values = [
    ...String(input ?? '')
      .split(/[,/;]+/)
      .map(value => value.trim())
      .filter(Boolean),
    ...(tags ?? []).map(value => value.trim()).filter(Boolean),
  ];

  const seen = new Set<string>();
  return values.filter(value => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classMonogram(name: string) {
  const cleaned = name.replace(/\([^)]*\)/g, ' ').trim();
  const parts = cleaned.split(/[\s–—-]+/).filter(Boolean);
  if (!parts.length) return '✦';
  return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function TextBlock({ text }: { text?: string }) {
  if (!text) return null;

  const paragraphs = text
    .split(/\n\s*\n/)
    .map(value => value.trim())
    .filter(Boolean);

  return (
    <div className="class-detail-copy">
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
      ))}
    </div>
  );
}

function BulletSection({
  title,
  items,
  tone,
}: {
  title: string;
  items?: string[];
  tone?: 'positive' | 'negative';
}) {
  if (!items?.length) return null;

  return (
    <section className={`class-detail-panel ${tone ? `is-${tone}` : ''}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default function ClassCard({
  id,
  name,
  image,
  role,
  tags,
  complexity,
  detailTagline: tagline,
  detailHowToPlay: howToPlay,
  detailProfile: profile = [],
  detailStrengths: strengths = [],
  detailWeaknesses: weaknesses = [],
  detailSynergy: synergy = [],
  detailMistakes: mistakes = [],
  detailProgression: progression,
}: Props) {
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const roles = useMemo(() => splitRoles(role, tags), [role, tags]);
  const primaryRole = roles[0] ?? 'Класс';
  const monogram = classMonogram(name);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const art = image || (id ? `/class-icons/${id}.png` : undefined);
  const hasArt = Boolean(art && imageReady && !imageFailed);
  const roleLine = roles.slice(0, 3).join(' · ');

  const artNode = (detail = false) => (
    <div
      className={`${detail ? 'class-detail-emblem' : 'class-card-emblem'} ${hasArt ? 'has-image' : 'is-fallback'}`}
      aria-hidden="true"
    >
      <span className="class-emblem-halo" />
      <div className="class-emblem-fallback">
        <span>{monogram}</span>
      </div>

      {art && !imageFailed ? (
        <img
          src={art}
          alt=""
          loading={detail ? undefined : 'lazy'}
          onLoad={() => setImageReady(true)}
          onError={() => {
            setImageFailed(true);
            setImageReady(false);
          }}
        />
      ) : null}
    </div>
  );

  return (
    <>
      <article className="class-card" data-primary-role={primaryRole.toLowerCase()}>
        <button
          type="button"
          className="class-card-open"
          onClick={() => setOpen(true)}
          aria-label={`Открыть класс ${name}`}
        >
          <div className="class-card-visual">
            {artNode(false)}
          </div>

          <div className="class-card-body">
            <div className="class-card-meta">
              <span className="class-card-roleline">{roleLine || primaryRole}</span>
              {complexity ? <span className="class-card-complexity-inline">{complexity}</span> : null}
            </div>

            <h2>{name}</h2>
            {tagline ? <p className="class-card-tagline">{tagline}</p> : null}

            <div className="class-card-footer">
              <span>Подробнее</span>
              <b aria-hidden="true">↗</b>
            </div>
          </div>
        </button>
      </article>

      {open ? (
        <div
          className="class-detail-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            className="class-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label={name}
          >
            <button
              type="button"
              className="class-detail-close"
              onClick={() => setOpen(false)}
              aria-label="Закрыть"
            >
              ×
            </button>

            <header className="class-detail-hero">
              <div className="class-detail-visual">
                {artNode(true)}
              </div>

              <div className="class-detail-heading">
                <div className="class-detail-overline">
                  <span>{primaryRole}</span>
                  {complexity ? <span>{complexity}</span> : null}
                </div>

                <h2>{name}</h2>
                {tagline ? <p>{tagline}</p> : null}

                {roles.length ? (
                  <div className="class-detail-roles">
                    {roles.map(value => <span key={value}>{value}</span>)}
                  </div>
                ) : null}
              </div>
            </header>

            <div className="class-detail-content">
              {profile.length ? (
                <section className="class-detail-profile" aria-label="Профиль класса">
                  {profile.map(item => (
                    <div key={`${item.label}-${item.value}`}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </section>
              ) : null}

              <div className="class-detail-main-grid">
                <div className="class-detail-main-column">
                  {howToPlay ? (
                    <section className="class-detail-story class-detail-story-main">
                      <div className="class-detail-section-title">Как играется</div>
                      <TextBlock text={howToPlay} />
                    </section>
                  ) : null}

                  {(strengths.length || weaknesses.length) ? (
                    <div className="class-detail-columns">
                      <BulletSection title="Сильные стороны" items={strengths} tone="positive" />
                      <BulletSection title="Слабые стороны" items={weaknesses} tone="negative" />
                    </div>
                  ) : null}
                </div>

                <aside className="class-detail-side-column">
                  {synergy.length ? (
                    <section className="class-detail-story">
                      <div className="class-detail-section-title">Хорошо сочетается</div>
                      <div className="class-detail-copy">
                        {synergy.map((item, index) => <p key={`synergy-${index}`}>{item}</p>)}
                      </div>
                    </section>
                  ) : null}

                  {mistakes.length ? (
                    <BulletSection
                      title={mistakes.length === 1 ? 'Частая ошибка' : 'Частые ошибки'}
                      items={mistakes}
                    />
                  ) : null}

                  {progression ? (
                    <section className="class-detail-story class-detail-progression">
                      <div className="class-detail-section-title">Развитие</div>
                      <TextBlock text={progression} />
                    </section>
                  ) : null}
                </aside>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
