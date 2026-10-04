import {
  getCharacterDbStore,
  characterKey,
  REGISTRY_KEY,
} from './_character-db/store.mjs';


const FETCH_TIMEOUT_MS = 12_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;


function cleanText(value) {
  return String(value ?? '').trim();
}


function normalizeCharacterId(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}


function localPortraitPath(characterId) {
  return (
    '/cards/characters/' +
    encodeURIComponent(characterId) +
    '.jpg'
  );
}


function redirectToLocal(
  request,
  characterId,
  status = 302
) {
  return Response.redirect(
    new URL(
      localPortraitPath(characterId),
      request.url
    ).toString(),
    status
  );
}


function isSafeExternalUrl(value) {
  try {
    const url =
      new URL(value);

    if (
      url.protocol !== 'https:' &&
      url.protocol !== 'http:'
    ) {
      return false;
    }

    const host =
      url.hostname
        .toLowerCase();

    if (
      !host ||
      host === 'localhost' ||
      host.endsWith('.local') ||
      host === '0.0.0.0' ||
      host === '::1' ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return false;
    }

    const private172 =
      host.match(
        /^172\.(\d{1,3})\./
      );

    if (
      private172 &&
      Number(private172[1]) >= 16 &&
      Number(private172[1]) <= 31
    ) {
      return false;
    }

    return true;

  } catch {
    return false;
  }
}


