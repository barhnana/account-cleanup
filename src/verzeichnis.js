// Finds the Dienst and Verantwortlicher behind a web address, using the shipped
// Dienste-Verzeichnis plus the user's own entries (eigene Verantwortliche and Zuordnungen).
// Pure functions, no DOM.
import { VERZEICHNIS } from "./verzeichnis-daten.js";

/** True if host is the domain itself or a subdomain of it (login.example.com → example.com). */
function passt(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** All Verantwortliche the user can choose from: shipped ones first, then the user's own. */
export function alleVerantwortlichen(daten, verzeichnis = VERZEICHNIS) {
  return [
    ...verzeichnis.verantwortliche.map((v) => ({ ...v, eigen: false })),
    ...(daten.eigeneVerantwortliche ?? []).map((v) => ({ ...v, eigen: true })),
  ];
}

/**
 * Looks up a web address. A Zuordnung made by the user wins over the shipped Verzeichnis.
 * Returns { dienst: { name, loeschLink } | null, verantwortlicher: {...} | null }.
 */
export function nachschlagen(adresse, daten, verzeichnis = VERZEICHNIS) {
  const alle = alleVerantwortlichen(daten, verzeichnis);
  const finde = (id) => alle.find((v) => v.id === id) ?? null;

  const dienst = verzeichnis.dienste
    .filter((d) => d.domains.some((dom) => passt(adresse, dom)))
    // the most specific domain wins (e.g. music.example.com before example.com)
    .sort((a, b) => longest(b, adresse) - longest(a, adresse))[0] ?? null;

  const eigeneZuordnung = daten.zuordnungen?.[adresse];
  if (eigeneZuordnung) {
    return { dienst: dienst && { name: dienst.name, loeschLink: dienst.loeschLink ?? null }, verantwortlicher: finde(eigeneZuordnung) };
  }
  if (!dienst) return { dienst: null, verantwortlicher: null };
  return {
    dienst: { name: dienst.name, loeschLink: dienst.loeschLink ?? null },
    verantwortlicher: finde(dienst.verantwortlicher),
  };
}

function longest(dienst, adresse) {
  return Math.max(...dienst.domains.filter((d) => passt(adresse, d)).map((d) => d.length));
}

/**
 * Groups Konten by Verantwortlicher.
 * Returns { gruppen: [{ verantwortlicher, konten: [{ ...konto, dienst }] }], unbekannt: [konto] },
 * groups sorted by name.
 */
export function nachVerantwortlichemGruppieren(daten, verzeichnis = VERZEICHNIS) {
  const gruppen = new Map();
  const unbekannt = [];
  for (const konto of daten.konten) {
    const { dienst, verantwortlicher } = nachschlagen(konto.adresse, daten, verzeichnis);
    if (!verantwortlicher) { unbekannt.push(konto); continue; }
    if (!gruppen.has(verantwortlicher.id)) gruppen.set(verantwortlicher.id, { verantwortlicher, konten: [] });
    gruppen.get(verantwortlicher.id).konten.push({ ...konto, dienst });
  }
  return {
    gruppen: [...gruppen.values()].sort((a, b) => a.verantwortlicher.name.localeCompare(b.verantwortlicher.name)),
    unbekannt,
  };
}

/** Adds a Verantwortlicher entered by the user. Returns { daten, id }. */
export function eigenenVerantwortlichenAnlegen(daten, { name, land, email, formular }) {
  if (!name?.trim()) throw new Error("Bitte gib den Namen des Verantwortlichen ein.");
  if (!email?.trim() && !formular?.trim()) {
    throw new Error("Bitte gib eine Datenschutz-E-Mail-Adresse oder einen Link zum Datenschutz-Formular ein.");
  }
  const id = `eigen-${crypto.randomUUID()}`;
  const neu = {
    id,
    name: name.trim(),
    land: (land || "DE").trim().toUpperCase(),
    email: email?.trim() || null,
    formular: formular?.trim() || null,
  };
  return { daten: { ...daten, eigeneVerantwortliche: [...(daten.eigeneVerantwortliche ?? []), neu] }, id };
}

/** Assigns a web address to a Verantwortlicher (shipped or own). */
export function adresseZuordnen(daten, adresse, verantwortlicherId) {
  return { ...daten, zuordnungen: { ...(daten.zuordnungen ?? {}), [adresse]: verantwortlicherId } };
}

/** Removes the user's own Zuordnung for a web address. */
export function zuordnungAufheben(daten, adresse) {
  const { [adresse]: _, ...rest } = daten.zuordnungen ?? {};
  return { ...daten, zuordnungen: rest };
}
