function cleanText(value) {
  return String(value ?? '').trim();
}

function normalizeCharacterId(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function characterPortraitProxyUrl(
  characterId,
  version = ''
) {
  const id =
    normalizeCharacterId(
      characterId
    );

  if (!id) {
    return '';
  }

  const params =
    new URLSearchParams({
      characterId: id,
    });

  const safeVersion =
    cleanText(version)
      .slice(0, 120);

  if (safeVersion) {
    params.set(
      'v',
      safeVersion
    );
  }

  return (
    '/.netlify/functions/character-portrait?' +
    params.toString()
  );
}


export function withCharacterPortraitProxy(
  data,
  characterId,
  version = ''
) {
  if (
    !data ||
    typeof data !== 'object' ||
    !data.character ||
    typeof data.character !== 'object'
  ) {
    return data;
  }

  const portraitSource =
    cleanText(
      data.character.portraitSource ||
      data.character.portrait
    );

  const portrait =
    characterPortraitProxyUrl(
      characterId,
      version
    );

  if (!portrait) {
    return data;
  }

  return {
    ...data,
    character: {
      ...data.character,
      portraitSource,
      portrait,
    },
  };
}


export function withRegistryPortraitProxy(
  item,
  version = ''
) {
  if (
    !item ||
    typeof item !== 'object'
  ) {
    return item;
  }

  const characterId =
    normalizeCharacterId(
      item.characterId ||
      item.id
    );

  if (!characterId) {
    return item;
  }

  return {
    ...item,
    portraitSource:
      cleanText(
        item.portraitSource ||
        item.portrait
      ),
    portrait:
      characterPortraitProxyUrl(
        characterId,
        version
      ),
  };
}
