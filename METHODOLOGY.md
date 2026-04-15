# Methodology

This document explains how co2de estimates carbon emissions, what assumptions are made, where the numbers come from, and what the tool **cannot** tell you. If you find an error or a better data source, please open an issue.

## Scope

co2de estimates **Scope 2 emissions from inference electricity only**.

| Included | Excluded |
|----------|----------|
| GPU/TPU energy during inference | Model training energy (amortized) |
| Datacenter overhead (PUE) | Hardware manufacturing & disposal |
| | Network transmission energy |
| | Cooling beyond PUE factor |
| | Employee & office emissions |
| | Embodied carbon of user devices |

This is a **partial carbon footprint**. Total lifecycle emissions of AI usage are higher than what co2de reports. We chose this scope because inference energy is the only component that scales directly with token usage and can be meaningfully estimated per-session.

co2de is an **awareness tool, not a compliance tool**. Its outputs are not suitable for GHG Protocol reporting, carbon accounting, ESG audits, or regulatory filings without independent verification and proper uncertainty analysis.

## Calculation Pipeline

```
Tokens  -->  Energy (Wh)  -->  CO2 (gCO2e)  -->  Metaphors
```

### Step 1: Tokens to Energy

Each token consumes energy during inference. The energy depends on model size, hardware, batch size, and quantization. We assign a **Wh-per-token coefficient** to each model family:

| Model Family | Wh/token | Basis |
|-------------|----------|-------|
| Claude Opus | 0.005 | Large model, highest compute per token |
| Claude Sonnet | 0.0025 | Mid-size, ~50% of Opus estimate |
| Claude Haiku | 0.001 | Small, optimized for throughput |
| Gemini Pro | 0.004 | Comparable to large Claude models |
| Gemini Flash | 0.0015 | Comparable to small Claude models |
| Default fallback | 0.003 | Midpoint estimate |

**These coefficients are order-of-magnitude estimates, not measured values.**

#### How the coefficients were derived

No AI provider publishes per-token energy consumption. Our estimates are informed by:

