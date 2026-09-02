// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Setup shared by every jsdom test (the `dom` project of `vitest.config.ts`).
 *
 * Testing Library unmounts its containers automatically only when the test
 * globals are injected (`test.globals: true`). We import `describe`/`it`/
 * `expect` explicitly everywhere, so the hook has to be registered by hand:
 * without it, each test leaves its tree in `document.body` and the next
 * `getByRole` sees two copies of the component.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
