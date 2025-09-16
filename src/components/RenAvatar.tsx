import React from 'react';

type Props = {
  speaking: boolean;            // рот «флопает», когда true
  idleSrc?: string;             // закрытый рот, открытые глаза
  openSrc?: string;             // открытый рот (говорит)
  blinkSrc?: string;            // моргает (закрытые глаза)
  width?: number;
  height?: number;
};

const BASE = '/assistants/ren';
const FALLBACK_IDLE  = `${BASE}/idle.png`;
const FALLBACK_TALK  = `${BASE}/talk.png`;
const FALLBACK_BLINK = `${BASE}/blink.png`;

/**
 * Рен Паувинд — полноразмерный чиби, БЕЗ рамки.
 * Абсолютное позиционирование картинки в фиксированном контейнере.
 */
export default function AssistantRen({
  speaking,
  idleSrc  = FALLBACK_IDLE,
  openSrc  = FALLBACK_TALK,
  blinkSrc = FALLBACK_BLINK,
  width = 220,
  height = 260,
}: Props) {
  const [isBlink, setIsBlink] = React.useState(false);
  const [mouthOpen, setMouthOpen] = React.useState(false);

  // Моргаем только когда НЕ говорит
  React.useEffect(() => {
    let t1: number | null = null;
    let t2: number | null = null;

    const schedule = () => {
      const next = 3000 + Math.random() * 3000; // 3–6s
      t1 = window.setTimeout(() => {
        setIsBlink(true);
        t2 = window.setTimeout(() => {
          setIsBlink(false);
          schedule();
        }, 140);
      }, next);
    };

    if (!speaking) schedule();
    return () => {
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [speaking]);

  // «Флопающий» рот — только когда говорит
  React.useEffect(() => {
    let id: number | null = null;
    if (speaking) {
      setIsBlink(false);
      setMouthOpen(true);
      id = window.setInterval(() => {
        setMouthOpen(prev => !prev);
      }, 120);
    } else {
      setMouthOpen(false);
    }
    return () => { if (id) clearInterval(id); };
  }, [speaking]);

  const src = isBlink ? blinkSrc : (mouthOpen ? openSrc : idleSrc);

  return (
    <div
      className="asst-figure"
      style={{ width, height }}
      aria-hidden
    >
      <img
        className="asst-img"
        src={src}
        alt="Рен Паувинд"
        width={width}
        height={height}
      />
    </div>
  );
}
