import pg from "pg";

const { Pool } = pg;

export interface Thought {
  id: string;
  raw_text: string;
  people: string[];
  topics: string[];
  type: string | null;
  action_items: string[];
  source_channel: string | null;
  source_user: string | null;
  created_at: Date;
}

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  const connString = process.env.POSTGRES_URL;
  if (!connString) {
    throw new Error("POSTGRES_URL environment variable is required");
  }
  if (!pool) {
    pool = new Pool({ connectionString: connString });
  }
  return pool;
}

export async function semanticSearch(
  queryEmbedding: number[],
  limit: number = 10
): Promise<Thought[]> {
  const client = await getPool().connect();
  try {
    const vectorStr = `[${queryEmbedding.join(",")}]`;
    const result = await client.query(
      `SELECT id, raw_text, people, topics, type, action_items, source_channel, source_user, created_at
       FROM thoughts
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vectorStr, limit]
    );
    return result.rows.map(rowToThought);
  } finally {
    client.release();
  }
}

export async function listRecent(limit: number = 20): Promise<Thought[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT id, raw_text, people, topics, type, action_items, source_channel, source_user, created_at
       FROM thoughts
       WHERE created_at >= NOW() - INTERVAL '7 days'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows.map(rowToThought);
  } finally {
    client.release();
  }
}

export interface Stats {
  total_thoughts: number;
  by_type: Record<string, number>;
  top_topics: { topic: string; count: number }[];
  top_people: { person: string; count: number }[];
  thoughts_per_day: { date: string; count: number }[];
}

export async function getStats(): Promise<Stats> {
  const client = await getPool().connect();
  try {
    const [totalResult, typeResult, topicsResult, peopleResult, dailyResult] =
      await Promise.all([
        client.query("SELECT COUNT(*)::int as count FROM thoughts"),
        client.query(
          `SELECT type, COUNT(*)::int as count FROM thoughts WHERE type IS NOT NULL GROUP BY type ORDER BY count DESC`
        ),
        client.query(
          `SELECT unnest(topics) as topic, COUNT(*)::int as count
           FROM thoughts WHERE array_length(topics, 1) > 0
           GROUP BY topic ORDER BY count DESC LIMIT 10`
        ),
        client.query(
          `SELECT unnest(people) as person, COUNT(*)::int as count
           FROM thoughts WHERE array_length(people, 1) > 0
           GROUP BY person ORDER BY count DESC LIMIT 10`
        ),
        client.query(
          `SELECT DATE(created_at) as date, COUNT(*)::int as count
           FROM thoughts
           WHERE created_at >= NOW() - INTERVAL '30 days'
           GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 14`
        ),
      ]);

    const by_type: Record<string, number> = {};
    for (const row of typeResult.rows) {
      by_type[row.type] = row.count;
    }

    return {
      total_thoughts: totalResult.rows[0]?.count ?? 0,
      by_type,
      top_topics: topicsResult.rows.map((r) => ({
        topic: r.topic,
        count: r.count,
      })),
      top_people: peopleResult.rows.map((r) => ({
        person: r.person,
        count: r.count,
      })),
      thoughts_per_day: dailyResult.rows.map((r) => ({
        date: r.date,
        count: r.count,
      })),
    };
  } finally {
    client.release();
  }
}

function rowToThought(row: Record<string, unknown>): Thought {
  return {
    id: row.id as string,
    raw_text: row.raw_text as string,
    people: (row.people as string[]) ?? [],
    topics: (row.topics as string[]) ?? [],
    type: row.type as string | null,
    action_items: (row.action_items as string[]) ?? [],
    source_channel: row.source_channel as string | null,
    source_user: row.source_user as string | null,
    created_at: row.created_at as Date,
  };
}
