import { test } from "node:test";
import assert from "node:assert/strict";
import { leereDaten, kontenHinzufuegen, kontoZustandSetzen, nutzerNameSetzen } from "../src/daten.js";
import {
  sprache, monateSpaeter, vorgeschlagenerAbsender, effektiverZustand, antragErstellen,
  entwurfVerwerfen, alsGesendet, rueckfrageErhalten, rueckfrageBeantwortet, fristVerlaengern,
  abschliessen, antragText, mailtoLink, kalenderEintrag,
} from "../src/loeschantrag.js";

const V = {
  verantwortliche: [
    { id: "meta", name: "Meta Test Ltd", land: "IE", email: null, formular: "https://example.org/form" },
    { id: "zal", name: "Zal Test SE", land: "DE", email: "privacy@example.org", formular: null },
  ],
  dienste: [
    { id: "insta", name: "Instagram", verantwortlicher: "meta", domains: ["instagram.com"] },
    { id: "fb", name: "Facebook", verantwortlicher: "meta", domains: ["facebook.com"] },
    { id: "zal", name: "Zalando", verantwortlicher: "zal", domains: ["zalando.de"] },
  ],
};

function beispiel() {
  let { daten } = kontenHinzufuegen(leereDaten(), [
    { titel: "Instagram", adresse: "instagram.com", login: "a@example.org" },
    { titel: "Facebook", adresse: "facebook.com", login: "b@example.org" },
    { titel: "Zalando", adresse: "zalando.de", login: "a@example.org" },
  ]);
  daten = nutzerNameSetzen(daten, "Max Muster");
  const id = (adresse) => daten.konten.find((k) => k.adresse === adresse).id;
  return { daten, id };
}

test("Fristen: ein Monat später, Monatsende wird richtig behandelt", () => {
  assert.equal(monateSpaeter("2026-11-20"), "2026-12-20");
  assert.equal(monateSpaeter("2026-12-15"), "2027-01-15");
  assert.equal(monateSpaeter("2027-01-31"), "2027-02-28");
  assert.equal(monateSpaeter("2028-01-31"), "2028-02-29");
  assert.equal(monateSpaeter("2026-11-20", 3), "2027-02-20");
});

test("Sprache: deutschsprachige Länder Deutsch, sonst Englisch", () => {
  assert.equal(sprache("DE"), "de");
  assert.equal(sprache("AT"), "de");
  assert.equal(sprache("IE"), "en");
  assert.equal(sprache(undefined), "en");
});

test("Absender: die häufigste E-Mail-Adresse, Benutzernamen zählen nicht", () => {
  assert.equal(vorgeschlagenerAbsender([
    { login: "b@example.org" }, { login: "A@example.org" }, { login: "a@example.org" }, { login: "nickname" },
  ]), "a@example.org");
  assert.equal(vorgeschlagenerAbsender([{ login: "nickname" }]), "");
});

test("Erstellen: Entwurf, Konten wechseln zu Im Löschantrag; Verwerfen macht das rückgängig", () => {
  const { daten, id } = beispiel();
  const erstellt = antragErstellen(daten, "meta", [id("instagram.com"), id("facebook.com")], "2026-11-20");
  const antrag = erstellt.daten.loeschantraege[0];
  assert.equal(antrag.zustand, "entwurf");
  assert.equal(erstellt.daten.konten.filter((k) => k.zustand === "imLoeschantrag").length, 2);
  const verworfen = entwurfVerwerfen(erstellt.daten, erstellt.id);
  assert.equal(verworfen.loeschantraege.length, 0);
  assert.ok(verworfen.konten.every((k) => k.zustand === "offen"));
});

