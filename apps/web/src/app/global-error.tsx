"use client";

import { useEffect } from "react";

// Replaces the root layout when it fails: no global styles here, so styles are inline.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#fafaf8", color: "#121314", margin: 0 }}>
        <title>Erreur</title>
        <main style={{ maxWidth: 560, margin: "15vh auto", padding: "0 16px" }}>
          <h1 style={{ fontSize: 32 }}>Le service est momentanément indisponible.</h1>
          <p style={{ color: "#5b5e63" }}>Réessayez dans un instant. Vos vidéos et vos clips ne sont pas perdus.</p>
          <button type="button" onClick={() => retry()}
            style={{ background: "#f5b000", color: "#121314", border: 0, borderRadius: 999, padding: "12px 24px", fontWeight: 600, cursor: "pointer" }}>
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
