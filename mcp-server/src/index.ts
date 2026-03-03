#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import OpenAI from "openai";
import {
  semanticSearch,
  listRecent,
  getStats,
  type Thought,
  type Stats,
} from "./db.js";

const EMBEDDING_MODEL = "text-embedding-3-small";

async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required for semantic search");
  }
  const openai = new OpenAI({ apiKey });
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

function formatThought(t: Thought): string {
  const parts = [
    `**${t.raw_text.slice(0, 200)}${t.raw_text.length > 200 ? "..." : ""}**`,
    t.type && `Type: ${t.type}`,
    t.people?.length > 0 && `People: ${t.people.join(", ")}`,
    t.topics?.length > 0 && `Topics: ${t.topics.join(", ")}`,
    t.action_items?.length > 0 && `Actions: ${t.action_items.join("; ")}`,
    `_${new Date(t.created_at).toISOString()}_`,
  ].filter(Boolean);
  return parts.join("\n");
}

function formatStats(s: Stats): string {
  const lines = [
    `**Total thoughts:** ${s.total_thoughts}`,
    "",
    "**By type:**",
    ...Object.entries(s.by_type).map(([k, v]) => `  - ${k}: ${v}`),
    "",
    "**Top topics:**",
    ...s.top_topics.map((t) => `  - ${t.topic}: ${t.count}`),
    "",
    "**Top people:**",
    ...s.top_people.map((p) => `  - ${p.person}: ${p.count}`),
    "",
    "**Thoughts per day (last 14 days):**",
    ...s.thoughts_per_day.map((d) => `  - ${d.date}: ${d.count}`),
  ];
  return lines.join("\n");
}

const server = new McpServer({
  name: "open-brain",
  version: "1.0.0",
});

server.registerTool(
  "semantic_search",
  {
    title: "Semantic Search",
    description:
      "Find thoughts based on their meaning using vector similarity. Use natural language to search (e.g. 'ideas about product strategy', 'meetings with Alice').",
    inputSchema: {
      query: z.string().describe("Natural language search query"),
      limit: z.number().optional().default(10).describe("Max number of results (default 10)"),
    },
  },
  async ({ query, limit }) => {
    const embedding = await getEmbedding(query);
    const thoughts = await semanticSearch(embedding, limit);
    const text =
      thoughts.length === 0
        ? "No matching thoughts found."
        : thoughts.map((t, i) => `${i + 1}. ${formatThought(t)}`).join("\n\n---\n\n");
    return {
      content: [{ type: "text" as const, text }],
    };
  }
);

server.registerTool(
  "list_recent",
  {
    title: "List Recent",
    description: "Browse thoughts captured this week, ordered by most recent first.",
    inputSchema: {
      limit: z.number().optional().default(20).describe("Max number of results (default 20)"),
    },
  },
  async ({ limit }) => {
    const thoughts = await listRecent(limit);
    const text =
      thoughts.length === 0
        ? "No thoughts captured this week."
        : thoughts.map((t, i) => `${i + 1}. ${formatThought(t)}`).join("\n\n---\n\n");
    return {
      content: [{ type: "text" as const, text }],
    };
  }
);

server.registerTool(
  "stats",
  {
    title: "Stats",
    description:
      "See patterns and statistics: total thoughts, breakdown by type, top topics, top people, and thoughts per day.",
    inputSchema: {},
  },
  async () => {
    const stats = await getStats();
    return {
      content: [{ type: "text" as const, text: formatStats(stats) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Open Brain MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
