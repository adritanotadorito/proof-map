import "server-only";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const TIMEOUT_MS = 120_000;

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export class GeminiError extends Error {}

export type GeminiResult = {
  text: string;
  modelVersion: string | null;
  usage: Record<string, number> | null;
};

type Turn = { role: "user" | "model"; text: string };

/**
 * One JSON-only generation. The key stays on the server and is sent as a header, never in a URL.
 * No tools are offered to the model, so nothing in the prompt can trigger an action.
 */
export async function generateJson(
  system: string,
  turns: Turn[],
  jsonSchema: Record<string, unknown>,
): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY is not set in .env.local.");
  const model = geminiModel();

  // "strict" asks the API to enforce the schema and to keep its private reasoning short.
  // Long reasoning made a first real review exceed three minutes with no answer.
  const call = async (strict: boolean) =>
    fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 16384,
          responseMimeType: "application/json",
          ...(strict ? { responseJsonSchema: jsonSchema, thinkingConfig: { thinkingLevel: "low" } } : {}),
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  const started = Date.now();
  const promptChars = system.length + turns.reduce((n, t) => n + t.text.length, 0);
  console.log(`[gemini] calling ${model} with ${promptChars} prompt characters…`);
  let res: Response;
  try {
    res = await call(true);
    if (res.status === 400) {
      // Some models reject the schema or the thinking setting. The same shape is enforced on
      // our side anyway, so fall back to plain JSON mode with the schema described in the prompt.
      const detail = await res.text();
      console.warn("[gemini] strict request rejected; retrying in plain JSON mode:", detail.slice(0, 400));
      res = await call(false);
    }
  } catch (error) {
    console.warn(`[gemini] no response after ${Math.round((Date.now() - started) / 1000)}s:`, error instanceof Error ? error.name : error);
    throw error;
  }
  console.log(`[gemini] HTTP ${res.status} after ${Math.round((Date.now() - started) / 1000)}s`);
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 404) {
      throw new GeminiError(`Gemini does not offer the model "${model}" to this key. Set GEMINI_MODEL in .env.local. (${detail})`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new GeminiError(`Gemini rejected the API key (HTTP ${res.status}). Check GEMINI_API_KEY in .env.local.`);
    }
    if (res.status === 429) throw new GeminiError("Gemini rate limit or quota reached. Wait a moment and try again.");
    throw new GeminiError(`Gemini returned HTTP ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    usageMetadata?: Record<string, unknown>;
    modelVersion?: string;
  };
  if (data.promptFeedback?.blockReason) {
    throw new GeminiError(`Gemini blocked the prompt (${data.promptFeedback.blockReason}).`);
  }
  const candidate = data.candidates?.[0];
  const finish = candidate?.finishReason ?? "unknown";
  if (finish !== "STOP") {
    throw new GeminiError(
      finish === "MAX_TOKENS"
        ? "Gemini's answer was cut off before it finished, so it was discarded."
        : `Gemini stopped without a complete answer (${finish}).`,
    );
  }
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (!text.trim()) throw new GeminiError("Gemini returned an empty answer.");

  const usage: Record<string, number> = {};
  for (const [k, v] of Object.entries(data.usageMetadata ?? {})) {
    if (typeof v === "number") usage[k] = v;
  }
  console.log(`[gemini] finished: ${text.length} characters, usage ${JSON.stringify(usage)}`);
  return { text, modelVersion: data.modelVersion ?? null, usage: Object.keys(usage).length ? usage : null };
}
