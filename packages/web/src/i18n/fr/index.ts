// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * French is the reference dictionary: every other language is typed against
 * its keys, file by file, so a missing or misspelt translation is a compile
 * error that points at the right file. Keys are flat, dotted, and prefixed
 * with the name of the file they live in (`plan.`, `legs.`, ...), which is
 * what keeps two files from ever defining the same key (see dicts.test.ts).
 */
import { common } from "./common";
import { config } from "./config";
import { explore } from "./explore";
import { plan } from "./plan";
import { legs } from "./legs";

export const fr = { ...common, ...config, ...explore, ...plan, ...legs } as const;

export type Dict = Record<keyof typeof fr, string>;
