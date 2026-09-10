"use client";

/**
 * QR code du lien de la page courante — utile pour un point de rassemblement
 * affiché sur place (un passager scanne plutôt que de retaper l'adresse).
 * Généré 100 % côté client (bibliothèque `qrcode`, aucun service tiers,
 * aucune requête réseau) à partir de `window.location.href`, donc jamais
 * disponible tant que le composant n'est pas monté — cf. `useEffect`.
 */

import { useEffect, useRef, useState } from "react";
import { QrCode, X } from "lucide-react";
import QRCode from "qrcode";

export function QrCodeButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || dataUrl) return;
    QRCode.toDataURL(window.location.href, { width: 320, margin: 1 })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [open, dataUrl]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium transition hover:border-ink ${className ?? ""}`}
      >
        <QrCode className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        QR code
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="QR code de l'événement"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            data-surface
            className="relative flex w-full max-w-xs flex-col items-center gap-4 rounded-lg border border-line bg-surface p-6"
          >
            <button
              type="button"
              aria-label="Fermer"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 rounded p-1 text-muted transition hover:text-ink"
            >
              <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <p className="text-sm font-medium">Scanne pour ouvrir cette page</p>
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- image générée localement (data: URI), pas une ressource à optimiser.
              <img src={dataUrl} alt="QR code du lien de l'événement" className="size-56 rounded-md border border-line" />
            ) : (
              <div className="grid size-56 place-items-center text-sm text-muted">Génération…</div>
            )}
            {dataUrl && (
              <a
                href={dataUrl}
                download="smartcovoit-qr.png"
                className="text-sm font-medium text-ink underline underline-offset-2"
              >
                Télécharger l&apos;image
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
