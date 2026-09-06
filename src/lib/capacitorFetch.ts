import { Capacitor } from '@capacitor/core';

const NETLIFY_ORIGIN = 'https://game-classes.netlify.app';
const NETLIFY_FUNCTION_PREFIX = '/.netlify/functions/';

function rewriteNativeNetlifyUrl(url: string) {
  if (url.startsWith(NETLIFY_FUNCTION_PREFIX)) {
    return `${NETLIFY_ORIGIN}${url}`;
  }

  return url;
}

export function installCapacitorFetchPatch() {
  if (
    !Capacitor.isNativePlatform() ||
    Capacitor.getPlatform() !== 'android'
  ) {
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    if (typeof input === 'string') {
      return originalFetch(
        rewriteNativeNetlifyUrl(input),
        init
      );
    }

    if (input instanceof URL) {
      const originalUrl = input.toString();
      const rewrittenUrl = rewriteNativeNetlifyUrl(originalUrl);

      return originalFetch(
        rewrittenUrl === originalUrl ? input : rewrittenUrl,
        init
      );
    }

    const rewrittenUrl = rewriteNativeNetlifyUrl(input.url);

    if (rewrittenUrl === input.url) {
      return originalFetch(input, init);
    }

    const rewrittenRequest = new Request(
      rewrittenUrl,
      input
    );

    return originalFetch(rewrittenRequest, init);
  };
}
