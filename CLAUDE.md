# Project: account-cleanup

## What this project is
A tool that helps a person who has created many accounts with their e-mail addresses on different websites to get their personal data deleted there, based on EU law (GDPR / DSGVO, especially Art. 17 "right to erasure"). The user is the account owner (private person).

Domain terms (German) are defined in `GLOSSARY.md`. Use them in UI text and code. Architecture decisions are in `docs/adr/`.

## Tech
- Static web page: HTML + CSS + plain JavaScript (ES modules), no build step, no server (see ADR 0001).
- Main libraries: none. Ask the user before adding any.
- Must work in mobile Safari on iPhone as well as in desktop browsers.
- Tests: Node's built-in test runner (`node --test`), no extra packages.

## How to run it
Open `index.html` in a browser via a local web server (ES modules don't load from `file://`):
```
node serve.mjs
```
Then open http://localhost:8000.
Later it is published with GitHub Pages.

## How to test it
```
node --test
```

## Project rules
- All personal data stays in the user's browser. Never send it anywhere (no analytics, no external requests with user data).
- Never store, display or send passwords from a password-manager import. Read only title, URL and username.
- UI language is German. Request templates (Löschantrag) exist in German and English.
- Keep logic (parsing, request texts, deadlines) in plain modules without DOM access, so it can be tested with `node --test`.
- The user does not read code: explain changes in plain German, by what they do for the user.
