# Reine Browser-Anwendung, alle Daten bleiben auf dem Gerät des Nutzers

Das Tool ist eine statische Web-Seite (HTML + JavaScript) ohne eigenen Server. Sie kann lokal geöffnet oder kostenlos (z. B. über GitHub Pages) veröffentlicht werden. Kontenliste, Löschanträge und der Passwort-Manager-Import werden ausschließlich im Browser des Nutzers verarbeitet und gespeichert; nichts wird an einen Server geschickt. So können auch Freunde ohne Programmierkenntnisse das Tool über einen Link nutzen, ohne einem Betreiber ihre Kontenliste oder Passwort-Exporte anzuvertrauen.

## Considered Options

- **Python-Programm im Terminal**: verworfen, weil Freunde Python installieren und Befehle tippen müssten.
- **Web-App mit Server**: verworfen, weil die Kontenliste sehr private Daten enthält und ein Server Betrieb, Kosten und Vertrauen erfordert.

## Consequences

- Löscht der Nutzer seine Browserdaten oder wechselt er das Gerät, sind die Daten weg. Deshalb gibt es eine Sicherung als Datei zum Herunterladen und Wiederöffnen.
- Passwörter aus dem Import werden nie gespeichert; nur Dienst und Login werden übernommen.
- Weil der Passwort-Export typischerweise auf dem Handy entsteht (z. B. iPhone: Einstellungen → Apps → Safari → Exportieren), muss das Tool auch im Handy-Browser laufen und deshalb von Anfang an online stehen. So verlässt die unverschlüsselte Export-Datei das Handy nie; auf andere Geräte wandert nur die passwortfreie Sicherung.
