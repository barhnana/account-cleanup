// Löschanträge: creating them, their text (German / English), Zustände and Fristen.
// Pure functions, no DOM. Dates are "YYYY-MM-DD" strings in the user's local time.
import { VERZEICHNIS } from "./verzeichnis-daten.js";
import { alleVerantwortlichen, nachschlagen } from "./verzeichnis.js";

export const ANTRAG_ZUSTAENDE = {
  entwurf: "Entwurf",
  gesendet: "Gesendet",
  rueckfrage: "Rückfrage",
  erledigt: "Erledigt",
  abgelehnt: "Abgelehnt",
  ueberfaellig: "Überfällig",
};

const DEUTSCHSPRACHIG = new Set(["DE", "AT", "CH", "LI"]);

export function sprache(land) {
  return DEUTSCHSPRACHIG.has(land) ? "de" : "en";
}

/** Today's date in local time as "YYYY-MM-DD". */
export function heute(jetzt = new Date()) {
  const zwei = (n) => String(n).padStart(2, "0");
  return `${jetzt.getFullYear()}-${zwei(jetzt.getMonth() + 1)}-${zwei(jetzt.getDate())}`;
}

/**
 * Same day in a later month; if that day does not exist, the last day of that month
 * (31 Jan + 1 month = 28/29 Feb). This is how EU law counts month periods.
 */
export function monateSpaeter(datum, monate = 1) {
  const [j, m, t] = datum.split("-").map(Number);
  const zielMonat = m - 1 + monate;
  const letzterTag = new Date(Date.UTC(j, zielMonat + 1, 0)).getUTCDate();
  const ziel = new Date(Date.UTC(j, zielMonat, Math.min(t, letzterTag)));
  return ziel.toISOString().slice(0, 10);
}

/** German display format: 19.12.2026 */
export function datumAnzeigen(datum) {
  if (!datum) return "";
  const [j, m, t] = datum.split("-");
  return `${t}.${m}.${j}`;
}

const istEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** The e-mail address that appears most often among the Konten (Q10), or "". */
export function vorgeschlagenerAbsender(konten) {
  const zaehler = new Map();
  for (const k of konten) {
    if (!istEmail(k.login)) continue;
    const a = k.login.toLowerCase();
    zaehler.set(a, (zaehler.get(a) ?? 0) + 1);
  }
  return [...zaehler.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}

/** The Zustand to show: a sent Löschantrag whose Frist has passed is Überfällig. */
export function effektiverZustand(antrag, tag) {
  return antrag.zustand === "gesendet" && antrag.frist && tag > antrag.frist ? "ueberfaellig" : antrag.zustand;
}

function verantwortlicherVon(antrag, daten, verzeichnis) {
  return alleVerantwortlichen(daten, verzeichnis).find((v) => v.id === antrag.verantwortlicherId) ?? null;
}

function antragAendern(daten, id, aenderung) {
  return {
    ...daten,
    loeschantraege: daten.loeschantraege.map((a) => {
      if (a.id !== id) return a;
      const { neuerVerlauf = [], ...neu } = aenderung(a);
      return { ...neu, verlauf: [...(a.verlauf ?? []), ...neuerVerlauf] };
    }),
  };
}

function kontenZustand(daten, ids, zustand) {
  const set = new Set(ids);
  return { ...daten, konten: daten.konten.map((k) => (set.has(k.id) ? { ...k, zustand } : k)) };
}

/**
 * Creates a Löschantrag (Entwurf) for one Verantwortlicher with the given Konten.
 * The Konten move to "Im Löschantrag". Returns { daten, id }.
 */
export function antragErstellen(daten, verantwortlicherId, kontoIds, tag) {
  if (kontoIds.length === 0) throw new Error("Es gibt keine offenen Konten für diesen Löschantrag.");
  const konten = daten.konten.filter((k) => kontoIds.includes(k.id));
  const id = crypto.randomUUID();
  const antrag = {
    id,
    verantwortlicherId,
    kontoIds: [...kontoIds],
    absender: vorgeschlagenerAbsender(konten),
    zustand: "entwurf",
    erstellt: tag,
    gesendetAm: null,
    frist: null,
    verlauf: [{ datum: tag, ereignis: "Entwurf erstellt" }],
  };
  return {
    daten: kontenZustand({ ...daten, loeschantraege: [...daten.loeschantraege, antrag] }, kontoIds, "imLoeschantrag"),
    id,
  };
}

/** Deletes an Entwurf. Its Konten go back to "Offen". */
export function entwurfVerwerfen(daten, id) {
  const antrag = daten.loeschantraege.find((a) => a.id === id);
  if (!antrag || antrag.zustand !== "entwurf") throw new Error("Nur Entwürfe können verworfen werden.");
  return kontenZustand(
    { ...daten, loeschantraege: daten.loeschantraege.filter((a) => a.id !== id) },
    antrag.kontoIds, "offen",
  );
}

export function absenderSetzen(daten, id, absender) {
  return antragAendern(daten, id, (a) => ({ ...a, absender }));
}

export function alsGesendet(daten, id, tag) {
  return antragAendern(daten, id, (a) => ({
    ...a, zustand: "gesendet", gesendetAm: tag, frist: monateSpaeter(tag),
    neuerVerlauf: [{ datum: tag, ereignis: "Gesendet" }],
  }));
}

export function rueckfrageErhalten(daten, id, tag) {
  return antragAendern(daten, id, (a) => ({
    ...a, zustand: "rueckfrage", neuerVerlauf: [{ datum: tag, ereignis: "Rückfrage erhalten" }],
  }));
}

/** After answering a Rückfrage the Frist starts again: one month from the answer (Q18). */
export function rueckfrageBeantwortet(daten, id, tag) {
  return antragAendern(daten, id, (a) => ({
    ...a, zustand: "gesendet", frist: monateSpaeter(tag),
    neuerVerlauf: [{ datum: tag, ereignis: "Rückfrage beantwortet" }],
  }));
}

/** The Verantwortlicher extended the Frist (allowed by up to two more months). */
export function fristVerlaengern(daten, id, neueFrist, tag) {
  return antragAendern(daten, id, (a) => {
    if (!a.gesendetAm) throw new Error("Der Löschantrag ist noch nicht gesendet.");
    const hoechstens = monateSpaeter(a.gesendetAm, 3);
    if (neueFrist > hoechstens) {
      throw new Error(`Länger als bis zum ${datumAnzeigen(hoechstens)} darf die Frist nicht verlängert werden (höchstens drei Monate ab dem Senden).`);
    }
    return { ...a, frist: neueFrist, neuerVerlauf: [{ datum: tag, ereignis: `Frist verlängert bis ${datumAnzeigen(neueFrist)}` }] };
  });
}

export function abschliessen(daten, id, zustand, tag) {
  if (zustand !== "erledigt" && zustand !== "abgelehnt") throw new Error(`Ungültiger Abschluss: ${zustand}`);
  return antragAendern(daten, id, (a) => ({
    ...a, zustand, neuerVerlauf: [{ datum: tag, ereignis: ANTRAG_ZUSTAENDE[zustand] }],
  }));
}

/**
 * True if the Verantwortlicher has Konten of the user that are not in this Löschantrag
 * (and not already deleted). Then the request must cover only the named Konten (Q22).
 */
function hatWeitereKonten(antrag, daten, verzeichnis) {
  const drin = new Set(antrag.kontoIds);
  return daten.konten.some((k) =>
    !drin.has(k.id) && k.zustand !== "selbstGeloescht" &&
    nachschlagen(k.adresse, daten, verzeichnis).verantwortlicher?.id === antrag.verantwortlicherId);
}

/**
 * The finished request: recipient, subject and body in the right language.
 * Returns { verantwortlicher, sprache, email, formular, betreff, text }.
 */
export function antragText(antrag, daten, verzeichnis = VERZEICHNIS) {
  const v = verantwortlicherVon(antrag, daten, verzeichnis);
  const lang = sprache(v?.land);
  const name = daten.nutzer?.name?.trim() || (lang === "de" ? "[Dein Name]" : "[Your name]");
  const nurGenannte = hatWeitereKonten(antrag, daten, verzeichnis);
  const konten = daten.konten.filter((k) => antrag.kontoIds.includes(k.id));
  const zeilen = konten.map((k) => {
    const dienst = nachschlagen(k.adresse, daten, verzeichnis).dienst?.name ?? k.titel;
    return `- ${dienst} (${k.adresse}): ${k.login}`;
  }).join("\n");

  const t = lang === "de" ? deutsch(name, zeilen, nurGenannte) : englisch(name, zeilen, nurGenannte);
  return { verantwortlicher: v, sprache: lang, email: v?.email ?? null, formular: v?.formular ?? null, ...t };
}

function deutsch(name, zeilen, nurGenannte) {
  const umfang = nurGenannte
    ? "der personenbezogenen Daten, die Sie zu den unten genannten Konten über mich gespeichert haben"
    : "aller personenbezogenen Daten, die Sie über mich gespeichert haben, einschließlich der unten genannten Konten";
  return {
    betreff: "Antrag auf Löschung meiner personenbezogenen Daten (Art. 17 DSGVO)",
    text: [
      "Sehr geehrte Damen und Herren,",
      "",
      `hiermit beantrage ich gemäß Art. 17 Abs. 1 der Datenschutz-Grundverordnung (DSGVO) die unverzügliche Löschung ${umfang}. Zugleich widerrufe ich alle Einwilligungen, die ich Ihnen erteilt habe (Art. 7 Abs. 3 DSGVO).`,
      "",
      "Zu meiner Identifizierung:",
      `Name: ${name}`,
      "Konten:",
      zeilen,
      ...(nurGenannte ? ["", "Bitte löschen Sie ausschließlich die Daten zu diesen Konten. Weitere Konten, die ich bei Ihnen habe, sollen bestehen bleiben."] : []),
      "",
      "Bitte teilen Sie die Löschung allen Empfängern mit, denen Sie meine Daten offengelegt haben (Art. 19 DSGVO).",
      "",
      "Sollten Sie einzelne Daten wegen gesetzlicher Aufbewahrungspflichten nicht löschen dürfen, teilen Sie mir bitte mit, um welche Daten es sich handelt und auf welcher Rechtsgrundlage Sie sie aufbewahren, und schränken Sie deren Verarbeitung ein (Art. 18 DSGVO).",
      "",
      "Bitte bestätigen Sie mir die Löschung schriftlich. Nach Art. 12 Abs. 3 DSGVO haben Sie dafür einen Monat ab Eingang dieses Antrags Zeit.",
      "",
      "Mit freundlichen Grüßen",
      name,
    ].join("\n"),
  };
}

function englisch(name, zeilen, nurGenannte) {
  const umfang = nurGenannte
    ? "the personal data you hold about me in connection with the accounts listed below"
    : "all personal data you hold about me, including the accounts listed below";
  return {
    betreff: "Request for erasure of my personal data (Art. 17 GDPR)",
    text: [
      "Dear Sir or Madam,",
      "",
      `Under Article 17(1) of the General Data Protection Regulation (GDPR), I request the erasure without undue delay of ${umfang}. I also withdraw any consent I have given you (Art. 7(3) GDPR).`,
      "",
      "To identify me:",
      `Name: ${name}`,
      "Accounts:",
      zeilen,
      ...(nurGenannte ? ["", "Please erase only the data related to these accounts. Any other accounts I hold with you should remain active."] : []),
      "",
      "Please notify every recipient to whom you have disclosed my personal data of this erasure (Art. 19 GDPR).",
      "",
      "If you are legally required to retain any of the data, please tell me which data and on which legal basis, and restrict its processing (Art. 18 GDPR).",
      "",
      "Please confirm the erasure in writing. Under Art. 12(3) GDPR you have one month from receipt of this request to do so.",
      "",
      "Kind regards,",
      name,
    ].join("\n"),
  };
}

/** A mailto: link that opens the user's e-mail app with everything filled in. */
export function mailtoLink(email, betreff, text) {
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text.replace(/\n/g, "\r\n"))}`;
}

/**
 * Opens a new, filled-in Gmail message in the browser. If the sender is a Gmail address,
 * authuser makes Gmail pick that account when several are signed in.
 */
export function gmailLink(email, betreff, text, absender = "") {
  const p = new URLSearchParams({ view: "cm", fs: "1", to: email, su: betreff, body: text });
  if (/@(gmail|googlemail)\.com$/i.test(absender)) p.set("authuser", absender);
  return `https://mail.google.com/mail/?${p}`;
}

