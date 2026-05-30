import { useState } from "react";
import { consumeReturnPath } from "../config/returnPath";
import { PolarEditor } from "../components/PolarEditor";

export function ConfigPage() {
  const [returnPath] = useState<string>(() => consumeReturnPath());

  return (
    <div className="config-root min-h-screen">
      <header className="config-header sticky top-0 z-10 border-b backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href={returnPath} className="text-sm font-medium opacity-80 hover:opacity-100 transition">
            ← OpenWind
          </a>
          <span className="text-xs opacity-60">Configuration</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-2">Polaire personnalisée</h1>
        <p className="text-sm opacity-80 mb-8 leading-relaxed">
          Choisis un archétype de base, puis ajuste-le. L'échelle multiplie
          toute la polaire (utile si ton bateau est plus ou moins rapide
          que la référence). Pour un ajustement fin, sélectionne une
          courbe TWS et glisse ses points sur le diagramme.
        </p>
        <PolarEditor />

        <footer className="config-storage-note mt-10">
          OpenWind ne propose volontairement pas de comptes utilisateurs :
          aucune donnée n'est envoyée sur un serveur pour identifier qui tu es.
          Ta polaire perso est stockée localement dans ton navigateur. Si tu
          changes d'appareil, de navigateur ou si tu effaces les cookies de
          ce site, ces ajustements seront perdus.
        </footer>
      </main>

      <style>{`
        .config-root {
          background: var(--ow-bg-0, #0b1220);
          color: var(--ow-fg-0, #e2e8f0);
        }
        .config-storage-note {
          font-size: 12px;
          line-height: 1.55;
          color: var(--ow-fg-2, #94a3b8);
          padding: 14px 16px;
          border-radius: 10px;
          background: var(--ow-bg-1, rgba(255,255,255,0.03));
          border: 1px solid var(--ow-line-2, rgba(255,255,255,0.08));
          border-left-width: 3px;
          border-left-color: var(--ow-fg-2, #94a3b8);
        }
        .config-header {
          background: color-mix(in srgb, var(--ow-bg-0, #0b1220) 75%, transparent);
          border-color: var(--ow-line-2, rgba(255,255,255,0.08));
        }
      `}</style>
    </div>
  );
}
