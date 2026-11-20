// Connects the page (index.html) with the data and logic modules.
import { importiereExport, webAdresse } from "./import.js";
import {
  KONTO_ZUSTAENDE, kontenHinzufuegen, kontoZustandSetzen, kontoEntfernen,
  sicherungErstellen, sicherungLesen, nutzerNameSetzen,
} from "./daten.js";
import {
  ANTRAG_ZUSTAENDE, heute, datumAnzeigen, effektiverZustand, antragErstellen, entwurfVerwerfen,
  absenderSetzen, alsGesendet, rueckfrageErhalten, rueckfrageBeantwortet, fristVerlaengern,
  abschliessen, antragText, mailtoLink, kalenderEintrag, monateSpaeter,
} from "./loeschantrag.js";
import { laden, speichern } from "./speicher.js";
import {
  alleVerantwortlichen, nachVerantwortlichemGruppieren, eigenenVerantwortlichenAnlegen,
  adresseZuordnen, zuordnungAufheben,
} from "./verzeichnis.js";

let daten = laden();
let filter = "alle";
let speichernKlappt = true;
let zuordnenOffen = null; // web address whose "Zuordnen" form is open

const $ = (id) => document.getElementById(id);

/** Creates an element. Text is always set as text, never as HTML. */
function el(tag, eigenschaften = {}, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(eigenschaften)) {
    if (k === "klasse") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kind of kinder.flat()) e.append(kind);
  return e;
}

function meldung(art, ...inhalt) {
  return el("div", { klasse: `meldung ${art}` }, ...inhalt);
}

function aendern(neueDaten) {
  daten = { ...neueDaten, zuletztGeaendert: new Date().toISOString() };
  speichernKlappt = speichern(daten);
  anzeigen();
}

// ---------- Anzeige ----------

function anzeigen() {
  hinweiseAnzeigen();
  filterAnzeigen();
  kontenAnzeigen();
  antraegeAnzeigen();
}

