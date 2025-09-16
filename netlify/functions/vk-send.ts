// netlify/functions/vk-send.ts
import type { Handler } from '@netlify/functions';
import fetch from 'node-fetch';

// === ENV ===
// VK_GROUP_TOKEN — ключ доступа сообщества (с правом "сообщения сообщества")
// VK_GROUP_ID    — id сообщества (например: 216393016)
// VK_PEER_ID     — peer_id беседы: 2000000000 + chat_id (пример: chat_id=68 → 2000000068)
// VK_API_VERSION — опционально, по умолчанию 5.199

const TOKEN    = process.env.VK_GROUP_TOKEN;
const GROUP_ID = process.env.VK_GROUP_ID;
const PEER_ID  = process.env.VK_PEER_ID;
const API_V    = process.env.VK_API_VERSION || '5.199';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { formId, assistant, data } = JSON.parse(event.body || '{}');

    if (!formId || !data) {
      return { statusCode: 400, body: 'formId and data are required' };
    }
    if (!TOKEN || !PEER_ID || !GROUP_ID) {
      return { statusCode: 500, body: 'VK_GROUP_TOKEN, VK_PEER_ID or VK_GROUP_ID is not set' };
    }

    const message  = buildMessage(formId, assistant, data);
    const keyboard = buildKeyboard(formId);

    const params = new URLSearchParams({
      access_token: TOKEN,
      v: API_V,
      peer_id: String(PEER_ID),
      random_id: String(Date.now()),
      message,
      keyboard: JSON.stringify(keyboard),
      group_id: GROUP_ID, // 👈 теперь явно указываем id группы
    });

    const resp = await fetch('https://api.vk.com/method/messages.send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const json: any = await resp.json();

    if (json?.error) {
      console.error('VK error:', json.error);
      return { statusCode: 502, body: JSON.stringify(json.error) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, message_id: json.response }) };
  } catch (err: any) {
    console.error(err);
    return { statusCode: 500, body: err?.message || 'Internal error' };
  }
};

// Текст сообщения из анкеты
function buildMessage(formId: string, assistant: string, data: Record<string, any>) {
  const lines: string[] = [];
  lines.push(`📝 Новая анкета #${formId}`);
  if (assistant) lines.push(`Ассистент: ${assistant}`);

  for (const [key, value] of Object.entries(data)) {
    if (!value) continue;
    const pretty = Array.isArray(value)
      ? value.join(', ')
      : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
    lines.push(`• ${key}: ${pretty}`);
  }
  return lines.join('\n').slice(0, 3800);
}

// Кнопки "Одобрить / На редактирование"
function buildKeyboard(formId: string) {
  return {
    one_time: false,
    inline: false,
    buttons: [
      [
        {
          action: {
            type: 'text',
            label: '✅ Одобрить',
            payload: JSON.stringify({ action: 'approve', formId }),
          },
          color: 'positive',
        },
      ],
      [
        {
          action: {
            type: 'text',
            label: '✏️ На редактирование',
            payload: JSON.stringify({ action: 'request_changes', formId }),
          },
          color: 'primary',
        },
      ],
    ],
  };
}
