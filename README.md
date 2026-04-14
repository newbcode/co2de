# co2de

<!-- co2de-badge:start -->
[![co2de carbon badge](https://img.shields.io/badge/CO2-~3.55g-yellow)](https://github.com/newbcode/co2de)
<!-- co2de-badge:end -->

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/newbcode/co2de)](https://github.com/newbcode/co2de)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

> Track the carbon cost of vibe coding, one token at a time.

**co2de** is a CLI tool that estimates and visualizes the carbon footprint of AI-assisted development. Every token processed by large language models consumes energy, which produces CO2 emissions. co2de makes this invisible cost visible.

- Reads token usage directly from Claude Code session files
- Calculates energy with model-specific coefficients and cache discount
- Converts to CO2 using regional grid carbon intensity
- No API keys, no network calls — everything runs locally

## Install

```bash
npm install -g co2de
```

Then initialize the statusline integration:

```bash
co2de init
```

This patches your Claude Code statusline to show real-time CO2:

```
newbcode/co2de on main  |  Opus4  |  ctx 17%  |  $5.896  |  CO2 3.55g
```

CO2 color changes with emission level — dim when low, bold red when high.

## Quick Start

```bash
# Current session summary
co2de

# Detailed token usage — the main dashboard
co2de usage

# Why was this much CO2 emitted? Full calculation breakdown
co2de why

# AI coding vs hand coding comparison
co2de compare

# Generate HTML carbon receipt
co2de export
```

## Output Examples

### `co2de` — Session Summary

```
  co2de — Carbon Tracker

  SESSION   opus        13.5M tok   1.60g      $5.40   1.1g/line written
  PROJECT   8 ses      52.3M tok   3.55g     $28.17

  WEEK  Mo Tu We Th Fr Sa Su
        █  ▁  ▃  ·  ▁  ▁  ▅

  Total this week: 3.55g across 8 sessions
```

### `co2de usage` — Emission Ledger

```
  CO2 EMISSION LEDGER
  2026-04-07 → 2026-04-13

╔══════════════════════════════════════════════════════════════╗
║ COST      $28.17     CO2      ~3.55g     CACHE  93%          ║
║ 8 ses · 1 proj · 52.3M tok             █████████▎            ║
╚══════════════════════════════════════════════════════════════╝

  PROJECT                SES    TOKENS      COST       CO2   HIT  EMISSION
  ────────────────────── ───  ────────  ────────  ────────  ────  ────────────────
  nextjs-blog              8     52.3M    $28.17     3.55g   93%  ████████████████

  SESSION DETAIL
    #  DATE    MODEL      TOKENS    ...    CO2   HIT
  ···  nextjs-blog  — $28.17 · 3.55g · 8 ses
    1  Apr 13  opus        13.5M   ...   1.60g   88%  ████████████
    2  Apr 12  haiku        2.8M   ...   0.04g   91%  ▎░░░░░░░░░░░
    ...
```

### `co2de why` — Calculation Breakdown

```
  STEP 2: Energy Consumption
  Model: claude-opus-4-6 → 0.005 Wh/token
  Full-price tokens: 709,790 × 0.005 = 3548.95 Wh
  Cache-read tokens: 12,845,210 × 0.005 × 0.1 = 6422.61 Wh (90% discount)

  REGIONAL IMPACT — Same tokens, different grids
  Your region (us)    ████████████▍░░░░░░░   1.60g   390 gCO2/kWh
  France (nuclear)    █▊░░░░░░░░░░░░░░░░░░   0.23g    55 gCO2/kWh  -86%
  Norway (hydro)      ▍░░░░░░░░░░░░░░░░░░░   0.04g    10 gCO2/kWh  -97%
  India (coal-heavy)  ████████████████████   2.59g   630 gCO2/kWh  +62%
```

### `co2de savings` — Efficiency Report

```
  ACTUAL    █████░░░░░░░░░░░░░░░  3.55g
  WORST     ████████████████████  15.12g (all-opus, no cache)
  SAVED     ███████████████░░░░░  11.57g (77%)

  Cache hit rate: 93% — higher = more savings
  Excellent efficiency.
```

### `co2de export` — Carbon Receipt

Generates a self-contained HTML receipt. Add `--detail` for a full ESG-style report.

```bash
co2de export              # Carbon receipt (dark theme, shareable)
co2de export --detail     # Formal report (light theme, printable, methodology included)
co2de export --month      # Past 30 days
```

## Commands

| Command | Description |
|---------|-------------|
| `co2de` | Session summary with weekly sparkline |
| `co2de usage` | Detailed token usage — Emission Ledger (`--week`, `--month`, `--all`) |
| `co2de log` | Session history with CO2 bars |
| `co2de weekly` | Day-by-day breakdown |
| `co2de why` | Full calculation pipeline + regional impact |
| `co2de compare` | AI coding vs hand coding |
| `co2de audit` | Efficiency audit — detect waste (`--week`) |
| `co2de savings` | Carbon saved from cache reuse + lighter models |
| `co2de budget` | Daily carbon budget (`--set 50` or `--set 1.5kg`) |
| `co2de heatmap` | 30-day GitHub-style calendar |
| `co2de export` | HTML report (`--detail` for ESG/audit version) |
| `co2de badge` | README carbon badge (`--inject` to auto-insert) |
| `co2de config` | Configuration (`co2de config kr` to set region) |
| `co2de init` | Statusline patch + initial setup |
| `co2de statusline` | Single-line output for IDE integration |

## How It Works

```
Tokens  →  Energy (Wh)  →  CO2 (gCO2e)
```

1. **Tokens**: Reads from Claude Code session files (`~/.claude/projects/`)
2. **Energy**: Model-specific coefficients (Opus 0.005, Sonnet 0.0025, Haiku 0.001 Wh/token). Cache reads use 10% energy (90% discount).
3. **CO2**: Energy × PUE (1.2) × regional grid carbon intensity

All values are prefixed with `~` because token-based CO2 is an approximation (R²≈0.44 vs actual energy measurement). See [Mamun et al. 2026](https://arxiv.org/abs/2604.02776) for details.

## Configuration

```bash
co2de config kr              # Set region (shortcut)
co2de config set region fr   # Same thing, explicit
co2de config set budget 50   # Daily budget in grams
co2de config set budget 1.5kg  # Or in kg
```

**Regions**: `global` (475), `us` (390), `eu` (230), `uk` (210), `de` (350), `fr` (55), `se` (25), `no` (10), `kr` (415), `jp` (450), `cn` (555), `in` (630), `au` (510), `ca` (120), `br` (75) — values in gCO2/kWh.

## Carbon Badge

Add a carbon badge to your project README:

```bash
co2de badge              # Show markdown to copy
co2de badge --inject     # Auto-insert into README.md
```

Re-run `co2de badge --inject` after sessions to update the value.

## Data Sources

| Source | Used For |
|--------|----------|
| [IEA 2023](https://www.iea.org/data-and-statistics) | Grid carbon intensity by region |
| [Luccioni et al. 2023](https://arxiv.org/abs/2311.16863) | LLM inference energy measurements |
| [Mamun et al. 2026](https://arxiv.org/abs/2604.02776) | Token-energy correlation (R²≈0.44) |
| [EPA 2024](https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator) | Equivalency factors |
| [Uptime Institute 2023](https://uptimeinstitute.com/resources/research-and-reports/uptime-institute-global-data-center-survey-results-2023) | PUE benchmarks |

These are **conservative upper-bound estimates**. Actual emissions are likely lower. Run `co2de why` for the full methodology.

## Architecture

```
src/
├── adapters/     Data source (Claude CLI JSONL files)
├── engine/       Carbon calculator, savings tracker, analyzers
├── commands/     CLI command handlers (14 commands)
├── renderer/     Terminal output (charts, format utilities)
├── export/       HTML report generation (receipt + detail)
└── core/         Types, constants, configuration
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

```bash
git clone https://github.com/anthropics/co2de.git
cd co2de
npm install
npm run build
node dist/co2de.js
```

## License

MIT