1. **Luccioni et al. (2023)** — "Power Hungry Processing: Watts Driving the Cost of AI Deployment" ([arXiv:2311.16863](https://arxiv.org/abs/2311.16863)). Measured energy consumption of various LLM inference workloads. Reported ranges of 0.001-0.01 Wh per generation depending on model size and task.

2. **Patterson et al. (2021)** — "Carbon Emissions and Large Neural Networks" ([arXiv:2104.10350](https://arxiv.org/abs/2104.10350)). Provided framework for estimating compute energy from model FLOPs.

3. **Strubell et al. (2019)** — "Energy and Policy Considerations for Deep Learning in NLP" ([ACL 2019](https://aclanthology.org/P19-1355/)). Early work quantifying energy cost of NLP model training and inference.

4. **Anthropic pricing ratios** — Opus costs 5x Sonnet and 60x Haiku per token. While price does not equal energy (margins, demand, and strategic pricing are factors), the relative ordering correlates with model size and compute requirements.

We deliberately use **upper-bound estimates** because understating emissions defeats the tool's awareness purpose. The actual energy per token is likely lower than our estimates.

#### Cache read discount

Prompt caching stores KV-cache states from previous turns. Serving from cache skips the prefill computation entirely. We apply a **0.1x energy factor** (90% discount) to cache-read tokens.

**Basis**: Anthropic charges cache reads at 10% of input price. We use the pricing ratio as a proxy for energy savings. This is a **pricing-proxy assumption** — the actual energy ratio may differ due to pricing margins and strategy. If measured cache-energy data becomes available, we will update this factor.

#### Correlation with actual energy

**Mamun et al. (2026)** — "Towards Understanding the Relationship Between LLM Token Consumption and Environmental Impact" ([arXiv:2604.02776](https://arxiv.org/abs/2604.02776)) found that token count explains approximately **R^2 = 0.44** of the variance in actual inference energy consumption. Inference time is a stronger predictor (R^2 ~ 0.85) but is not available via API.

This means our token-based estimates have **significant uncertainty**. Two sessions with the same token count can have very different actual energy consumption depending on:

- Batch size and concurrent load on the server
- Hardware generation (H100 vs A100 vs TPU)
- Quantization and optimization techniques
- Actual inference time (thinking, tool use, etc.)
- Memory bandwidth vs compute bottleneck

We prefix all CO2 values with `~` to signal this uncertainty.

### Step 2: Energy to CO2

```
CO2 (grams) = Energy (kWh) x PUE x Carbon Intensity (gCO2/kWh)
```

#### PUE (Power Usage Effectiveness)

PUE accounts for datacenter overhead: cooling, networking, storage, lighting, and other infrastructure beyond the compute hardware.

| Provider | Reported PUE | Source |
|----------|-------------|--------|
| Google | ~1.10 | Google Environmental Report 2024 |
| AWS | ~1.20 | AWS Sustainability Report |
| Industry average | ~1.58 | Uptime Institute Global Data Center Survey 2023 |

**We use PUE = 1.2** as a reasonable estimate for hyperscaler datacenters. Anthropic does not publish its PUE. The actual value depends on the specific datacenter facility and may vary.

#### Carbon intensity

Carbon intensity measures how much CO2 is emitted per kWh of electricity, depending on the energy mix (coal, gas, nuclear, renewables) of the regional grid.

| Region | gCO2/kWh | Source |
|--------|----------|--------|
| Global average | 475 | IEA 2023 |
| US | 390 | IEA 2023 |
| EU | 230 | IEA 2023 |
| France | 55 | IEA 2023 (mostly nuclear) |
| Norway | 10 | IEA 2023 (mostly hydro) |
| South Korea | 415 | IEA 2023 |
| India | 630 | IEA 2023 (coal-heavy) |

**Important limitation**: These are **annual national averages**. Real grid intensity varies by:

- **Time of day**: Solar-heavy grids are cleaner during daytime, dirtier at night.
- **Season**: Hydro availability changes seasonally.
- **Hourly dispatch**: Can vary 2-5x within a single day.

**Where does inference actually run?** The `region` setting affects the **display only**. Actual emissions depend on where the AI provider runs inference. Anthropic primarily operates US-based datacenters (~390 gCO2/kWh). Setting your region to a cleaner grid does not reduce actual emissions — it changes the hypothetical "what if the datacenter were here" calculation. The default region is `global` (475 gCO2/kWh) as a conservative choice.

Future versions may integrate real-time grid data (e.g., [Electricity Maps API](https://www.electricitymaps.com/)) for more accurate intensity values.

### Step 3: CO2 to Metaphors

We convert CO2 grams to relatable equivalents:

| Metaphor | Conversion | Source |
|----------|-----------|--------|
| Tree absorption | 22 kg CO2/year | US Forest Service |
| Car driving | 120 g CO2/km | EPA 2024 |
| Phone charge | 8 g CO2/charge | IEA (full lifecycle) |
| Google search | 0.2 g CO2/search | Google Environmental Report 2024 |
| Netflix streaming | 36 g CO2/hour | IEA, The Shift Project |
| LED bulb | 10 g CO2/hour | 10W at global avg + lifecycle |

These are themselves estimates with wide confidence intervals. They are intended to provide intuitive scale, not precise equivalency.

## Savings Methodology

The "savings" feature compares actual usage against a **hypothetical worst-case baseline**:

- **ACTUAL**: Real model used, cache reads at 10% energy
- **WORST-CASE (hypothetical)**: All tokens priced as Opus, no cache discount (every token at full energy)

This worst-case is deliberately extreme. Most users would never use 100% Opus with 0% cache. The purpose is to show the **maximum possible range** of emissions for the same workload, not to imply that you "saved" this amount in any absolute sense.

The breakdown separates:
- **Cache reuse savings**: Energy not spent because tokens were served from cache
- **Lighter model savings**: Energy not spent because Sonnet/Haiku was used instead of Opus

## Hand-Coding Comparison

The `co2de compare` command estimates hand-coding CO2 as:

```
Hand CO2 = (lines / 3 lines per minute / 60) x 30W laptop / 1000 x carbon intensity
```

**This intentionally underestimates hand-coding emissions** by including only laptop electricity during raw typing. A realistic hand-coding setup includes: external monitor (~30-80W), IDE and build tools, web browsing for documentation, coffee machine, office HVAC, commute emissions, etc.

The comparison shows that AI coding uses more **direct compute energy** but is significantly faster. It is not a claim that AI coding is environmentally worse overall — the full lifecycle comparison is far more complex.

## Known Limitations

1. **Token count is a weak energy proxy** (R^2 ~ 0.44). Inference time would be 2x more predictive but is unavailable.
2. **Model coefficients are estimates**, not measured values. They may be off by 2-5x in either direction.
3. **Cache energy discount** is derived from pricing, not energy measurement.
4. **Grid carbon intensity** uses annual averages, not real-time values.
5. **PUE is assumed**, not measured for the specific provider.
6. **Scope is limited** to inference electricity. Training, hardware, and network emissions are excluded.
7. **Region setting is hypothetical** — it does not reflect where inference actually runs.

## Versioning

When we update coefficients or methodology, we will:
- Document the change in the changelog
- Note the previous and new values
- Cite the source that motivated the change

Current methodology version: **v1.0** (April 2026)

## References

1. Luccioni, A.S., Jernite, Y., & Strubell, E. (2023). Power Hungry Processing: Watts Driving the Cost of AI Deployment. [arXiv:2311.16863](https://arxiv.org/abs/2311.16863)
2. Mamun et al. (2026). Towards Understanding the Relationship Between LLM Token Consumption and Environmental Impact. [arXiv:2604.02776](https://arxiv.org/abs/2604.02776)
3. Patterson, D. et al. (2021). Carbon Emissions and Large Neural Networks. [arXiv:2104.10350](https://arxiv.org/abs/2104.10350)
4. Strubell, E., Ganesh, A., & McCallum, A. (2019). Energy and Policy Considerations for Deep Learning in NLP. [ACL 2019](https://aclanthology.org/P19-1355/)
5. IEA (2023). CO2 Emissions from Fuel Combustion. [iea.org](https://www.iea.org/data-and-statistics)
6. EPA (2024). Greenhouse Gas Equivalencies Calculator. [epa.gov](https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator)
7. Uptime Institute (2023). Global Data Center Survey. [uptimeinstitute.com](https://uptimeinstitute.com/resources/research-and-reports/uptime-institute-global-data-center-survey-results-2023)
