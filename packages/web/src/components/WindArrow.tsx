// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

export function WindArrow({ degrees }: { degrees: number }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      style={{ transform: `rotate(${degrees + 180}deg)`, transition: "transform 0.3s ease" }}
    >
      <polygon points="8,1 13,15 8,10 3,15" fill="currentColor" />
    </svg>
  );
}
