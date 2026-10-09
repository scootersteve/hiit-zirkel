# Zirkel Dojo

HIIT- und Zirkeltraining-Timer als Web-App (PWA) fürs iPhone. Kostenlos, ohne Konto, ohne Server. Alle Daten bleiben auf dem eigenen Gerät.

- App: https://scootersteve.github.io/hiit-zirkel/ (noch im Aufbau)
- Ton-Machbarkeitstest: https://scootersteve.github.io/hiit-zirkel/soundtest/

## Entwicklung

Kein Build-Schritt, reine ES-Module. Node (ab v22) nur für Tests und den lokalen Testserver, keine Pakete.

```bash
node tools/serve.js          # http://localhost:8080/hiit-zirkel/
node --test                  # automatische Tests
```

Plan und Entscheidungen: [docs/PLAN.md](docs/PLAN.md)

## Lizenz

Eigener Code: MIT, siehe [LICENSE](LICENSE). Fremde Bestandteile und ihre Lizenzen: THIRD-PARTY-NOTICES.md (folgt mit der Muskelgrafik und der Schrift).
