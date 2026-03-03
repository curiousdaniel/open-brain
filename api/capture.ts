import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { sql } from "@vercel/postgres";
import OpenAI from "openai";
import { z } from "zod";

const EMBEDDING_MODEL = "text-embedding-3-small";
const METADATA_MODEL = "gpt-4o-mini";

const SlackPayloadSchema = z.object({
  command: z.string(),
  text: z.string(),
  response_url: z.string().url(),
  channel_id: z.string(),
  channel_name: z.string().optional(),
  user_id: z.string(),
  user_name: z.string().optional(),
});

const MetadataSchema = z.object({
  people: z.array(z.string()),
  topics: z.array(z.string()),
  type: z.string(),
  action_items: z.array(z.string()),
});

async function getEmbedding(text: string, openai: OpenAI): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

async function extractMetadata(text: string, openai: OpenAI) {
  const response = await openai.chat.completions.create({
    model: METADATA_MODEL,
    messages: [
      {
        role: "system",
        content: `Extract metadata from the user's thought/note. Return valid JSON with exactly these keys:
- people: array of person names mentioned (e.g. ["Alice", "Bob"])
- topics: array of topics or themes (e.g. ["product strategy", "budget"])
- type: one of "idea", "meeting_note", "task", "reflection", "question", "other"
- action_items: array of actionable items extracted (e.g. ["Follow up with Alice", "Review budget"])`,
      },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No metadata extracted");

  const parsed = JSON.parse(content);
  return MetadataSchema.parse(parsed);
}

async function replyToSlack(
  responseUrl: string,
  message: { text?: string; blocks?: object[] }
) {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const responseUrl = (req.body?.response_url as string) || "";
  const sendError = (msg: string) => {
    if (responseUrl) {
      replyToSlack(responseUrl, { text: `:x: Open Brain: ${msg}` }).catch(
        console.error
      );
    }
    res.status(400).json({ error: msg });
  };

  let payload: z.infer<typeof SlackPayloadSchema>;
  try {
    const body =
      typeof req.body === "string"
        ? Object.fromEntries(new URLSearchParams(req.body))
        : req.body;
    payload = SlackPayloadSchema.parse(body);
  } catch (e) {
    sendError("Invalid Slack payload");
    return;
  }

  const { text, response_url, channel_id, user_id } = payload;
  const trimmedText = text?.trim();

  if (!trimmedText) {
    sendError("No text provided. Usage: /brain <your thought or note>");
    return;
  }

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    sendError("OpenAI API key not configured");
    return;
  }

  const openai = new OpenAI({ apiKey: openaiApiKey });

  // Respond immediately to avoid Slack's 3-second timeout
  res.status(200).json({
    response_type: "ephemeral",
    text: ":hourglass_flowing_sand: Saving to Open Brain...",
  });

  // Process in background; waitUntil keeps the function alive until done
  waitUntil(
    (async () => {
      try {
        const [embedding, metadata] = await Promise.all([
          getEmbedding(trimmedText, openai),
          extractMetadata(trimmedText, openai),
        ]);

        const embeddingStr = `[${embedding.join(",")}]`;
        const peopleStr = `{${metadata.people.map((p) => `"${String(p).replace(/\\/g, "\\\\").replace(/"/g, '""')}"`).join(",")}}`;
        const topicsStr = `{${metadata.topics.map((t) => `"${String(t).replace(/\\/g, "\\\\").replace(/"/g, '""')}"`).join(",")}}`;
        const actionItemsStr = `{${metadata.action_items.map((a) => `"${String(a).replace(/\\/g, "\\\\").replace(/"/g, '""')}"`).join(",")}}`;

        await sql`
          INSERT INTO thoughts (
            raw_text,
            embedding,
            people,
            topics,
            type,
            action_items,
            source_channel,
            source_user
          ) VALUES (
            ${trimmedText},
            ${embeddingStr}::vector,
            ${peopleStr}::text[],
            ${topicsStr}::text[],
            ${metadata.type},
            ${actionItemsStr}::text[],
            ${channel_id},
            ${user_id}
          )
        `;

        const summary = [
          `:brain: *Captured to Open Brain*`,
          ``,
          `_${trimmedText.slice(0, 200)}${trimmedText.length > 200 ? "..." : ""}_`,
          ``,
          `*Type:* ${metadata.type}`,
          metadata.people.length > 0 ? `*People:* ${metadata.people.join(", ")}` : null,
          metadata.topics.length > 0 ? `*Topics:* ${metadata.topics.join(", ")}` : null,
          metadata.action_items.length > 0
            ? `*Action items:* ${metadata.action_items.join("; ")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n");

        await replyToSlack(response_url, { text: summary });
      } catch (e) {
        console.error("Capture pipeline error:", e);
        await replyToSlack(response_url, {
          text: ":x: Open Brain: Failed to process your thought. Please try again.",
        });
      }
    })()
  );
}
