import * as React from "react";

/** Предзагружает изображения и даёт ready=true, когда всё декодировано */
export function useImagePreload(srcs: string[]) {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        const imgs = srcs.filter(Boolean).map((src) => {
          const img = new Image();
          img.decoding = "async";
          img.loading = "eager";
          img.src = src;
          return img;
        });

        await Promise.all(
          imgs.map((img) =>
            img.decode
              ? img.decode().catch(
                  () =>
                    new Promise<void>((res) => {
                      img.onload = () => res();
                      img.onerror = () => res();
                    })
                )
              : new Promise<void>((res) => {
                  img.onload = () => res();
                  img.onerror = () => res();
                })
          )
        );
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    setReady(false);
    loadAll();

    return () => {
      cancelled = true;
    };
  }, [JSON.stringify(srcs)]);

  return ready;
}

