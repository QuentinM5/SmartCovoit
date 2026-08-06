"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { inputClass } from "@/components/ui";

export interface AddressValue {
  address: string;
  lat: number | null;
  lon: number | null;
}

/**
 * Champ d'adresse avec suggestions Google Places.
 *
 * Deux points importants :
 *
 * 1. On garde notre propre <input> et notre propre liste plutôt que le widget
 *    fourni par Google : celui-ci s'affiche dans un shadow DOM qu'on ne peut
 *    pas mettre aux couleurs de l'app, et il ignorerait le mode sombre.
 *
 * 2. Un jeton de session relie toutes les frappes d'une même saisie à la
 *    requête finale de détails. Sans lui, Google facture chaque frappe
 *    séparément ; avec lui, la saisie complète compte pour une seule session.
 *    Le jeton est renouvelé après chaque sélection, comme l'exige l'API.
 *
 * Si Google ne répond pas, le champ reste un champ texte ordinaire : l'adresse
 * saisie part sans coordonnées et le serveur la géocode comme avant.
 */
export function AddressInput({
  value,
  onChange,
  placeholder,
  required,
  id,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
}) {
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [unavailable, setUnavailable] = useState(false);

  const placesRef = useRef<typeof google.maps.places | null>(null);
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const listId = `${id ?? generatedId}-suggestions`;

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(async (g) => {
        const places = (await g.maps.importLibrary("places")) as typeof google.maps.places;
        if (cancelled) return;
        placesRef.current = places;
        sessionRef.current = new places.AutocompleteSessionToken();
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Anti-rebond : une requête par pause de frappe, pas une par caractère.
  useEffect(() => {
    const places = placesRef.current;
    const query = value.address.trim();

    if (!places || query.length < 3) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { suggestions: found } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: query,
            sessionToken: sessionRef.current ?? undefined,
            language: "fr-CA",
            region: "ca",
            includedRegionCodes: ["ca"],
          });
        if (cancelled) return;
        setSuggestions(found.slice(0, 5));
        setActiveIndex(-1);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value.address]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  async function choose(suggestion: google.maps.places.AutocompleteSuggestion) {
    const prediction = suggestion.placePrediction;
    if (!prediction) return;

    setOpen(false);
    setSuggestions([]);

    const label = prediction.text?.toString() ?? "";
    onChange({ address: label, lat: null, lon: null });

    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      onChange({
        address: place.formattedAddress ?? label,
        lat: place.location?.lat() ?? null,
        lon: place.location?.lng() ?? null,
      });
    } catch {
      // Le libellé seul suffit : le serveur géocodera.
    } finally {
      // L'API impose un nouveau jeton après chaque sélection.
      const places = placesRef.current;
      if (places) sessionRef.current = new places.AutocompleteSessionToken();
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && suggestions.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        required={required}
        value={value.address}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        onChange={(e) => {
          // Toute frappe invalide les coordonnées de la suggestion précédente.
          onChange({ address: e.target.value, lat: null, lon: null });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={inputClass}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          data-surface
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-line bg-surface shadow-lg"
        >
          {suggestions.map((s, i) => {
            const p = s.placePrediction;
            if (!p) return null;
            return (
              <li key={p.placeId ?? i} id={`${listId}-${i}`} role="option" aria-selected={i === activeIndex}>
                <button
                  type="button"
                  // pointerdown plutôt que click : le blur du champ fermerait
                  // la liste avant que le click n'aboutisse.
                  onPointerDown={(e) => {
                    e.preventDefault();
                    choose(s);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm transition ${
                    i === activeIndex ? "bg-ink/5 dark:bg-ink/10" : ""
                  }`}
                >
                  <MapPin
                    className="mt-0.5 size-3.5 shrink-0 text-muted"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{p.mainText?.toString() ?? p.text?.toString()}</span>
                    {p.secondaryText && (
                      <span className="block truncate text-xs text-muted">
                        {p.secondaryText.toString()}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {unavailable && (
        <p className="mt-1 text-xs text-muted">
          Suggestions indisponibles. Saisis l&apos;adresse complète, elle sera localisée à
          l&apos;envoi.
        </p>
      )}
    </div>
  );
}
