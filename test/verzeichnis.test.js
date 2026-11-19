import { test } from "node:test";
import assert from "node:assert/strict";
import { leereDaten, kontenHinzufuegen } from "../src/daten.js";
import {
  nachschlagen, nachVerantwortlichemGruppieren, eigenenVerantwortlichenAnlegen,
  adresseZuordnen, zuordnungAufheben, alleVerantwortlichen,
} from "../src/verzeichnis.js";

// Made-up test Verzeichnis, independent of the real data.
const V = {
  verantwortliche: [
    { id: "meta", name: "Meta Test Ltd", land: "IE", email: null, formular: "https://example.org/form" },
    { id: "zal", name: "Zal Test SE", land: "DE", email: "privacy@example.org", formular: null },
  ],
  dienste: [
    { id: "insta", name: "Instagram", verantwortlicher: "meta", domains: ["instagram.com"], loeschLink: "https://example.org/del" },
    { id: "fb", name: "Facebook", verantwortlicher: "meta", domains: ["facebook.com"] },
    { id: "zal", name: "Zalando", verantwortlicher: "zal", domains: ["zalando.de", "zalando.at"] },
  ],
};

const mitKonten = (...konten) => kontenHinzufuegen(leereDaten(), konten).daten;

test("Bekannte Adressen und Subdomains werden ihrem Verantwortlichen zugeordnet", () => {
  const d = leereDaten();
  assert.equal(nachschlagen("instagram.com", d, V).verantwortlicher.id, "meta");
  assert.equal(nachschlagen("login.instagram.com", d, V).dienst.name, "Instagram");
  assert.equal(nachschlagen("zalando.at", d, V).verantwortlicher.id, "zal");
  assert.equal(nachschlagen("instagram.com", d, V).dienst.loeschLink, "https://example.org/del");
});

test("Ähnlich aussehende fremde Adressen werden NICHT zugeordnet", () => {
  const d = leereDaten();
  assert.equal(nachschlagen("fakeinstagram.com", d, V).verantwortlicher, null);
  assert.equal(nachschlagen("instagram.com.betrug.net", d, V).verantwortlicher, null);
});

test("Konten werden nach Verantwortlichem gruppiert, unbekannte separat", () => {
  const d = mitKonten(
    { adresse: "instagram.com", login: "a@example.org" },
    { adresse: "facebook.com", login: "b@example.org" },
    { adresse: "zalando.de", login: "a@example.org" },
    { adresse: "kleinerladen.de", login: "a@example.org" },
  );
  const { gruppen, unbekannt } = nachVerantwortlichemGruppieren(d, V);
  assert.deepEqual(gruppen.map((g) => [g.verantwortlicher.id, g.konten.length]), [["meta", 2], ["zal", 1]]);
  assert.deepEqual(unbekannt.map((k) => k.adresse), ["kleinerladen.de"]);
});

test("Eigener Verantwortlicher: anlegen, zuordnen, zwei Dienste zusammenlegen", () => {
  let d = mitKonten(
    { adresse: "laden-a.de", login: "a@example.org" },
    { adresse: "laden-b.de", login: "a@example.org" },
  );
  const angelegt = eigenenVerantwortlichenAnlegen(d, { name: "Laden GmbH", email: "datenschutz@example.org" });
  d = adresseZuordnen(angelegt.daten, "laden-a.de", angelegt.id);
  d = adresseZuordnen(d, "laden-b.de", angelegt.id);
  const { gruppen, unbekannt } = nachVerantwortlichemGruppieren(d, V);
  assert.equal(unbekannt.length, 0);
  assert.equal(gruppen.length, 1);
  assert.equal(gruppen[0].verantwortlicher.name, "Laden GmbH");
  assert.equal(gruppen[0].verantwortlicher.land, "DE");
  assert.equal(gruppen[0].konten.length, 2);
});

test("Eine eigene Zuordnung hat Vorrang vor dem Verzeichnis und lässt sich aufheben", () => {
  let d = adresseZuordnen(leereDaten(), "instagram.com", "zal");
  assert.equal(nachschlagen("instagram.com", d, V).verantwortlicher.id, "zal");
  d = zuordnungAufheben(d, "instagram.com");
  assert.equal(nachschlagen("instagram.com", d, V).verantwortlicher.id, "meta");
});

test("Eigener Verantwortlicher braucht Namen und E-Mail oder Formular", () => {
  assert.throws(() => eigenenVerantwortlichenAnlegen(leereDaten(), { name: "", email: "x@example.org" }), /Namen/);
  assert.throws(() => eigenenVerantwortlichenAnlegen(leereDaten(), { name: "X" }), /E-Mail/);
});

test("Auswahlliste enthält mitgelieferte und eigene Verantwortliche", () => {
  const { daten } = eigenenVerantwortlichenAnlegen(leereDaten(), { name: "Laden GmbH", email: "d@example.org" });
  const alle = alleVerantwortlichen(daten, V);
  assert.equal(alle.length, 3);
  assert.equal(alle.at(-1).eigen, true);
});
