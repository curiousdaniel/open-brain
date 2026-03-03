# Open Brain + Claude Desktop Setup

## What I Did For You

1. **Created** `mcp-server/run-for-claude.sh` – a launcher that loads your credentials and runs the MCP server
2. **Created** `mcp-server/.env.example` – a template for your credentials
3. **Configured** Claude Desktop to use Open Brain (config is at `~/Library/Application Support/Claude/claude_desktop_config.json`)

## What You Need To Do (2 steps)

### Step 1: Add your credentials

```bash
cd "/Users/danielwest/Desktop/Open Brain/mcp-server"
cp .env.example .env
```

Then open `.env` and replace the placeholders with your real values:

- **POSTGRES_URL** – Copy from Vercel (Settings → Environment Variables) or Neon dashboard
- **OPENAI_API_KEY** – Your OpenAI API key (starts with `sk-`)

### Step 2: Restart Claude Desktop

Quit Claude Desktop completely and reopen it.

## That's It

In Claude Desktop, you can now ask things like:

- "What thoughts do I have about product strategy?"
- "Show me what I captured this week"
- "What patterns do you see in my notes?"

Claude will use the Open Brain tools to search your database and answer.