function datei(inhalt, typ, name) {
  const link = el("a", { href: URL.createObjectURL(new Blob([inhalt], { type: typ })), download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

function verantwortlicherName(antrag) {
  return alleVerantwortlichen(daten).find((v) => v.id === antrag.verantwortlicherId)?.name ?? "Unbekannt";
}

function hinweiseAnzeigen() {
  const ziel = $("hinweise");
  ziel.replaceChildren();
  if (!speichernKlappt) {
    ziel.append(meldung("fehler", el("p", {}, "Dein Browser erlaubt dieser Seite nicht, Daten zu speichern (z. B. im privaten Modus). Deine Änderungen gehen beim Schließen verloren – speichere eine Sicherung.")));
  }
  const tag = heute();
  const bald = datumPlusTage(tag, 7);
  const ueberfaellig = daten.loeschantraege.filter((a) => effektiverZustand(a, tag) === "ueberfaellig");
  const faellig = daten.loeschantraege.filter((a) => effektiverZustand(a, tag) === "gesendet" && a.frist <= bald);
  if (ueberfaellig.length) {
    ziel.append(meldung("fehler",
      el("p", {}, el("b", {}, `Überfällig (${ueberfaellig.length}): `), "Diese Verantwortlichen haben nicht rechtzeitig geantwortet."),
      el("ul", {}, ueberfaellig.map((a) => el("li", {}, `${verantwortlicherName(a)} – Frist war der ${datumAnzeigen(a.frist)}`)))));
  }
  if (faellig.length) {
    ziel.append(meldung("warnung",
      el("p", {}, el("b", {}, `Frist endet bald (${faellig.length}):`)),
      el("ul", {}, faellig.map((a) => el("li", {}, `${verantwortlicherName(a)} – bis ${datumAnzeigen(a.frist)}`)))));
  }
  const ungesichert = daten.konten.length > 0 &&
    (!daten.zuletztGesichert || daten.zuletztGeaendert > daten.zuletztGesichert);
  if (ungesichert) {
    ziel.append(meldung("warnung",
      el("p", {}, "Du hast Änderungen, die noch in keiner Sicherung sind."),
      el("button", { type: "button", onclick: sicherungSpeichern }, "Sicherung jetzt speichern"),
    ));
  }
}

function filterAnzeigen() {
  const anzahl = (z) => daten.konten.filter((k) => k.zustand === z).length;
  const knoepfe = [["alle", "Alle", daten.konten.length],
    ...Object.entries(KONTO_ZUSTAENDE).map(([z, name]) => [z, name, anzahl(z)])];
  $("filter").replaceChildren(...knoepfe.map(([wert, name, n]) =>
    el("button", {
      type: "button",
      "aria-pressed": String(filter === wert),
      onclick: () => { filter = wert; anzeigen(); },
    }, `${name} (${n})`)));
}

function kontenAnzeigen() {
  const ziel = $("konten");
  if (daten.konten.length === 0) {
    ziel.replaceChildren(el("p", { klasse: "leer" }, "Noch keine Konten. Importiere deine Passwort-Datei oder trag ein Konto von Hand ein."));
    return;
  }
  const sichtbar = (k) => filter === "alle" || k.zustand === filter;
  const sortiert = (konten) => konten.filter(sichtbar)
    .sort((a, b) => a.adresse.localeCompare(b.adresse) || a.login.localeCompare(b.login));

  const { gruppen, unbekannt } = nachVerantwortlichemGruppieren(daten);
  const bloecke = [];

  const unbekanntSichtbar = sortiert(unbekannt);
  if (unbekanntSichtbar.length) {
    bloecke.push(el("div", { klasse: "gruppe unbekannt" },
      el("div", { klasse: "gruppe-kopf" },
        el("h3", {}, `Verantwortlicher unbekannt (${unbekanntSichtbar.length})`),
        el("p", { klasse: "klein" }, "Diese Webseiten kennt das Verzeichnis noch nicht. Tippe auf „Zuordnen“ und wähle die Firma dahinter aus oder trag sie neu ein.")),
      el("ul", { klasse: "konten-liste" }, unbekanntSichtbar.map((k) => kontoZeile(k, { unbekannt: true })))));
  }

  for (const { verantwortlicher: v, konten } of gruppen) {
    const sichtbare = sortiert(konten);
    if (!sichtbare.length) continue;
    const offene = konten.filter((k) => k.zustand === "offen");
    bloecke.push(el("div", { klasse: "gruppe" },
      el("div", { klasse: "gruppe-kopf" },
        el("h3", {}, v.name, v.eigen ? el("span", { klasse: "marke" }, "eigener Eintrag") : ""),
        el("p", { klasse: "klein" }, kontaktText(v)),
        offene.length
          ? el("button", { type: "button", klasse: "antrag-knopf", onclick: () => antragAnlegen(v, offene) },
            `Löschantrag erstellen (${offene.length} ${offene.length === 1 ? "offenes Konto" : "offene Konten"})`)
          : ""),
      el("ul", { klasse: "konten-liste" }, sichtbare.map((k) => kontoZeile(k)))));
  }

  ziel.replaceChildren(...(bloecke.length ? bloecke : [el("p", { klasse: "leer" }, "Keine Konten in diesem Zustand.")]));
}

function kontaktText(v) {
  const teile = [];
  if (v.email) teile.push(`Datenschutz: ${v.email}`);
  if (v.formular) teile.push(el("a", { href: v.formular, target: "_blank", rel: "noopener noreferrer" }, "Datenschutz-Formular ↗"));
  return teile.flatMap((t, i) => (i ? [" · ", t] : [t]));
}

function kontoZeile(konto, { unbekannt = false } = {}) {
  const auswahl = el("select", {
    "aria-label": `Zustand von ${konto.titel}`,
    onchange: (e) => aendern(kontoZustandSetzen(daten, konto.id, e.target.value)),
  });
  for (const [wert, name] of Object.entries(KONTO_ZUSTAENDE)) {
    // "Im Löschantrag" is set by creating a Löschantrag, not by hand.
    if (wert === "imLoeschantrag" && konto.zustand !== wert) continue;
    const option = el("option", { value: wert }, name);
    option.selected = konto.zustand === wert;
    auswahl.append(option);
  }
  auswahl.disabled = konto.zustand === "imLoeschantrag";

  const eigeneZuordnung = Boolean(daten.zuordnungen?.[konto.adresse]);
  const aktionen = [auswahl];
  if (unbekannt) {
    aktionen.push(el("button", {
      type: "button",
      onclick: () => { zuordnenOffen = zuordnenOffen === konto.adresse ? null : konto.adresse; anzeigen(); },
    }, "Zuordnen"));
  }
  if (eigeneZuordnung) {
    aktionen.push(el("button", {
      type: "button", klasse: "zweitrangig",
      onclick: () => aendern(zuordnungAufheben(daten, konto.adresse)),
    }, "Zuordnung aufheben"));
  }
  aktionen.push(el("button", {
    type: "button", klasse: "zweitrangig",
    onclick: () => { if (confirm(`„${konto.titel}“ (${konto.login}) aus der Liste entfernen?`)) aendern(kontoEntfernen(daten, konto.id)); },
  }, "Entfernen"));

  const loeschLink = konto.dienst?.loeschLink && konto.zustand === "offen"
    ? el("a", { klasse: "klein", href: konto.dienst.loeschLink, target: "_blank", rel: "noopener noreferrer" },
      `Geht schneller: Konto direkt bei ${konto.dienst.name} löschen ↗`)
    : "";

  return el("li", {},
    el("div", {},
      el("div", { klasse: "konto-name" }, konto.titel),
      el("div", { klasse: "konto-details" }, `${konto.adresse} · ${konto.login}`),
      loeschLink),
    el("div", { klasse: "konto-aktionen" }, aktionen),
    unbekannt && zuordnenOffen === konto.adresse ? zuordnenFormular(konto.adresse) : "");
}

function zuordnenFormular(adresse) {
  const auswahl = el("select", { name: "verantwortlicher", "aria-label": "Verantwortlicher" },
    el("option", { value: "" }, "– bitte wählen –"),
    el("option", { value: "neu" }, "Neuen Verantwortlichen eintragen …"),
    ...alleVerantwortlichen(daten)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((v) => el("option", { value: v.id }, v.name)));

  const neuFelder = el("div", { klasse: "neu-felder", hidden: "" },
    el("p", { klasse: "klein" }, "Name und Datenschutz-Kontakt stehen in der Datenschutzerklärung der Webseite (meist ganz unten verlinkt, oft unter „Verantwortlicher“)."),
    el("label", {}, "Name der Firma", el("input", { name: "name", autocomplete: "off" })),
    el("label", {}, "Datenschutz-E-Mail-Adresse", el("input", { name: "email", type: "email", autocomplete: "off", autocapitalize: "off" })),
    el("label", {}, "oder Link zum Datenschutz-Formular", el("input", { name: "formular", type: "url", autocomplete: "off", autocapitalize: "off" })),
    el("label", {}, "Sitz der Firma",
      el("select", { name: "land" },
        el("option", { value: "DE" }, "Deutschland"),
        el("option", { value: "AT" }, "Österreich"),
        el("option", { value: "XX" }, "anderes Land"))));

  auswahl.addEventListener("change", () => { neuFelder.hidden = auswahl.value !== "neu"; });

  const form = el("form", {
    klasse: "zuordnen-form",
    onsubmit: (e) => {
      e.preventDefault();
      const f = e.target.elements; // .elements, because form.name would be the form's own name
      try {
        let neu = daten;
        let id = f.verantwortlicher.value;
        if (!id) throw new Error("Bitte wähle einen Verantwortlichen aus.");
        if (id === "neu") {
          ({ daten: neu, id } = eigenenVerantwortlichenAnlegen(daten, {
            name: f.name.value, email: f.email.value, formular: f.formular.value, land: f.land.value,
          }));
        }
        zuordnenOffen = null;
        aendern(adresseZuordnen(neu, adresse, id));
      } catch (fehler) {
        alert(fehler.message);
      }
    },
  },
  el("label", {}, `Wer steckt hinter ${adresse}?`, auswahl),
  neuFelder,
  el("div", { klasse: "knopfreihe" },
    el("button", { type: "submit" }, "Speichern"),
    el("button", { type: "button", klasse: "zweitrangig", onclick: () => { zuordnenOffen = null; anzeigen(); } }, "Abbrechen")));
  return form;
}

// ---------- Löschanträge ----------

function datumPlusTage(datum, tage) {
  const [j, m, t] = datum.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t + tage)).toISOString().slice(0, 10);
}

function antragAnlegen(verantwortlicher, offene) {
  const liste = offene.map((k) => `• ${k.titel} (${k.login})`).join("\n");
  if (!confirm(`Löschantrag an ${verantwortlicher.name} für diese Konten erstellen?\n\n${liste}\n\nKonten, die du behalten willst, vorher auf „Behalten“ stellen.`)) return;
  const { daten: neu, id } = antragErstellen(daten, verantwortlicher.id, offene.map((k) => k.id), heute());
  aendern(neu);
  document.getElementById(`antrag-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function kopieren(text, knopf) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const feld = el("textarea", {}, text);
    document.body.append(feld);
    feld.select();
    document.execCommand("copy");
    feld.remove();
  }
  const vorher = knopf.textContent;
  knopf.textContent = "Kopiert ✓";
  setTimeout(() => { knopf.textContent = vorher; }, 1500);
}

function kopierFeld(beschriftung, wert, { mehrzeilig = false } = {}) {
  const feld = mehrzeilig
    ? el("textarea", { readonly: "", rows: "12" }, wert)
    : el("input", { readonly: "", value: wert });
  return el("div", { klasse: "kopier-feld" },
    el("div", { klasse: "kopier-kopf" },
      el("span", {}, beschriftung),
      el("button", { type: "button", klasse: "zweitrangig", onclick: (e) => kopieren(wert, e.currentTarget) }, "Kopieren")),
    feld);
}

/** A date field (default today) plus a button that runs aktion(datum). */
function datumAktion(beschriftung, aktion, { klasse = "" } = {}) {
  const feld = el("input", { type: "date", value: heute(), "aria-label": `Datum für „${beschriftung}“` });
  return el("div", { klasse: "datum-aktion" }, feld,
    el("button", {
      type: "button", klasse,
      onclick: () => {
        try { aendern(aktion(feld.value || heute())); } catch (fehler) { alert(fehler.message); }
      },
    }, beschriftung));
}

function antraegeAnzeigen() {
  $("nutzer-name").value = daten.nutzer?.name ?? "";
  const tag = heute();
  const reihenfolge = ["ueberfaellig", "rueckfrage", "entwurf", "gesendet", "erledigt", "abgelehnt"];
  const antraege = [...daten.loeschantraege].sort((a, b) =>
    reihenfolge.indexOf(effektiverZustand(a, tag)) - reihenfolge.indexOf(effektiverZustand(b, tag)));
  $("antraege").replaceChildren(...(antraege.length
    ? antraege.map((a) => antragKarte(a, tag))
    : [el("p", { klasse: "leer" }, "Noch keine Löschanträge. Du erstellst sie oben bei „Deine Konten“ – pro Verantwortlichem ein Antrag.")]));
}

function antragKarte(antrag, tag) {
  const zustand = effektiverZustand(antrag, tag);
  const t = antragText(antrag, daten);
  const name = t.verantwortlicher?.name ?? "Unbekannt";
  const konten = daten.konten.filter((k) => antrag.kontoIds.includes(k.id));

  const kopf = el("div", { klasse: "antrag-kopf" },
    el("h3", {}, name),
    el("span", { klasse: `zustand zustand-${zustand}` }, ANTRAG_ZUSTAENDE[zustand]));

  const info = el("p", { klasse: "klein" },
    `${konten.length} ${konten.length === 1 ? "Konto" : "Konten"} · ${t.sprache === "de" ? "Deutsch" : "Englisch"}`,
    antrag.gesendetAm ? ` · gesendet am ${datumAnzeigen(antrag.gesendetAm)}` : "",
    antrag.frist && ["gesendet", "ueberfaellig", "rueckfrage"].includes(zustand) ? ` · Frist: ${datumAnzeigen(antrag.frist)}` : "");

  const teile = [kopf, info];

  if (zustand === "entwurf") {
    teile.push(...entwurfTeile(antrag, t, konten));
  } else {
    if (zustand === "gesendet" || zustand === "ueberfaellig") {
      teile.push(el("div", { klasse: "knopfreihe" },
        el("button", { type: "button", klasse: "zweitrangig", onclick: () => datei(kalenderEintrag(antrag, name), "text/calendar", `frist-${name.replace(/[^\wäöüÄÖÜß-]+/g, "-")}.ics`) }, "In Kalender eintragen")));
      if (zustand === "ueberfaellig") {
        teile.push(meldung("fehler", el("p", {}, "Die Frist ist abgelaufen. Du kannst nachhaken oder dich bei der Datenschutz-Aufsichtsbehörde beschweren. Eine fertige Erinnerungs-Mail kommt in Version 2.")));
      }
      teile.push(el("p", { klasse: "klein" }, "Antwort bekommen? Trag sie hier ein:"),
        el("div", { klasse: "aktionen-raster" },
          datumAktion("Erledigt", (d) => abschliessen(daten, antrag.id, "erledigt", d)),
          datumAktion("Rückfrage erhalten", (d) => rueckfrageErhalten(daten, antrag.id, d), { klasse: "zweitrangig" }),
          datumAktion("Abgelehnt", (d) => abschliessen(daten, antrag.id, "abgelehnt", d), { klasse: "zweitrangig" })),
        verlaengernTeil(antrag));
    }
    if (zustand === "rueckfrage") {
      teile.push(el("p", { klasse: "klein" }, "Der Verantwortliche will mehr wissen (z. B. einen Identitätsnachweis). Entscheide selbst, was du schickst – gib nicht mehr preis als nötig. Wenn du geantwortet hast, beginnt die Frist neu (ein Monat)."),
        el("div", { klasse: "aktionen-raster" },
          datumAktion("Rückfrage beantwortet", (d) => rueckfrageBeantwortet(daten, antrag.id, d)),
          datumAktion("Erledigt", (d) => abschliessen(daten, antrag.id, "erledigt", d), { klasse: "zweitrangig" }),
          datumAktion("Abgelehnt", (d) => abschliessen(daten, antrag.id, "abgelehnt", d), { klasse: "zweitrangig" })));
    }
    if (zustand === "abgelehnt") {
      teile.push(el("p", { klasse: "klein" }, "Wenn du die Ablehnung für unberechtigt hältst, kannst du dich bei der Datenschutz-Aufsichtsbehörde beschweren."));
    }
    teile.push(el("details", {},
      el("summary", {}, "Gesendeten Text und Verlauf anzeigen"),
      kopierFeld("Betreff", t.betreff),
      kopierFeld("Text", t.text, { mehrzeilig: true }),
      el("ul", { klasse: "verlauf" }, (antrag.verlauf ?? []).map((v) => el("li", {}, `${datumAnzeigen(v.datum)}: ${v.ereignis}`)))));
  }
  return el("div", { klasse: `antrag antrag-${zustand}`, id: `antrag-${antrag.id}` }, teile);
}

function entwurfTeile(antrag, t, konten) {
  const teile = [];
  const adressen = [...new Set(konten.map((k) => k.login.toLowerCase()).filter((l) => l.includes("@")))];

  if (!daten.nutzer?.name?.trim()) {
    teile.push(meldung("warnung", el("p", {}, "Trag unten bei „Dein Name“ deinen Namen ein – er steht im Antrag.")));
  }
  if (adressen.length > 1) {
    const auswahl = el("select", { onchange: (e) => aendern(absenderSetzen(daten, antrag.id, e.target.value)) },
      adressen.map((a) => { const o = el("option", { value: a }, a); o.selected = a === antrag.absender; return o; }));
    teile.push(el("label", {}, "Abschicken von dieser Adresse:", auswahl),
      el("p", { klasse: "klein" }, "Der Verantwortliche kann so leichter prüfen, dass die Konten dir gehören. Die anderen Adressen stehen im Text."));
  } else if (antrag.absender) {
    teile.push(el("p", { klasse: "klein" }, `Schick den Antrag von ${antrag.absender} ab – mit dieser Adresse sind die Konten angelegt.`));
  }

  if (t.email) {
    teile.push(kopierFeld("Empfänger", t.email));
  } else if (t.formular) {
    teile.push(el("p", {}, "Dieser Verantwortliche nimmt Anträge nur über ein Formular an. Öffne es und kopiere Betreff und Text hinein.",
      t.formular && antrag.absender ? ` Als E-Mail-Adresse im Formular: ${antrag.absender}.` : ""));
  }
  teile.push(kopierFeld("Betreff", t.betreff), kopierFeld("Text", t.text, { mehrzeilig: true }));

  const knoepfe = [];
  if (t.email) knoepfe.push(el("a", { klasse: "knopf", href: mailtoLink(t.email, t.betreff, t.text) }, "In E-Mail-Programm öffnen"));
  if (t.formular) knoepfe.push(el("a", { klasse: t.email ? "knopf zweitrangig" : "knopf", href: t.formular, target: "_blank", rel: "noopener noreferrer" }, "Formular öffnen ↗"));
  teile.push(el("div", { klasse: "knopfreihe" }, knoepfe));

  teile.push(el("p", { klasse: "klein" }, "Abgeschickt? Dann markiere ihn als gesendet – ab dann läuft die Frist von einem Monat."),
    el("div", { klasse: "aktionen-raster" },
      datumAktion("Als gesendet markieren", (d) => alsGesendet(daten, antrag.id, d))),
    el("div", { klasse: "knopfreihe" },
      el("button", {
        type: "button", klasse: "zweitrangig",
        onclick: () => { if (confirm("Entwurf verwerfen? Die Konten werden wieder auf „Offen“ gesetzt.")) aendern(entwurfVerwerfen(daten, antrag.id)); },
      }, "Entwurf verwerfen")));
  return teile;
}

function verlaengernTeil(antrag) {
  const feld = el("input", { type: "date", value: antrag.frist, max: monateSpaeter(antrag.gesendetAm, 3), "aria-label": "Neue Frist" });
  return el("details", {},
    el("summary", {}, "Der Verantwortliche hat die Frist verlängert"),
    el("p", { klasse: "klein" }, "Das ist erlaubt, wenn er es begründet – höchstens auf drei Monate ab dem Senden."),
    el("div", { klasse: "datum-aktion" }, feld,
      el("button", {
        type: "button",
        onclick: () => { try { aendern(fristVerlaengern(daten, antrag.id, feld.value, heute())); } catch (f) { alert(f.message); } },
      }, "Neue Frist speichern")));
}

// ---------- Import ----------

async function dateiImportieren(e) {
  const datei = e.target.files[0];
  e.target.value = "";
  if (!datei) return;
  const ziel = $("import-ergebnis");
  try {
    const { konten, uebersprungen } = importiereExport(await datei.text());
    const ergebnis = kontenHinzufuegen(daten, konten);
    aendern(ergebnis.daten);
    ziel.replaceChildren(
      meldung("erfolg", el("p", {},
        `${ergebnis.neu} neue Konten übernommen.` +
        (ergebnis.schonVorhanden ? ` ${ergebnis.schonVorhanden} waren schon in deiner Liste.` : "") +
        (uebersprungen ? ` ${uebersprungen} Einträge ohne Webseite oder Benutzername übersprungen (z. B. WLAN).` : ""))),
      meldung("warnung",
        el("p", {}, el("b", {}, "Jetzt die Passwort-Datei löschen – zweimal:")),
        el("ol", {},
          el("li", {}, "Öffne die App „Dateien“ → „Downloads“, halte den Finger auf die Datei und tippe auf „Löschen“."),
          el("li", {}, "Geh in „Dateien“ zu „Zuletzt gelöscht“, halte den Finger auf die Datei und tippe auf „Sofort löschen“. Sonst bleibt sie dort noch 30 Tage liegen."))),
      meldung("warnung",
        el("p", {}, el("b", {}, "Nicht alle Konten stehen in der Datei.")),
        el("p", {}, "Konten, bei denen du dich mit „Mit Apple anmelden“, „Mit Google anmelden“ oder „Mit Facebook anmelden“ registriert hast, haben kein Passwort und fehlen deshalb. Trag sie oben von Hand ein. Du findest sie hier:"),
        el("ul", {},
          el("li", {}, "Apple: Einstellungen → dein Name → „Anmeldung & Sicherheit“ → „Mit Apple anmelden“"),
          el("li", {}, "Google: in deinem Google-Konto unter „Sicherheit“ → Verbindungen zu Drittanbieter-Apps und -Diensten"),
          el("li", {}, "Facebook: Einstellungen → „Apps und Websites“"))),
    );
  } catch (fehler) {
    ziel.replaceChildren(meldung("fehler", el("p", {}, fehler.message)));
  }
}

function kontoVonHand(e) {
  e.preventDefault();
  const form = e.target;
  const adresse = webAdresse(form.adresse.value);
  if (!adresse) {
    alert("Bitte gib eine Webseite ein, z. B. zalando.de");
    return;
  }
  const ergebnis = kontenHinzufuegen(daten, [{ titel: form.titel.value, adresse, login: form.login.value }]);
  if (ergebnis.neu === 0) alert("Dieses Konto ist schon in deiner Liste.");
  aendern(ergebnis.daten);
  form.reset();
}

// ---------- Sicherung ----------

function sicherungSpeichern() {
  const jetzt = new Date();
  const mitZeit = { ...daten, zuletztGesichert: jetzt.toISOString() };
  const datei = new Blob([sicherungErstellen(mitZeit, jetzt)], { type: "application/json" });
  const link = el("a", {
    href: URL.createObjectURL(datei),
    download: `account-cleanup-sicherung-${jetzt.toISOString().slice(0, 10)}.json`,
  });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  daten = mitZeit;
  speichernKlappt = speichern(daten);
  anzeigen();
}

async function sicherungOeffnen(e) {
  const datei = e.target.files[0];
  e.target.value = "";
  if (!datei) return;
  try {
    const neu = sicherungLesen(await datei.text());
    if (daten.konten.length > 0 &&
        !confirm(`Die Sicherung ersetzt deine aktuelle Liste (${daten.konten.length} Konten) durch die aus der Datei (${neu.konten.length} Konten). Fortfahren?`)) return;
    daten = neu;
    speichernKlappt = speichern(daten);
    anzeigen();
    alert(`Sicherung geöffnet: ${neu.konten.length} Konten.`);
  } catch (fehler) {
    alert(fehler.message);
  }
}

$("import-datei").addEventListener("change", dateiImportieren);
$("konto-form").addEventListener("submit", kontoVonHand);
$("sicherung-speichern").addEventListener("click", sicherungSpeichern);
$("sicherung-oeffnen").addEventListener("change", sicherungOeffnen);
$("nutzer-name").addEventListener("change", (e) => aendern(nutzerNameSetzen(daten, e.target.value)));
anzeigen();
