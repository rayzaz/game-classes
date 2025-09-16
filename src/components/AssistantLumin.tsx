import * as React from "react";
import { useImagePreload } from "../lib/useImagePreload";

type Props = {
  speaking: boolean;
  idleSrc?: string;
  openSrc?: string;
  blinkSrc?: string;
  width?: number;
  height?: number;
};

const BASE = "/assistants/lumin";
const FALLBACK_IDLE  = `${BASE}/idle.png`;
const FALLBACK_TALK  = `${BASE}/talk.png`;
const FALLBACK_BLINK = `${BASE}/blink.png`;

export default function AssistantLumin({
  speaking,
  idleSrc = FALLBACK_IDLE,
  openSrc = FALLBACK_TALK,
  blinkSrc = FALLBACK_BLINK,
  width = 220,
  height = 220,
}: Props) {
  const ready = useImagePreload([idleSrc, openSrc, blinkSrc]);

  const [frame, setFrame] =
    React.useState<"idle" | "talk" | "blink">("idle");

  React.useEffect(() => {
    if (!ready) return;
    let t1: number | undefined;
    let t2: number | undefined;

    const schedule = () => {
      const delay = 2500 + Math.random() * 2500;
      t1 = window.setTimeout(() => {
        setFrame("blink");
        t2 = window.setTimeout(() => {
          setFrame(speaking ? "talk" : "idle");
          schedule();
        }, 120);
      }, delay);
    };

    if (!speaking) schedule();
    return () => {
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [speaking, ready]);

  React.useEffect(() => {
    if (!ready) return;
    let id: number | undefined;

    if (speaking) {
      setFrame("talk");
      id = window.setInterval(() => {
        setFrame((prev) => (prev === "talk" ? "idle" : "talk"));
      }, 120);
    } else {
      setFrame("idle");
    }

    return () => {
      if (id) clearInterval(id);
    };
  }, [speaking, ready]);

  const src =
    frame === "blink" ? blinkSrc :
    frame === "talk"  ? openSrc  :
                        idleSrc;

  return (
    <img
      src={src}
      alt="Lumin"
      width={width}
      height={height}
      decoding="async"
      loading="eager"
      style={{
        display: "block",
        width,
        height,
        maxWidth: width,
        maxHeight: height,
        objectFit: "contain"
      }}
    />
  );
}