function mimeFromBytes(
  bytes,
  headerMime
) {
  const header =
    cleanText(headerMime)
      .split(';')[0]
      .toLowerCase();

  if (
    header.startsWith('image/')
  ) {
    return header;
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    bytes.length >= 6 &&
    String.fromCharCode(
      ...bytes.slice(0, 6)
    ).startsWith('GIF8')
  ) {
    return 'image/gif';
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(
      ...bytes.slice(0, 4)
    ) === 'RIFF' &&
    String.fromCharCode(
      ...bytes.slice(8, 12)
    ) === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (
    bytes.length >= 12
  ) {
    const boxType =
      String.fromCharCode(
        ...bytes.slice(4, 12)
      );

    if (
      boxType.includes('ftypavif') ||
      boxType.includes('ftypavis')
    ) {
      return 'image/avif';
    }
  }

  const prefix =
    new TextDecoder()
      .decode(
        bytes.slice(
          0,
          Math.min(
            bytes.length,
            512
          )
        )
      )
      .trimStart()
      .toLowerCase();

  if (
    prefix.startsWith('<svg') ||
    prefix.startsWith('<?xml') &&
    prefix.includes('<svg')
  ) {
    return 'image/svg+xml';
  }

  return '';
}


async function portraitSourceFromDb(
  characterId
) {
  const store =
    getCharacterDbStore();

  try {
    const document =
      await store.get(
        characterKey(characterId),
        {
          type: 'json',
          consistency: 'strong',
        }
      );

    const source =
      cleanText(
        document?.data?.character?.portraitSource ||
        document?.data?.character?.portrait
      );

    if (source) {
      return source;
    }
  } catch (error) {
    console.error(
      'character-portrait character DB read error:',
      characterId,
      error
    );
  }

  try {
    const registry =
      await store.get(
        REGISTRY_KEY,
        {
          type: 'json',
          consistency: 'strong',
        }
      );

    const item =
      Array.isArray(
        registry?.characters
      )
        ? registry.characters.find(
            candidate =>
              normalizeCharacterId(
                candidate?.characterId ||
                candidate?.id
              ) === characterId
          )
        : null;

    return cleanText(
      item?.portraitSource ||
      item?.portrait
    );

  } catch (error) {
    console.error(
      'character-portrait registry DB read error:',
      characterId,
      error
    );

    return '';
  }
}


export default async function (
  request
) {
  if (
    request.method !== 'GET' &&
    request.method !== 'HEAD'
  ) {
    return new Response(
      'Method not allowed',
      {
        status: 405,
        headers: {
          allow: 'GET, HEAD',
        },
      }
    );
  }

  const requestUrl =
    new URL(request.url);

  const characterId =
    normalizeCharacterId(
      requestUrl
        .searchParams
        .get('characterId')
    );

  if (!characterId) {
    return new Response(
      'characterId is required',
      {
        status: 400,
        headers: {
          'cache-control': 'no-store',
        },
      }
    );
  }

  const startedAt =
    Date.now();

  const source =
    await portraitSourceFromDb(
      characterId
    );

  if (!source) {
    console.warn(
      'character-portrait source missing -> local fallback:',
      characterId
    );

    return redirectToLocal(
      request,
      characterId
    );
  }

  if (
    source.startsWith('/')
  ) {
    return Response.redirect(
      new URL(
        source,
        request.url
      ).toString(),
      302
    );
  }

  if (
    !isSafeExternalUrl(source)
  ) {
    console.warn(
      'character-portrait unsafe/invalid source -> local fallback:',
      characterId
    );

    return redirectToLocal(
      request,
      characterId
    );
  }

  let sourceHost = '';

  try {
    sourceHost =
      new URL(source)
        .hostname;
  } catch {
    // already validated above
  }

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT_MS
    );

  try {
    const response =
      await fetch(
        source,
        {
          method: 'GET',
          redirect: 'follow',
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            accept:
              'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'user-agent':
              'Mozilla/5.0 SIRA-Character-Portrait/1.0',
          },
        }
      );

    if (!response.ok) {
      console.warn(
        'character-portrait upstream HTTP -> local fallback:',
        characterId,
        sourceHost,
        response.status
      );

      return redirectToLocal(
        request,
        characterId
      );
    }

    const declaredLength =
      Number(
        response.headers.get(
          'content-length'
        ) ||
        0
      );

    if (
      declaredLength >
      MAX_IMAGE_BYTES
    ) {
      console.warn(
        'character-portrait upstream too large -> local fallback:',
        characterId,
        sourceHost,
        declaredLength
      );

      return redirectToLocal(
        request,
        characterId
      );
    }

    const buffer =
      await response.arrayBuffer();

    if (
      buffer.byteLength <= 0 ||
      buffer.byteLength > MAX_IMAGE_BYTES
    ) {
      console.warn(
        'character-portrait invalid size -> local fallback:',
        characterId,
        sourceHost,
        buffer.byteLength
      );

      return redirectToLocal(
        request,
        characterId
      );
    }

    const bytes =
      new Uint8Array(buffer);

    const mime =
      mimeFromBytes(
        bytes,
        response.headers.get(
          'content-type'
        )
      );

    if (!mime) {
      console.warn(
        'character-portrait upstream is not an image -> local fallback:',
        characterId,
        sourceHost,
        response.headers.get(
          'content-type'
        ) ||
        ''
      );

      return redirectToLocal(
        request,
        characterId
      );
    }

    console.log(
      'character-portrait PASS:',
      characterId,
      'host=',
      sourceHost,
      'mime=',
      mime,
      'bytes=',
      buffer.byteLength,
      'ms=',
      Date.now() - startedAt
    );

    if (
      request.method === 'HEAD'
    ) {
      return new Response(
        null,
        {
          status: 200,
          headers: {
            'content-type': mime,
            'cache-control':
              'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
            'x-content-type-options':
              'nosniff',
          },
        }
      );
    }

    return new Response(
      buffer,
      {
        status: 200,
        headers: {
          'content-type': mime,
          'content-length':
            String(buffer.byteLength),
          'content-disposition':
            'inline',
          'cache-control':
            'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          'x-content-type-options':
            'nosniff',
        },
      }
    );

  } catch (error) {
    console.error(
      'character-portrait fetch error -> local fallback:',
      characterId,
      sourceHost,
      error
    );

    return redirectToLocal(
      request,
      characterId
    );

  } finally {
    clearTimeout(timer);
  }
}
