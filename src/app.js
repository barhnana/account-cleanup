// Connects the page (index.html) with the data and logic modules.
import { importiereExport, webAdresse } from "./import.js";
import {
  KONTO_ZUSTAENDE, kontenHinzufuegen, kontoZustandSetzen, kontoEntfernen,
  sicherungErstellen, sicherungLesen,
} from "./daten.js";
import { laden, speichern } from "./speicher.js";

let daten = laden();
let filter = "alle";
let speichernKlappt = true;

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
}

function hinweiseAnzeigen() {
  const ziel = $("hinweise");
  ziel.replaceChildren();
  if (!speichernKlappt) {
    ziel.append(meldung("fehler", el("p", {}, "Dein Browser erlaubt dieser Seite nicht, Daten zu speichern (z. B. im privaten Modus). Deine Änderungen gehen beim Schließen verloren – speichere eine Sicherung.")));
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
  const liste = daten.konten
    .filter((k) => filter === "alle" || k.zustand === filter)
    .sort((a, b) => a.adresse.localeCompare(b.adresse) || a.login.localeCompare(b.login));

  if (liste.length === 0) {
    $("konten").replaceChildren(el("li", { klasse: "leer" },
      daten.konten.length === 0 ? "Noch keine Konten. Importiere deine Passwort-Datei oder trag ein Konto von Hand ein." : "Keine Konten in diesem Zustand."));
    return;
  }
  $("konten").replaceChildren(...liste.map(kontoZeile));
}

function kontoZeile(konto) {
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

  return el("li", {},
    el("div", {},
      el("div", { klasse: "konto-name" }, konto.titel),
      el("div", { klasse: "konto-details" }, `${konto.adresse} · ${konto.login}`)),
    el("div", { klasse: "konto-aktionen" },
      auswahl,
      el("button", {
        type: "button", klasse: "zweitrangig",
        onclick: () => { if (confirm(`„${konto.titel}“ (${konto.login}) aus der Liste entfernen?`)) aendern(kontoEntfernen(daten, konto.id)); },
      }, "Entfernen")));
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
anzeigen();