/** Opens Google Calendar with an all-day event on the Frist, ready to save. */
export function googleKalenderLink(antrag, verantwortlicherName) {
  const [j, m, t] = antrag.frist.split("-").map(Number);
  const start = antrag.frist.replace(/-/g, "");
  const ende = new Date(Date.UTC(j, m - 1, t + 1)).toISOString().slice(0, 10).replace(/-/g, "");
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `Frist Löschantrag: ${verantwortlicherName}`,
    dates: `${start}/${ende}`,
    details: `Heute endet die Frist für deinen Löschantrag an ${verantwortlicherName}. Noch keine Antwort? Öffne Account-Cleanup.`,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

/** A calendar file (.ics) with an all-day event on the Frist and a reminder the day before. */
export function kalenderEintrag(antrag, verantwortlicherName, jetzt = new Date()) {
  const tag = antrag.frist.replace(/-/g, "");
  const [j, m, t] = antrag.frist.split("-").map(Number);
  const ende = new Date(Date.UTC(j, m - 1, t + 1)).toISOString().slice(0, 10).replace(/-/g, "");
  const stempel = jetzt.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const esc = (s) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//account-cleanup//DE",
    "BEGIN:VEVENT",
    `UID:${antrag.id}-${tag}@account-cleanup`,
    `DTSTAMP:${stempel}`,
    `DTSTART;VALUE=DATE:${tag}`,
    `DTEND;VALUE=DATE:${ende}`,
    `SUMMARY:${esc(`Frist Löschantrag: ${verantwortlicherName}`)}`,
    `DESCRIPTION:${esc(`Heute endet die Frist für deinen Löschantrag an ${verantwortlicherName}. Noch keine Antwort? Öffne Account-Cleanup.`)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT15H",
    `DESCRIPTION:${esc(`Morgen endet die Frist für deinen Löschantrag an ${verantwortlicherName}.`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
