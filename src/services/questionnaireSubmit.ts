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

  data:
    Record<string, unknown>;
};


type SubmitQuestionnaireArgs = {
  assistantId:
    QuestionnaireAssistantId;

  assistantName:
    string;

  data:
    Record<string, unknown>;
};


async function readJson(
  response: Response
) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}


export async function submitQuestionnaire({
  assistantId,
  assistantName,
  data,
}: SubmitQuestionnaireArgs) {

  const response =
    await fetch(
      '/.netlify/functions/questionnaire-submit',
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify({
            assistantId,
            assistantName,
            data,
          }),
      }
    );


  const result =
    await readJson(
      response
    );


  if (
    !response.ok ||
    !result?.ok
  ) {

    throw new Error(
      result?.error ||
      'Не удалось отправить анкету'
    );
  }


  return result.submission as QuestionnaireSubmission;
}


export async function loadOwnQuestionnaire(
  claim: QuestionnaireClaim
) {

  const response =
    await fetch(
      `/.netlify/functions/questionnaire-self?key=${encodeURIComponent(
        claim.key
      )}&token=${encodeURIComponent(
        claim.editToken
      )}&t=${Date.now()}`,
      {
        method:
          'GET',

        cache:
          'no-store',
      }
    );


  const result =
    await readJson(
      response
    );


  if (
    !response.ok ||
    !result?.ok ||
    !result.questionnaire
  ) {
    const error =
      new Error(
        result?.error ||
        'Не удалось открыть анкету'
      ) as Error & {
        status?: number;
      };

    error.status =
      response.status;

    throw error;
  }


  return result.questionnaire as OwnQuestionnaire;
}


export async function resubmitQuestionnaire(
  claim: QuestionnaireClaim,
  data: Record<string, unknown>
) {

  const response =
    await fetch(
      '/.netlify/functions/questionnaire-self',
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify({
            key:
              claim.key,

            token:
              claim.editToken,

            data,
          }),
      }
    );


  const result =
    await readJson(
      response
    );


  if (
    !response.ok ||
    !result?.ok ||
    !result.questionnaire
  ) {
    throw new Error(
      result?.error ||
      'Не удалось отправить исправления'
    );
  }


  return result.questionnaire as OwnQuestionnaire;
}