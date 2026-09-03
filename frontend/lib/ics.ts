/**
 * Export .ics (RFC 5545) — purement côté client : tout le contenu (nom,
 * date, adresse, description) est déjà dans EventDetail, un aller-retour
 * serveur n'apporterait rien pour un fichier à usage unique.
 */

import type { EventDetail } from "@/lib/api";
import { SITE_URL } from "@/lib/site";

const CRLF = "\r\n";
// Marge sous 76 (limite RFC) : les lignes se replient à un multiple d'octets
// UTF-8 valide, un peu de marge évite de couper au milieu d'un caractère
// multi-octets près de la limite.
const FOLD_AT = 73;

/** \\, puis ; et , puis les retours à la ligne — dans cet ordre, sinon les
 * antislashes ajoutés pour ; et , seraient eux-mêmes ré-échappés. */
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => `\\${c}`).replace(/\r\n|\r|\n/g, "\\n");
}

/** Replie une ligne de contenu au-delà de FOLD_AT octets UTF-8, avec un
 * espace de continuation en début de ligne suivante (RFC 5545 §3.1). */
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= FOLD_AT) return line;

  const parts: string[] = [];
  let offset = 0;
  let limit = FOLD_AT;
  while (offset < bytes.length) {
    let end = Math.min(offset + limit, bytes.length);
    // Ne pas couper au milieu d'un caractère multi-octets (continuation
    // UTF-8 : les octets 0x80–0xBF ne démarrent jamais un caractère).
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    parts.push(new TextDecoder().decode(bytes.slice(offset, end)));
    offset = end;
    limit = FOLD_AT - 1; // la continuation commence par un espace
  }
  return parts.join(`${CRLF} `);
}

function toIcsDate(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function icsFileName(event: EventDetail): string {
  const slug = event.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // diacritiques (accents) une fois décomposés par NFD
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${slug || "evenement"}.ics`;
}

export function buildEventIcs(event: EventDetail): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SmartCovoit//FR",
    "BEGIN:VEVENT",
    // Stable et dérivé de l'id d'événement : réimporter le même fichier met
    // à jour l'entrée dans l'agenda plutôt que d'en créer une deuxième.
    `UID:${event.id}@smartcovoit.qmeyer.fr`,
    `DTSTAMP:${nowStamp()}`,
    `DTSTART;VALUE=DATE:${toIcsDate(event.event_date)}`,
    `DTEND;VALUE=DATE:${toIcsDate(nextDay(event.event_date))}`,
    `SUMMARY:${escapeText(event.name)}`,
    `LOCATION:${escapeText(event.depot_address)}`,
    `GEO:${event.depot_lat};${event.depot_lon}`,
    `DESCRIPTION:${escapeText(
      [event.description, `${SITE_URL}/events/${event.id}`].filter(Boolean).join("\n\n"),
    )}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
