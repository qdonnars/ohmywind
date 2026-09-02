#!/usr/bin/env node
/**
 * Lint gate.
 *
 * This script used to be a ratchet: `npm run lint` reported errors the code
 * had carried for a while, so CI enforced a ceiling that could only go down.
 * The ceiling is now zero, and the script is a plain blocking lint.
 *
 * How the budget was spent down, newest first:
 *
 * - 6, refs written during render in SpotMap. Cleared by splitting the
 *   component up (lot 4.2): the six callback mirrors are written from one
 *   effect, and the two that mirrored `useState` setters are gone, React
 *   keeping setter identity stable on its own.
 * - 5, setState called straight from an effect body, in App and PlanPage:
 *   derived state pushed back into React instead of computed. They went with
 *   the /plan reducer (lot 1), which turned them into transitions, plus one
 *   view fallback on the explore page now derived while rendering.
 * - 14 before that: `any` reaching into Leaflet internals, empty catch
 *   blocks, a raw NBSP, a dead local, a component declared inside a render,
 *   and two modules mixing components with plain exports.
 *
 * None of them touched behaviour.
 *
 * The name is kept so CI, the contributing guide and muscle memory keep
 * working. Warnings stay warnings: `react-hooks/exhaustive-deps` on the map
 * init effects is deliberate and documented at each site.
 */
import { ESLint } from "eslint";

const eslint = new ESLint();
const results = await eslint.lintFiles(["."]);
const errors = results.reduce((total, r) => total + r.errorCount, 0);
const warnings = results.reduce((total, r) => total + r.warningCount, 0);

console.log(`ESLint: ${errors} error(s), ${warnings} warning(s).`);

if (errors > 0) {
  const formatter = await eslint.loadFormatter("stylish");
  console.error(await formatter.format(results));
  console.error(`\nLint is blocking: fix the ${errors} error(s) above.`);
  process.exit(1);
}
