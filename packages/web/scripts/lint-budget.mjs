#!/usr/bin/env node
/**
 * Lint ratchet.
 *
 * `npm run lint` reports 6 pre-existing errors, all of one kind now: refs
 * written during render, in SpotMap. They change when a Leaflet handler sees
 * a fresh callback, so clearing them means splitting that component up, which
 * is lot 4 of the rework plan. It is not a lint chore.
 *
 * The five others were setState called straight from an effect body, in App
 * and PlanPage: derived state pushed back into React instead of computed. They
 * went with the /plan reducer (lot 1), which turned them into transitions, plus
 * one view fallback on the explore page now derived while rendering.
 *
 * The fourteen before that were: `any` reaching into Leaflet internals, empty
 * catch blocks, a raw NBSP, a dead local, a component declared inside a
 * render, and two modules mixing components with plain exports. All cleared,
 * none of them touching behaviour.
 *
 * Making lint blocking today would therefore mean either a red CI forever or
 * a rushed rewrite of the components. Neither is acceptable, so CI enforces a
 * ceiling instead: the count may go down, never up. New code has to be clean
 * without holding it hostage to the existing debt.
 *
 * Lower BUDGET whenever the count drops. The script tells you when to.
 */
import { ESLint } from "eslint";

const BUDGET = 6;

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
