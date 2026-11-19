// The user's data (Konten, later Löschanträge) and pure functions that change it.
// No DOM, no storage: everything here returns new data and is testable with node --test.

export const KONTO_ZUSTAENDE = {
  offen: "Offen",
  behalten: "Behalten",
  selbstGeloescht: "Selbst gelöscht",
  imLoeschantrag: "Im Löschantrag",
};

const SICHERUNG_KENNUNG = "account-cleanup-sicherung";
const VERSION = 1;

export function leereDaten() {
  return {
    version: VERSION,
    nutzer: { name: "" },
    konten: [],
    loeschantraege: [],
    eigeneVerantwortliche: [],
    zuordnungen: {},
  };
}

function schluessel(adresse, login) {
  return `${adresse.toLowerCase()}\n${login.trim().toLowerCase()}`;
}

/**
 * Adds Konten ({ titel, adresse, login }) that are not already present.
 * Returns { daten, neu, schonVorhanden }.
 */
export function kontenHinzufuegen(daten, kandidaten) {
  const vorhanden = new Set(daten.konten.map((k) => schluessel(k.adresse, k.login)));
  const neu = [];
  for (const k of kandidaten) {
    const s = schluessel(k.adresse, k.login);
    if (vorhanden.has(s)) continue;
    vorhanden.add(s);
    neu.push({
      id: crypto.randomUUID(),
      titel: (k.titel || k.adresse).trim(),
      adresse: k.adresse.trim().toLowerCase(),
      login: k.login.trim(),
      zustand: "offen",
    });
  }
  return {
    daten: { ...daten, konten: [...daten.konten, ...neu] },
    neu: neu.length,
    schonVorhanden: kandidaten.length - neu.length,
  };
}

/** Sets the Zustand of one Konto. "imLoeschantrag" is only set by Löschanträge, not by hand. */
export function kontoZustandSetzen(daten, id, zustand) {
  if (!(zustand in KONTO_ZUSTAENDE)) throw new Error(`Unbekannter Zustand: ${zustand}`);
  return { ...daten, konten: daten.konten.map((k) => (k.id === id ? { ...k, zustand } : k)) };
}

export function kontoEntfernen(daten, id) {
  return { ...daten, konten: daten.konten.filter((k) => k.id !== id) };
}

export function nutzerNameSetzen(daten, name) {
  return { ...daten, nutzer: { ...daten.nutzer, name: name.trim() } };
}

/** Turns the data into the text of a Sicherung file. */
export function sicherungErstellen(daten, jetzt = new Date()) {
  return JSON.stringify({ kennung: SICHERUNG_KENNUNG, erstellt: jetzt.toISOString(), daten }, null, 2);
}

/** Reads the text of a Sicherung file. Throws an Error with a German message if it is not one. */
export function sicherungLesen(text) {
  let inhalt;
  try {
    inhalt = JSON.parse(text);
  } catch {
    throw new Error("Diese Datei ist keine Sicherung von Account-Cleanup.");
  }
  if (inhalt?.kennung !== SICHERUNG_KENNUNG || !Array.isArray(inhalt.daten?.konten)) {
    throw new Error("Diese Datei ist keine Sicherung von Account-Cleanup.");
  }
  if (inhalt.daten.version > VERSION) {
    throw new Error("Diese Sicherung stammt aus einer neueren Version des Tools.");
  }
  return { ...leereDaten(), ...inhalt.daten };
}
