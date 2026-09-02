"use client";

import type { Direction } from "@/lib/api";

/**
 * Le sens du trajet est le concept central de l'app, et « ramassage » vs
 * « dispersion » ne se devine pas d'un mot. On le montre : les mêmes points,
 * les mêmes traits, mais le flux va vers le point de rendez-vous ou en part.
 * Le schéma n'anime que l'option sélectionnée — deux animations concurrentes
 * se disputeraient l'attention sans rien apprendre de plus.
 */

const SPOKES = [
  { x: 13, y: 13 },
  { x: 83, y: 13 },
  { x: 13, y: 51 },
  { x: 83, y: 51 },
] as const;

const CENTER = { x: 48, y: 32 };

export function DirectionGlyph({
  direction,
  animated = false,
  className,
}: {
  direction: Direction;
  animated?: boolean;
  className?: string;
}) {
  const outbound = direction === "dispersion";

  return (
    <svg viewBox="0 0 96 64" className={className} aria-hidden="true" fill="none">
      {SPOKES.map((spoke, i) => (
        <line
          key={i}
          x1={spoke.x}
          y1={spoke.y}
          x2={CENTER.x}
          y2={CENTER.y}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="4 8"
          className={animated ? "animate-flow" : undefined}
          style={animated && outbound ? { animationDirection: "reverse" } : undefined}
          opacity="0.55"
        />
      ))}

      {/* Chevrons : sans eux, les deux schémas sont identiques à l'arrêt et
          seule l'animation les distingue — invisible sur une capture, pour qui
          survole vite, ou en `prefers-reduced-motion`. */}
      {SPOKES.map((spoke, i) => {
        const from = outbound ? CENTER : spoke;
        const to = outbound ? spoke : CENTER;
        const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
        return (
          <path
            key={i}
            d="M -3 -3 L 1.5 0 L -3 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform={`translate(${(spoke.x + CENTER.x) / 2} ${(spoke.y + CENTER.y) / 2}) rotate(${angle})`}
          />
        );
      })}

      {SPOKES.map((spoke, i) => (
        <circle
          key={i}
          cx={spoke.x}
          cy={spoke.y}
          r="3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="var(--color-surface)"
        />
      ))}

      {/* Le point de rendez-vous est plein : c'est le seul nœud partagé. */}
      <circle cx={CENTER.x} cy={CENTER.y} r="6" fill="currentColor" />
    </svg>
  );
}

const OPTIONS: { value: Direction; title: string; help: string }[] = [
  {
    value: "ramassage",
    title: "Aller",
    help: "Chacun part de chez soi et rejoint le point de rendez-vous.",
  },
  {
    value: "dispersion",
    title: "Retour",
    help: "Tout le monde part du point de rendez-vous et rentre chez soi.",
  },
];

/**
 * À l'inscription, une personne peut participer à l'aller, au retour, ou
 * aux deux (même adresse dans les deux cas — seul son rôle diffère, cf.
 * `addressCopy` dans event-page-client.tsx) : sélection multiple, pas
 * exclusive comme `DirectionPicker` ci-dessous.
 */
export function DirectionCheckboxes({
  value,
  onChange,
}: {
  value: Direction[];
  onChange: (next: Direction[]) => void;
}) {
  function toggle(direction: Direction) {
    onChange(value.includes(direction) ? value.filter((d) => d !== direction) : [...value, direction]);
  }

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Trajet(s)</legend>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((option) => {
          const checked = value.includes(option.value);
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-inbound ${
                checked ? "border-ink bg-ink text-paper" : "border-line text-muted hover:border-muted"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(option.value)}
                className="sr-only"
              />
              {option.title}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function DirectionPicker({
  value,
  onChange,
}: {
  value: Direction;
  onChange: (next: Direction) => void;
}) {
  return (
    <fieldset className="grid grid-cols-2 gap-3">
      <legend className="mb-2 text-sm font-medium">Sens du trajet</legend>

      {OPTIONS.map((option) => {
        const selected = value === option.value;
        const accent = option.value === "dispersion" ? "text-outbound" : "text-inbound";

        return (
          <label
            key={option.value}
            data-surface
            // Le radio est en sr-only : sans `has-[:focus-visible]`, un
            // utilisateur au clavier ne verrait pas quelle option a le focus.
            className={`group relative cursor-pointer rounded-lg border p-3 transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-inbound ${
              selected
                ? "border-current bg-surface " + accent
                : "border-line bg-surface text-muted hover:border-muted"
            }`}
          >
            <input
              type="radio"
              name="direction"
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <DirectionGlyph direction={option.value} animated={selected} className="h-14 w-full" />
            <span className={`mt-2 block text-sm font-medium ${selected ? "" : "text-ink"}`}>
              {option.title}
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-muted">{option.help}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