test("Ablauf: gesendet → Rückfrage → beantwortet (neue Frist) → verlängert → erledigt", () => {
  const { daten, id } = beispiel();
  let { daten: d, id: a } = antragErstellen(daten, "zal", [id("zalando.de")], "2026-11-20");
  const antrag = () => d.loeschantraege[0];

  d = alsGesendet(d, a, "2026-11-20");
  assert.equal(antrag().frist, "2026-12-20");
  d = rueckfrageErhalten(d, a, "2026-11-25");
  assert.equal(antrag().zustand, "rueckfrage");
  d = rueckfrageBeantwortet(d, a, "2026-11-27");
  assert.equal(antrag().zustand, "gesendet");
  assert.equal(antrag().frist, "2026-12-27");
  d = fristVerlaengern(d, a, "2027-02-10", "2026-12-01");
  assert.equal(antrag().frist, "2027-02-10");
  assert.throws(() => fristVerlaengern(d, a, "2027-03-01", "2026-12-01"), /drei Monate/);
  d = abschliessen(d, a, "erledigt", "2027-01-05");
  assert.equal(antrag().zustand, "erledigt");
  assert.deepEqual(antrag().verlauf.map((v) => v.ereignis), [
    "Entwurf erstellt", "Gesendet", "Rückfrage erhalten", "Rückfrage beantwortet",
    "Frist verlängert bis 10.02.2027", "Erledigt",
  ]);
});

test("Überfällig: gesendet und Frist vorbei; am Fristtag selbst noch nicht", () => {
  const a = { zustand: "gesendet", frist: "2026-12-20" };
  assert.equal(effektiverZustand(a, "2026-12-20"), "gesendet");
  assert.equal(effektiverZustand(a, "2026-12-21"), "ueberfaellig");
  assert.equal(effektiverZustand({ ...a, zustand: "erledigt" }, "2027-05-01"), "erledigt");
});

test("Text auf Deutsch für deutsche Verantwortliche, mit Name, Konten und den DSGVO-Punkten", () => {
  const { daten, id } = beispiel();
  const { daten: d } = antragErstellen(daten, "zal", [id("zalando.de")], "2026-11-20");
  const t = antragText(d.loeschantraege[0], d, V);
  assert.equal(t.sprache, "de");
  assert.equal(t.email, "privacy@example.org");
  assert.match(t.betreff, /Art\. 17 DSGVO/);
  for (const teil of ["Max Muster", "Zalando (zalando.de): a@example.org", "Art. 19", "Art. 12 Abs. 3", "aller personenbezogenen Daten"]) {
    assert.ok(t.text.includes(teil), `fehlt: ${teil}`);
  }
});

test("Text auf Englisch für ausländische Verantwortliche", () => {
  const { daten, id } = beispiel();
  const { daten: d } = antragErstellen(daten, "meta", [id("instagram.com"), id("facebook.com")], "2026-11-20");
  const t = antragText(d.loeschantraege[0], d, V);
  assert.equal(t.sprache, "en");
  assert.equal(t.formular, "https://example.org/form");
  assert.match(t.text, /Article 17/);
  assert.match(t.text, /all personal data/);
});

test("Wird ein Konto beim selben Verantwortlichen behalten, betrifft der Antrag NUR die genannten Konten", () => {
  let { daten, id } = beispiel();
  daten = kontoZustandSetzen(daten, id("facebook.com"), "behalten");
  const { daten: d } = antragErstellen(daten, "meta", [id("instagram.com")], "2026-11-20");
  const t = antragText(d.loeschantraege[0], d, V);
  assert.ok(!t.text.includes("all personal data"));
  assert.match(t.text, /erase only the data related to these accounts/);
  assert.ok(!t.text.includes("facebook.com"), "das behaltene Konto darf nicht im Antrag stehen");
});

test("mailto-Link enthält Empfänger, Betreff und Text sicher kodiert", () => {
  const link = mailtoLink("privacy@example.org", "Betreff & mehr", "Zeile 1\nZeile 2");
  assert.ok(link.startsWith("mailto:privacy@example.org?subject=Betreff%20%26%20mehr&body="));
  assert.ok(link.includes("Zeile%201%0D%0AZeile%202"));
});

test("Kalendereintrag: ganztägig am Fristtag mit Erinnerung", () => {
  const ics = kalenderEintrag({ id: "x", frist: "2026-12-31" }, "Zal, Test; SE", new Date("2026-11-20T10:00:00Z"));
  assert.match(ics, /DTSTART;VALUE=DATE:20261231/);
  assert.match(ics, /DTEND;VALUE=DATE:20270101/);
  assert.match(ics, /SUMMARY:Frist Löschantrag: Zal\\, Test\\; SE/);
  assert.match(ics, /BEGIN:VALARM/);
});
