// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { Component, Suspense } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useT } from "../i18n";
import { isModuleLoadError, lazyFor, type PageLoader } from "./lazyPage";

interface Props {
  load: PageLoader;
  /** Shown while the chunk is on its way. */
  fallback: ReactNode;
}

interface State {
  error: unknown;
}

/**
 * Suspense plus an error boundary for the documentation pages, which are the
 * only routes loaded on demand and, being deliberately kept out of the service
 * worker precache, the only ones whose chunk can be missing.
 *
 * Without a boundary a failed import propagates to the root and React unmounts
 * the whole tree: offline, opening /methodologie blanked the application.
 */
export class LazyPageBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Chargement de page interrompu", error, info.componentStack);
  }

  // A reload rather than a state reset: see lazyPage.ts, the module map keeps
  // the failure for the life of the document, so re-rendering the same lazy
  // component can only fail again. Offline the reload still works, the shell
  // is precached; it simply lands back on this message until the connection
  // returns.
  private reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error == null) {
      const Page = lazyFor(this.props.load);
      return <Suspense fallback={this.props.fallback}>{<Page />}</Suspense>;
    }
    return <LazyPageError chunkMissing={isModuleLoadError(error)} onReload={this.reload} />;
  }
}

// The message itself is a function component so it can read the active
// language through useT(): the boundary around it has to be a class, and a
// class cannot subscribe to the store.
function LazyPageError({
  chunkMissing,
  onReload,
}: {
  chunkMissing: boolean;
  onReload: () => void;
}) {
  const { t } = useT();
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "var(--ow-bg-0)", color: "var(--ow-fg-0)" }}
      role="alert"
    >
      <div className="max-w-md w-full text-center">
        <p className="text-base font-medium">
          {chunkMissing ? t("config.lazyPage.offlineTitle") : t("config.lazyPage.errorTitle")}
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--ow-fg-1)" }}>
          {chunkMissing ? t("config.lazyPage.offlineBody") : t("config.lazyPage.errorBody")}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onReload}
            className="min-h-[44px] px-4 rounded-xl text-sm font-medium"
            style={{ background: "var(--ow-accent-soft)", color: "var(--ow-accent)" }}
          >
            {t("config.lazyPage.reload")}
          </button>
          <a
            href="/"
            className="min-h-[44px] px-4 inline-flex items-center rounded-xl text-sm"
            style={{ color: "var(--ow-fg-1)" }}
          >
            {t("config.lazyPage.backToMap")}
          </a>
        </div>
      </div>
    </div>
  );
}
