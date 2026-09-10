"use client";

import { useState } from "react";
import Papa from "papaparse";
import { Upload, X } from "lucide-react";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";
import { detectColumn, inferRole, parseSeats, type ColumnField } from "@/lib/csv-import";
import { importParticipants, type Direction, type ImportResult, type ImportRow } from "@/lib/api";
import { networkMessage } from "@/lib/event-format";

const FIELD_LABELS: Record<ColumnField, string> = {
  name: "Nom",
  address: "Adresse",
  seats: "Places",
  ignore: "Ignorer",
};

type Step = "pick-file" | "map-columns" | "importing" | "done";

interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Assistant d'import en lot depuis un export de sondage (Google Forms, le
 * plus souvent) — cf. plan. Trois étapes : lire le fichier, corriger la
 * correspondance de colonnes devinée automatiquement, envoyer. Le rôle
 * (conducteur/passager) n'est jamais une colonne à mapper explicitement :
 * il se déduit de la colonne "Places" (cf. `inferRole`), plus fiable qu'un
 * texte libre à interpréter.
 */
export function ImportDialog({
  eventId,
  defaultDirection,
  onClose,
  onImported,
}: {
  eventId: string;
  defaultDirection: Direction;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<Step>("pick-file");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<string, ColumnField>>({});
  const [directions, setDirections] = useState<Direction[]>([defaultDirection]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleFile(file: File) {
    setError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        if (headers.length === 0 || results.data.length === 0) {
          setError("Ce fichier ne contient aucune ligne exploitable.");
          return;
        }
        const guessed: Record<string, ColumnField> = {};
        for (const header of headers) guessed[header] = detectColumn(header);
        setMapping(guessed);
        setParsed({ headers, rows: results.data });
        setStep("map-columns");
      },
      error: (err) => setError(err.message),
    });
  }

  function buildRows(): ImportRow[] {
    if (!parsed) return [];
    const nameCol = Object.entries(mapping).find(([, f]) => f === "name")?.[0];
    const addressCol = Object.entries(mapping).find(([, f]) => f === "address")?.[0];
    const seatsCol = Object.entries(mapping).find(([, f]) => f === "seats")?.[0];

    return parsed.rows.map((row) => {
      const seats = seatsCol ? parseSeats(row[seatsCol]) : null;
      const role = seatsCol ? inferRole(row[seatsCol]) : "passenger";
      return {
        role,
        name: nameCol ? (row[nameCol] ?? "") : "",
        address: addressCol ? (row[addressCol] ?? "") : "",
        seats: role === "driver" ? seats : undefined,
        directions,
      };
    });
  }

  async function handleImport() {
    setStep("importing");
    setError(null);
    try {
      const res = await importParticipants(eventId, buildRows());
      setResult(res);
      setStep("done");
      onImported();
    } catch (err) {
      setError(networkMessage(err, "L'import n'a pas abouti. Réessaie."));
      setStep("map-columns");
    }
  }

  const hasNameAndAddress = Object.values(mapping).includes("name") && Object.values(mapping).includes("address");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Importer des inscrits depuis un fichier"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== "importing") onClose();
      }}
    >
      <div
        data-surface
        className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-lg border border-line bg-surface p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Importer depuis un fichier</h2>
            <p className="mt-1 text-xs text-muted">
              Un export CSV d&apos;un sondage (Google Forms : Réponses → feuille de calcul liée → Fichier →
              Télécharger → Valeurs séparées par des virgules).
            </p>
          </div>
          {step !== "importing" && (
            <button
              type="button"
              aria-label="Fermer"
              onClick={onClose}
              className="shrink-0 rounded p-1 text-muted transition hover:text-ink"
            >
              <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>

        {step === "pick-file" && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted transition hover:border-ink">
            <Upload className="size-5" strokeWidth={1.75} aria-hidden="true" />
            Choisir un fichier .csv
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
        )}

        {step === "map-columns" && parsed && (
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line bg-paper">
                    {parsed.headers.map((header) => (
                      <th key={header} className="min-w-40 p-2 align-top font-medium">
                        <p className="mb-1 truncate" title={header}>
                          {header}
                        </p>
                        <select
                          value={mapping[header]}
                          onChange={(e) =>
                            setMapping((m) => ({ ...m, [header]: e.target.value as ColumnField }))
                          }
                          className={`${inputClass} py-1 text-xs`}
                        >
                          {(Object.keys(FIELD_LABELS) as ColumnField[]).map((field) => (
                            <option key={field} value={field}>
                              {FIELD_LABELS[field]}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      {parsed.headers.map((header) => (
                        <td key={header} className="truncate p-2 text-muted" title={row[header]}>
                          {row[header] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!hasNameAndAddress && (
              <p className="text-xs text-warning">
                Choisis au moins une colonne « Nom » et une colonne « Adresse » pour continuer.
              </p>
            )}
            {!Object.values(mapping).includes("seats") && (
              <p className="text-xs text-muted">
                Aucune colonne « Places » choisie : tout le monde sera importé comme passager.
              </p>
            )}

            <Field label="Sens du trajet pour tout le lot">
              <div className="flex gap-3">
                {(["ramassage", "dispersion"] as Direction[]).map((d) => (
                  <label key={d} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={directions.includes(d)}
                      onChange={(e) =>
                        setDirections((current) =>
                          e.target.checked ? [...current, d] : current.filter((x) => x !== d),
                        )
                      }
                    />
                    {d === "ramassage" ? "Aller" : "Retour"}
                  </label>
                ))}
              </div>
            </Field>

            {error && <ErrorNote>{error}</ErrorNote>}

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleImport}
                disabled={!hasNameAndAddress || directions.length === 0}
              >
                Importer {parsed.rows.length} ligne{parsed.rows.length > 1 ? "s" : ""}
              </Button>
              <Button type="button" variant="quiet" onClick={() => setStep("pick-file")}>
                Choisir un autre fichier
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <p className="py-8 text-center text-sm text-muted">
            Import en cours… ça peut prendre jusqu&apos;à une minute pour un grand groupe (chaque adresse est
            localisée une par une).
          </p>
        )}

        {step === "done" && result && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              <span className="font-medium">{result.imported}</span> inscription
              {result.imported > 1 ? "s" : ""} importée{result.imported > 1 ? "s" : ""}
              {result.skipped.length > 0 && (
                <>
                  , <span className="font-medium">{result.skipped.length}</span> ignorée
                  {result.skipped.length > 1 ? "s" : ""}
                </>
              )}
              .
            </p>
            {result.skipped.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-md border border-line bg-paper p-3 text-xs text-muted">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    Ligne {s.row + 1} : {s.reason}
                  </li>
                ))}
              </ul>
            )}
            <div>
              <Button type="button" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
