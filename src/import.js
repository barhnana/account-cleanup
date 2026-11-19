// Reads a password-manager export (CSV) and turns it into a list of Konten.
// Only title, web address and login are taken over. Passwords and every other
// column are never copied out of the parsed rows.

// Accepted column names per field (lower case). Covers Apple (iPhone/Mac/Windows),
// Chrome/Edge, Firefox and Bitwarden exports.
const SPALTEN = {
  titel: ["title", "name"],
  url: ["url", "login_uri", "website"],
  login: ["username", "login_username", "login"],
};

/**
 * Parses CSV text into rows of strings (RFC 4180: quotes, "" escapes,
 * line breaks inside quotes, CRLF or LF).
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  text = text.replace(/^﻿/, "");

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** Returns the host name of a web address without "www.", or "" if there is none. */
export function webAdresse(url) {
  const roh = (url ?? "").trim();
  if (!roh) return "";
  try {
    const mitSchema = /^[a-z][a-z0-9+.-]*:\/\//i.test(roh) ? roh : `https://${roh}`;
    const { protocol, hostname } = new URL(mitSchema);
    if (protocol !== "http:" && protocol !== "https:") return "";
    return hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Turns the text of a password-manager export into Konten.
 * Result: { konten: [{ titel, adresse, login }], uebersprungen: number }
 * Throws an Error with a German message if the file is not a known export.
 */
export function importiereExport(text) {
  const [kopf, ...zeilen] = parseCsv(text);
  if (!kopf) throw new Error("Die Datei ist leer.");

  const namen = kopf.map((n) => n.trim().toLowerCase());
  const index = {};
  for (const [feld, moeglich] of Object.entries(SPALTEN)) {
    index[feld] = namen.findIndex((n) => moeglich.includes(n));
  }
  if (index.url === -1 || index.login === -1) {
    throw new Error(
      "Diese Datei sieht nicht wie ein Passwort-Export aus (Spalten für Webseite und Benutzername fehlen)."
    );
  }

  const konten = new Map();
  let uebersprungen = 0;
  for (const zeile of zeilen) {
    const adresse = webAdresse(zeile[index.url]);
    const login = (zeile[index.login] ?? "").trim();
    if (!adresse || !login) { uebersprungen++; continue; }

    const schluessel = `${adresse}\n${login.toLowerCase()}`;
    if (konten.has(schluessel)) continue;
    const titel = index.titel === -1 ? "" : (zeile[index.titel] ?? "").trim();
    konten.set(schluessel, { titel: titel || adresse, adresse, login });
  }
  return { konten: [...konten.values()], uebersprungen };
}
