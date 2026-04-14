# Contributing to co2de

## Development Setup

```bash
git clone https://github.com/user/co2de.git
cd co2de
npm install
npm run dev    # Watch mode
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Watch mode for development |
| `npm test` | Run test suite |
| `npm run test:watch` | Interactive test watch |
| `npm run typecheck` | Type checking only |

## Architecture

```
User runs `co2de` command
        |
        v
  bin/co2de.ts          Entry point (3 lines)
        |
        v
  src/cli.ts            Command registration (Commander.js)
        |
        v
  src/commands/*.ts     Command handlers
        |
  +-----+-----+
  |           |
  v           v
adapters/   engine/          Data + Calculation
  |           |
  v           v
renderer/   export/          Output (terminal + HTML)
  |
  v
core/                        Types, constants, config
```

### Layer Rules

- **adapters/** reads external data (Claude CLI files). No business logic.
- **engine/** contains all calculation logic. No I/O, no rendering.
- **commands/** orchestrates: loads data via adapter, calculates via engine, renders via renderer.
- **renderer/** formats output for terminal. No data loading.
- **export/** generates HTML reports. No data loading.
- **core/** shared types, constants, config. No side effects.

## Adding a New Command

1. Create `src/commands/your-command.ts`:

```typescript
import { ClaudeAdapter } from "../adapters/claude/index.js";
import { loadConfig } from "../core/config.js";

export async function yourCommand(options: { flag?: boolean }): Promise<void> {
  const adapter = new ClaudeAdapter();
  const config = loadConfig();

  // Load data
  const sessions = await adapter.listSessions(from, now);

  // Calculate
  // ...

  // Render output
  console.log(result);
}
```

2. Register in `src/cli.ts`:

```typescript
import { yourCommand } from "./commands/your-command.js";

// Inside createProgram():
program.command("your-command")
  .description("What it does")
  .option("--flag", "Description")
  .action(yourCommand);
```

3. Add tests in `test/commands/your-command.test.ts`.

## Adding a New Adapter

Implement the `TokenAdapter` interface from `src/adapters/adapter.ts`:

```typescript
export interface TokenAdapter {
  getSessionUsage(sessionId: string): Promise<TokenUsage[]>;
  listSessions(from: Date, to: Date): Promise<SessionSummary[]>;
  getProjectSessions(projectPath: string): Promise<SessionSummary[]>;
  isAvailable(): boolean;
}
```

## Testing

- Tests use [Vitest](https://vitest.dev/)
- Test files go in `test/` mirroring the `src/` structure
- Engine functions should be pure and easy to test
- Command tests can mock the adapter

```bash
npm test               # Run once
npm run test:watch     # Watch mode
```

## Commit Messages

Use conventional commit format:

```
feat: add weekly report command
fix: correct cache token calculation
refactor: consolidate renderer components
docs: update architecture diagram
test: add savings tracker tests
```
