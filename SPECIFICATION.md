# eJuice Lab — låst specifikation, 18. september 2026

Godkendte skærme: Blandinger, Ingredienser, Udvikling, Mere samt Lav batch. Enkel liste, topfaner og direkte redigering. Lokal PWA på GitHub Pages, uden konto eller server. IndexedDB gemmer bibliotek og kladder; JSON-backup flytter data mellem enheder. Installation/offline kræver første åbning via HTTPS.

Ingredienser: navn, type, producent, købt hos, valgfri webshop-URL, købspris og købt mængde i ml, fri note, PG/VG/ethanol i volumenprocent (sum 100), vægtfylde i g/ml, dråber/ml, nikotin i mg/ml. Standarddensiteter: 1.036 / 1.261 / 0.789. Kategorier: aroma, tilsætning, nikotinbase, neutral base, forblanding. Ingen lagerantal. Ingredienser i eksisterende kladder, afprøvninger eller versioner kan ikke slettes.

Opskrifter: 100 ml som standard, valgfri batch samt 10/30/50/100/200 ml. Dosering i vægtprocent eller g/ml færdig væske. Alle doser skalerer. Flere nikotinbaser kan fordele det ønskede nikotinbidrag med relative andele. Alternativt kan en opskrift beregne styrken fra fyld-op-basens eksisterende nikotinindhold; aromaer og øvrige ingredienser fortynd­er den automatisk. Én fyld-op-base. Endelig PG/VG/ethanol beregnes fra komponenterne. Resultat: gram, ml og omtrentlige dråber under 1 g. Beregningen antager additive volumener.

Autosave ved hvert input og 20 vedvarende undo/redo-trin pr. kladde. Input grupperes til ét undo-trin pr. redigeret felt. Manuel Gem afprøvning opretter et testpunkt med opskrift, dato, modningsdage, noter og seks valgfrie karakterer 1–5. Gem som ny version opretter permanent version og giver mulighed for oprydning af afprøvninger. Gendan historik opretter en redigerbar kladde og bevarer historikken. Historiske ingrediensdata ændres aldrig af bibliotekets senere rettelser. Lav batch opretter ingen historik.

Backup-format v3 indeholder ingredienser, blandinger og standarder. Import valideres før skrivning og erstatter den lokale database. Nulstilling kræver eksplicit bekræftelse. Appopdateringer sletter ikke brugerdata.

Forblandinger kan fremstilles fra en opskrift og gemmes som ingrediens med beregnet bærer, styrke, densitet og bevaret fremstillingsopskrift.

Implementering: ES-moduler uden runtime-afhængigheder, separat ren beregningsmotor og tests, IndexedDB-transaktioner, lokal nødjournal ved input, manifest og service worker. Offlinelagring er ikke en ekstern sikkerhedskopi: browserens sletning af webstedsdata fjerner lokale data.
