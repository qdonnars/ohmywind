#!/usr/bin/env node
/**
 * Lint ratchet.
 *
 * `npm run lint` reports 26 pre-existing errors, all of the same few kinds:
 * refs written during render, setState called straight from an effect body,
 * a handful of `any`, empty catch blocks. Clearing them is not a lint chore,
 * it is the frontend work of phase 4 of the refacto plan, which lifts state
 * and effects out of the big components.
 *
 * Making lint blocking today would therefore mean either a red CI forever or
 * a rushed rewrite of the components. Neither is acceptable, so CI enforces a
 * ceiling instead: the count may go down, never up. New code has to be clean
 * without holding it hostage to the existing debt.
 *
 * Lower BUDGET whenever the count drops. The script tells you when to.
 */
import { ESLint } from "eslint";

const BUDGET = 26;

const eslint = new ESLint();
const results = await eslint.lintFiles(["."]);
const errors = results.reduce((total, r) => total + r.errorCount, 0);
const warnings = results.reduce((total, r) => total + r.warningCount, 0);

console.log(`ESLint: ${errors} error(s), ${warnings} warning(s). Budget: ${BUDGET}.`);

if (errors > BUDGET) {
  const formatter = await eslint.loadFormatter("stylish");
  console.error(await formatter.format(results));
  console.error(
    `\nLint budget exceeded: ${errors} errors for a budget of ${BUDGET}.\n` +
      `Fix what this branch introduced rather than raising the budget.`,
  );
  process.exit(1);
}

if (errors < BUDGET) {
  // Deliberately not a failure: an unrelated branch should not break because
  // it happened to improve things.
  console.log(
    `Budget can be lowered to ${errors} in packages/web/scripts/lint-budget.mjs.`,
  );
}
