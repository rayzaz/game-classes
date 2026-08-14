import {
  randomBytes,
  scryptSync,
} from 'node:crypto';

const [
  command,
  ...args
] =
  process.argv.slice(2);


if (
  command ===
  'secret'
) {

  console.log(
    randomBytes(32)
      .toString('hex')
  );

  process.exit(0);
}


if (
  command ===
  'user'
) {

  const [
    login,
    password,
    characterId,
    displayName,
    readyRaw = 'false',
  ] = args;


  if (
    !login ||
    !password ||
    !characterId ||
    !displayName
  ) {

    console.log(
      'Использование:'
    );

    console.log(
      'node scripts/auth-helper.mjs user LOGIN PASSWORD CHARACTER_ID "Имя персонажа" true'
    );

    process.exit(1);
  }


  const salt =
    randomBytes(16)
      .toString('hex');


  const passwordHash =
    scryptSync(
      password,
      salt,
      64
    )
      .toString('hex');


  const record = {
    login:
      login
        .trim()
        .toLowerCase(),

    displayName,

    characterId,

    cabinetReady:
      String(readyRaw)
        .toLowerCase() ===
      'true',

    salt,

    passwordHash,
  };


  console.log(
    JSON.stringify(
      record
    )
  );

  process.exit(0);
}


console.log(
  'Команды:'
);

console.log(
  '  node scripts/auth-helper.mjs secret'
);

console.log(
  '  node scripts/auth-helper.mjs user LOGIN PASSWORD CHARACTER_ID "Имя персонажа" true'
);
