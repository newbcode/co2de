import { colors } from "../renderer/colors.js";
import { sectionHeader } from "../renderer/format.js";
import {
  TIPS, CATEGORY_DESCRIPTIONS, findTipsByCategory,
  type Tip, type TipCategory,
} from "../engine/tips.js";

function renderTip(tip: Tip, index?: number): void {
  const num = index !== undefined ? `${index}. ` : "";
  const cat = colors.dim(`[${tip.category}]`);
  console.log(`  ${num}${colors.bold(tip.name)}  ${cat}`);
  console.log(`     ${colors.red("×")} ${colors.dim(tip.before)}`);
  console.log(`     ${colors.yellow("✓")} ${tip.after}`);
  console.log(`     ${colors.dim(tip.why)}`);
  console.log("");
}

/**
 * co2de tips — prompt-craft playbook.
 *
 *   co2de tips                 list all tips grouped by category
 *   co2de tips <category>      drill into a specific category
 *
 * Non-intrusive: only appears when the user pulls it. Never statusline,
 * never pre-prompt, never modal. Pattern-linked hinting happens in audit
 * and session replay, not here.
 */
export async function tipsCommand(category?: string): Promise<void> {
  const categories = Object.keys(CATEGORY_DESCRIPTIONS) as TipCategory[];

  console.log("");

  if (category) {
    const norm = category.toLowerCase() as TipCategory;
    if (!categories.includes(norm)) {
      console.log(`  Unknown category "${category}".`);
      console.log(colors.dim(`  Valid: ${categories.join(", ")}`));
      console.log("");
      return;
    }

    const tips = findTipsByCategory(norm);
    console.log(sectionHeader(`PROMPT CRAFT — ${norm.toUpperCase()}`, CATEGORY_DESCRIPTIONS[norm]));
    console.log("");
    tips.forEach((t) => renderTip(t));
    return;
  }

  // All tips, grouped
  console.log(sectionHeader("PROMPT CRAFT", "Same model, smarter use"));
  console.log("");
  console.log(colors.dim("  No downgrade. No less coding. Just fewer wasted tokens on the same Opus."));
  console.log(colors.dim("  Three pillars: prompt precision · response shape · cache continuity."));
  console.log("");

  let n = 1;
  for (const cat of categories) {
    const tips = findTipsByCategory(cat);
    if (tips.length === 0) continue;
    console.log(`  ${colors.bold(cat.toUpperCase())}  ${colors.dim("— " + CATEGORY_DESCRIPTIONS[cat])}`);
    console.log("");
    for (const tip of tips) {
      renderTip(tip, n++);
    }
  }

  console.log(colors.dim("  See one category at a time:  co2de tips <category>"));
  console.log(colors.dim(`  Categories: ${categories.join(" · ")}`));
  console.log("");
}
