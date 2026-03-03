# Open Brain

A personal, database-backed AI memory system that lets you own your context and share it across autonomous agents and AI tools via the Model Context Protocol (MCP).

## Architecture

- **Capture Pipeline**: Slack slash command → Vercel serverless function → PostgreSQL (with embeddings + metadata)
- **Retrieval Pipeline**: MCP server → PostgreSQL → Tools for semantic search, recent thoughts, and stats

## Prerequisites

- Node.js 18+
- [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`)
- A [Slack app](https://api.slack.com/apps) with a slash command
- [OpenAI API key](https://platform.openai.com/api-keys)

---

## Step 1: Database Setup

### 1.1 Create Postgres Database

**Option A: Vercel Postgres / Neon** (recommended)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) → your project (or create one)
2. Open **Storage** → **Create Database** → **Postgres** (or Neon)
3. Link the database to your project
4. Copy the `POSTGRES_URL` from the **.env.local** tab (or from Storage → your DB → **Connect**)

**Option B: Neon, Supabase, or any PostgreSQL with pgvector**

Create a database and ensure pgvector is available. Use the connection string as `POSTGRES_URL`.

### 1.2 Enable pgvector and Create Schema

1. In Vercel Dashboard → **Storage** → your Postgres database → **Query** tab
2. Run the contents of `schema.sql`:

```sql
-- Enable pgvector (run once)
CREATE EXTENSION IF NOT EXISTS vector;

-- Thoughts table
CREATE TABLE thoughts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text TEXT NOT NULL,
  embedding vector(1536),
  people TEXT[] DEFAULT '{}',
  topics TEXT[] DEFAULT '{}',
  type TEXT,
  action_items TEXT[] DEFAULT '{}',
  source_channel TEXT,
  source_user TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for semantic search
CREATE INDEX ON thoughts USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index for recent listing
CREATE INDEX ON thoughts (created_at DESC);
```

**Alternative**: Use `psql` or any PostgreSQL client with `POSTGRES_URL`:

```bash
psql $POSTGRES_URL -f schema.sql
```

---

## Step 2: Deploy Capture Pipeline (Vercel)

### 2.1 Install Dependencies

```bash
cd /path/to/open-brain
npm install
```

### 2.2 Set Environment Variables

In Vercel Dashboard → **Settings** → **Environment Variables**, add:

| Name            | Value                    | Environments   |
|-----------------|--------------------------|----------------|
| `POSTGRES_URL`  | From Vercel Postgres     | All            |
| `OPENAI_API_KEY`| Your OpenAI API key      | All            |

Or via CLI:

```bash
vercel env add POSTGRES_URL
vercel env add OPENAI_API_KEY
```

### 2.3 Deploy

```bash
vercel deploy --prod
```

Note the deployment URL (e.g. `https://open-brain-xxx.vercel.app`).

### 2.4 Vercel Project Settings (if you get 404)

If `/api/capture` returns 404, check **Settings** → **General**:

- **Framework Preset**: Set to **Other** (not Next.js)
- **Build Command**: Leave default or `npm run build`
- **Root Directory**: Must point to the folder containing `api/` and `package.json`

---

## Step 3: Configure Slack

### 3.1 Create Slash Command

1. Go to [Slack API](https://api.slack.com/apps) → your app (or create one)
2. **Slash Commands** → **Create New Command**
3. Configure:
   - **Command**: `/brain` (or your choice)
   - **Request URL**: `https://<your-vercel-url>/api/capture`
   - **Short Description**: Capture a thought to Open Brain
   - **Usage Hint**: `your thought or note`

### 3.2 Install App to Workspace

1. **Install App** → **Install to Workspace**
2. Authorize the app

### 3.3 Test

In any channel, type:

```
/brain Had a great meeting with Alice about the Q2 product roadmap. Need to follow up on budget.
```

You should get a threaded reply with a confirmation of what was captured.

---

## Step 4: Run MCP Server (Retrieval)

### 4.1 Install and Build

```bash
cd mcp-server
npm install
npm run build
```

### 4.2 Set Environment Variables

Create `.env` in `mcp-server/` (or export in your shell):

```
POSTGRES_URL=postgres://...
OPENAI_API_KEY=sk-...
```

`OPENAI_API_KEY` is required for `semantic_search` (to embed the query).

### 4.3 Run

```bash
npx tsx src/index.ts
```

Or after build:

```bash
node dist/index.js
```

---

## Step 5: Connect MCP to Cursor / Claude Desktop

### Cursor

Add to Cursor settings (e.g. `~/.cursor/mcp.json` or project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "open-brain": {
      "command": "node",
      "args": ["/path/to/open-brain/mcp-server/dist/index.js"],
      "env": {
        "POSTGRES_URL": "postgres://...",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

Replace `/path/to/open-brain` with the actual path.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "open-brain": {
      "command": "node",
      "args": ["/path/to/open-brain/mcp-server/dist/index.js"],
      "env": {
        "POSTGRES_URL": "postgres://...",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

---

## MCP Tools

| Tool             | Description                                      |
|------------------|--------------------------------------------------|
| `semantic_search`| Find thoughts by meaning (e.g. "ideas about X")  |
| `list_recent`    | Browse thoughts captured this week               |
| `stats`          | Patterns: by type, top topics, top people, daily  |

---

## Project Structure

```
open-brain/
├── api/
│   └── capture.ts       # Vercel serverless (Slack webhook)
├── schema.sql           # Database schema
├── mcp-server/
│   ├── src/
│   │   ├── index.ts     # MCP server + tools
│   │   └── db.ts        # Postgres queries
│   ├── package.json
│   └── tsconfig.json
├── package.json
├── vercel.json
└── README.md
```

---

## Troubleshooting

- **Slack timeout**: The function must reply within 3 seconds. We use `response_url` for async confirmation. Ensure `maxDuration` in `vercel.json` is 10.
- **pgvector not found**: Run `CREATE EXTENSION IF NOT EXISTS vector` in your database.
- **MCP server not starting**: Ensure `POSTGRES_URL` and `OPENAI_API_KEY` are set in the MCP config.
- **Empty semantic search**: Verify thoughts have been captured and embeddings are stored (`embedding IS NOT NULL`).
