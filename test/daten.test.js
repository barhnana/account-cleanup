import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leereDaten, kontenHinzufuegen, kontoZustandSetzen, kontoEntfernen,
  sicherungErstellen, sicherungLesen,
} from "../src/daten.js";

const A = { titel: "Instagram", adresse: "instagram.com", login: "a@example.org" };
const B = { titel: "Zalando", adresse: "zalando.de", login: "b@example.org" };

test("Neue Konten starten im Zustand Offen", () => {
  const { daten, neu } = kontenHinzufuegen(leereDaten(), [A, B]);
  assert.equal(neu, 2);
  assert.ok(daten.konten.every((k) => k.zustand === "offen" && k.id));
});

test("Ein zweiter Import fügt bekannte Konten nicht doppelt hinzu und behält ihren Zustand", () => {
  let { daten } = kontenHinzufuegen(leereDaten(), [A]);
  daten = kontoZustandSetzen(daten, daten.konten[0].id, "behalten");
  const zweiter = kontenHinzufuegen(daten, [{ ...A, login: "A@Example.org" }, B]);
  assert.equal(zweiter.neu, 1);
  assert.equal(zweiter.schonVorhanden, 1);
  assert.equal(zweiter.daten.konten[0].zustand, "behalten");
});

test("Unbekannte Zustände werden abgelehnt", () => {
  const { daten } = kontenHinzufuegen(leereDaten(), [A]);
  assert.throws(() => kontoZustandSetzen(daten, daten.konten[0].id, "kaputt"));
});

test("Ein Konto kann entfernt werden", () => {
  const { daten } = kontenHinzufuegen(leereDaten(), [A, B]);
  assert.equal(kontoEntfernen(daten, daten.konten[0].id).konten.length, 1);
});

test("Eine Sicherung enthält alle Daten und lässt sich wieder öffnen", () => {
  const { daten } = kontenHinzufuegen(leereDaten(), [A, B]);
  const zurueck = sicherungLesen(sicherungErstellen(daten));
  assert.deepEqual(zurueck, daten);
});

test("Fremde Dateien werden als Sicherung abgelehnt", () => {
  assert.throws(() => sicherungLesen("kein json"), /keine Sicherung/);
  assert.throws(() => sicherungLesen('{"konten": []}'), /keine Sicherung/);
});
