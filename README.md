# account-cleanup

Hilft dabei, bei vielen Webseiten, auf denen man sich mit seinen E-Mail-Adressen Konten angelegt hat, die eigenen Daten nach EU-Recht löschen zu lassen (DSGVO, vor allem Art. 17 „Recht auf Löschung“).

**Zum Tool:** https://barhnana.github.io/account-cleanup/

Alle Daten (Kontenliste, Löschanträge) bleiben im Browser auf deinem Gerät. Es gibt keinen Server, und nichts wird ins Internet geschickt. Aus einem Passwort-Export werden nur Titel, Webseite und Benutzername übernommen, nie Passwörter. Dieses Tool ersetzt keine Rechtsberatung.

## Claude Code tools

This project has its own copy of my skills and agents from my Home (`barhnana/github-home`). Which version it has is recorded in `.claude/.home.json`.

To get the latest version from the Home, run this from the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\.claude\Update-From-Home.ps1
```

It asks before replacing anything. Skills or agents you add only to this project (with names that are not in the Home) are left alone.

## How to run locally

```
node serve.mjs
```

Then open http://localhost:8000. Tests: `node --test`.
