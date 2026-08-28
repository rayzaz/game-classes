// src/data/merged.ts
// Роли и теги уже заданы в новой редакции каталога, поэтому дополнительных
// переопределений здесь больше нет.

import BASE from './classes';

const MERGED = [...BASE].sort((a, b) =>
  String(a.name).localeCompare(String(b.name), 'ru')
);

export default MERGED;
export type ClassItem = (typeof MERGED)[number];
