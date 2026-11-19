import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, webAdresse, importiereExport } from "../src/import.js";

const APPLE = [
  "Title,URL,Username,Password,Notes,OTPAuth",
  "instagram.com (a@example.org),https://www.instagram.com/,a@example.org,Geheim123,,",
  "Zalando,https://zalando.de/login,b@example.org,\"pa,ss\"\"wort\",\"Notiz\nmit Umbruch\",",
].join("\r\n");

test("CSV mit Anführungszeichen, Kommas und Zeilenumbrüchen wird richtig gelesen", () => {
  const rows = parseCsv(APPLE);
  assert.equal(rows.length, 3);
  assert.equal(rows[2][3], 'pa,ss"wort');
  assert.equal(rows[2][4], "Notiz\nmit Umbruch");
});

test("Apple-Export: nur Titel, Adresse und Login werden übernommen", () => {
  const { konten } = importiereExport(APPLE);
  assert.deepEqual(konten, [
    { titel: "instagram.com (a@example.org)", adresse: "instagram.com", login: "a@example.org" },
    { titel: "Zalando", adresse: "zalando.de", login: "b@example.org" },
  ]);
});

test("Passwörter und Notizen tauchen nirgends im Ergebnis auf", () => {
  const ergebnis = JSON.stringify(importiereExport(APPLE));
  for (const geheim of ["Geheim123", "pa,ss", "Notiz"]) {
    assert.ok(!ergebnis.includes(geheim), `${geheim} darf nicht übernommen werden`);
  }
});

test("Spaltennamen werden unabhängig von Groß-/Kleinschreibung und Reihenfolge erkannt", () => {
  const text = "Password,Url,USERNAME\nx,example.com,c@example.org";
  assert.deepEqual(importiereExport(text).konten, [
    { titel: "example.com", adresse: "example.com", login: "c@example.org" },
  ]);
});

test("Chrome-, Firefox- und Bitwarden-Exporte werden erkannt", () => {
  const chrome = "name,url,username,password,note\nGitHub,https://github.com/,d@example.org,x,";
  const firefox = 'url,username,password,httpRealm\n"https://github.com","d@example.org","x",';
  const bitwarden = "folder,favorite,type,name,login_uri,login_username,login_password\n,,login,GitHub,https://github.com,d@example.org,x";
  for (const text of [chrome, firefox, bitwarden]) {
    const { konten } = importiereExport(text);
    assert.equal(konten.length, 1);
    assert.equal(konten[0].adresse, "github.com");
    assert.equal(konten[0].login, "d@example.org");
  }
});

test("Doppelte Einträge (gleiche Adresse, gleicher Login) werden zusammengeführt", () => {
  const text = [
    "Title,URL,Username,Password",
    "A,https://www.amazon.de/,E@Example.org,1",
    "B,https://amazon.de/ap/signin,e@example.org,2",
    "C,https://amazon.de/,anderer@example.org,3",
  ].join("\n");
  const { konten } = importiereExport(text);
  assert.equal(konten.length, 2);
});

test("Einträge ohne Webseite oder ohne Login werden übersprungen und gezählt", () => {
  const text = "Title,URL,Username,Password\nWLAN,,,x\nApp,android://abc,f@example.org,x\nOK,ok.de,f@example.org,x";
  const { konten, uebersprungen } = importiereExport(text);
  assert.equal(konten.length, 1);
  assert.equal(uebersprungen, 2);
});

test("Eine falsche Datei gibt eine verständliche Fehlermeldung", () => {
  assert.throws(() => importiereExport("Vorname,Nachname\nMax,Muster"), /Passwort-Export/);
  assert.throws(() => importiereExport(""), /leer/);
});

test("webAdresse entfernt www. und erkennt Adressen ohne https://", () => {
  assert.equal(webAdresse("https://WWW.Example.COM/path?x=1"), "example.com");
  assert.equal(webAdresse("example.com"), "example.com");
  assert.equal(webAdresse(""), "");
});
