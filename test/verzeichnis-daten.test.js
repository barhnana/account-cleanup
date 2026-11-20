import { test } from "node:test";
import assert from "node:assert/strict";
import { VERZEICHNIS } from "../src/verzeichnis-daten.js";
import { nachschlagen } from "../src/verzeichnis.js";
import { leereDaten } from "../src/daten.js";

const { verantwortliche, dienste } = VERZEICHNIS;
const istHttps = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };

test("Jeder Verantwortliche ist vollständig und erreichbar", () => {
  const ids = new Set();
  for (const v of verantwortliche) {
    assert.ok(!ids.has(v.id), `doppelte id ${v.id}`);
    ids.add(v.id);
    assert.ok(v.name?.trim(), `${v.id}: Name fehlt`);
    assert.match(v.land ?? "", /^[A-Z]{2}$/, `${v.id}: Land muss ein Ländercode sein`);
    assert.ok(v.email || v.formular, `${v.id}: braucht E-Mail oder Formular`);
    if (v.email) assert.match(v.email, /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i, `${v.id}: E-Mail ungültig`);
    if (v.formular) assert.ok(istHttps(v.formular), `${v.id}: Formular muss https sein`);
    assert.ok(istHttps(v.quelle), `${v.id}: Quelle fehlt`);
  }
});

test("Jeder Dienst gehört zu einem vorhandenen Verantwortlichen und hat saubere Domains", () => {
  const vIds = new Set(verantwortliche.map((v) => v.id));
  const dIds = new Set();
  const domains = new Map();
  for (const d of dienste) {
    assert.ok(!dIds.has(d.id), `doppelte id ${d.id}`);
    dIds.add(d.id);
    assert.ok(vIds.has(d.verantwortlicher), `${d.id}: unbekannter Verantwortlicher ${d.verantwortlicher}`);
    assert.ok(d.domains.length > 0, `${d.id}: keine Domains`);
    for (const dom of d.domains) {
      assert.match(dom, /^(?!www\.)[a-z0-9-]+(\.[a-z0-9-]+)+$/, `${d.id}: Domain ${dom} ungültig`);
      assert.ok(!domains.has(dom), `${dom} steht bei ${domains.get(dom)} und ${d.id}`);
      domains.set(dom, d.id);
    }
    if (d.loeschLink) assert.ok(istHttps(d.loeschLink), `${d.id}: Löschlink muss https sein`);
  }
});

test("Stichproben: typische Login-Adressen werden richtig erkannt", () => {
  const d = leereDaten();
  assert.equal(nachschlagen("accounts.google.com", d).verantwortlicher.id, "google");
  assert.equal(nachschlagen("login.live.com", d).verantwortlicher.id, "microsoft");
  assert.equal(nachschlagen("instagram.com", d).verantwortlicher.id, "meta");
  assert.equal(nachschlagen("amazon.de", d).verantwortlicher.id, "amazon");
});
