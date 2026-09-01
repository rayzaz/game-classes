export type QuestionnaireAssistantId =
  | 'mereo'
  | 'ren'
  | 'lumin';

export type QuestionnaireSubmission = {
  id: string;
  key: string;
  editToken: string;
  createdAt: string;
  status: string;
};

export type QuestionnaireClaim = {
  key: string;
  editToken: string;
};

export type OwnQuestionnaire = {
  key: string;
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  revisionCount: number;
  applicantFeedback: {
    text: string;
    adminName: string;
    updatedAt: string;
  } | null;
  assistant: {
    id: string;
    name: string;
  };
  data: Record<string, unknown>;
};

type SubmitQuestionnaireArgs = {
  assistantId: QuestionnaireAssistantId;
  assistantName: string;
  data: Record<string, unknown>;
};

const CLAIM_STORAGE = 'gosmag-questionnaire-claim-v1';

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function saveQuestionnaireClaim(claim: QuestionnaireClaim) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CLAIM_STORAGE,
      JSON.stringify({
        key: String(claim.key || '').trim(),
        editToken: String(claim.editToken || '').trim(),
      }),
    );
  } catch {
    // Если localStorage недоступен, отправка анкеты всё равно должна работать.
  }
}

export function getStoredQuestionnaireClaim(): QuestionnaireClaim | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CLAIM_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QuestionnaireClaim>;
    const key = String(parsed.key || '').trim();
    const editToken = String(parsed.editToken || '').trim();
    if (!key || !editToken) return null;
    return { key, editToken };
  } catch {
    return null;
  }
}

export function clearStoredQuestionnaireClaim() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CLAIM_STORAGE);
  } catch {
    // ignore
  }
}


export function encodeQuestionnaireAccessCode(claim: QuestionnaireClaim) {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const raw = JSON.stringify({
      key: claim.key,
      editToken: claim.editToken,
    });
    return window
      .btoa(raw)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  } catch {
    return '';
  }
}

export function decodeQuestionnaireAccessCode(value: string): QuestionnaireClaim | null {
  if (typeof window === 'undefined') return null;

  try {
    const compact = String(value || '').trim().replace(/\s+/g, '');
    if (!compact) return null;

    const base64 = compact
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const parsed = JSON.parse(window.atob(padded)) as Partial<QuestionnaireClaim>;
    const key = String(parsed.key || '').trim();
    const editToken = String(parsed.editToken || '').trim();

    if (!key || !editToken) return null;
    return { key, editToken };
  } catch {
    return null;
  }
}

export async function submitQuestionnaire({
  assistantId,
  assistantName,
  data,
}: SubmitQuestionnaireArgs) {
  const response = await fetch(
    '/.netlify/functions/questionnaire-submit',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistantId,
        assistantName,
        data,
      }),
    },
  );

  const result = await readJson(response);

  if (!response.ok || !result?.ok) {
    throw new Error(
      result?.error ||
      'Не удалось отправить анкету',
    );
  }

  const submission = result.submission as QuestionnaireSubmission;

  // v42.2: ключ исправления больше не теряется после отправки.
  // Благодаря этому игрок позже может увидеть статус и открыть доработку.
  if (submission?.key && submission?.editToken) {
    saveQuestionnaireClaim({
      key: submission.key,
      editToken: submission.editToken,
    });
  }

  return submission;
}

export async function loadOwnQuestionnaire(
  claim: QuestionnaireClaim,
) {
  const response = await fetch(
    `/.netlify/functions/questionnaire-self?key=${encodeURIComponent(
      claim.key,
    )}&token=${encodeURIComponent(
      claim.editToken,
    )}&t=${Date.now()}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  );

  const result = await readJson(response);

  if (!response.ok || !result?.ok || !result.questionnaire) {
    const error = new Error(
      result?.error ||
      'Не удалось открыть анкету',
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return result.questionnaire as OwnQuestionnaire;
}

export async function resubmitQuestionnaire(
  claim: QuestionnaireClaim,
  data: Record<string, unknown>,
) {
  const response = await fetch(
    '/.netlify/functions/questionnaire-self',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: claim.key,
        token: claim.editToken,
        data,
      }),
    },
  );

  const result = await readJson(response);

  if (!response.ok || !result?.ok || !result.questionnaire) {
    throw new Error(
      result?.error ||
      'Не удалось отправить исправления',
    );
  }

  return result.questionnaire as OwnQuestionnaire;
}
