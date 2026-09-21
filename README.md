# eJUice Lab

Lokal blandings- og udviklingsdatabase på dansk. Ingen konto, serverdatabase eller runtime-afhængigheder.

## Åbn lokalt

Kør `npm start` og åbn `http://localhost:8080`. ES-moduler og service worker kræver HTTP/HTTPS; åbn ikke index.html direkte som fil.

## GitHub Pages

Upload projektets filer til det ønskede repository. Vælg Settings → Pages → Deploy from a branch → main → /(root). Appens relative adresser understøtter både et projekts understi og eget domæne. Før udskiftning af den gamle app: eksportér det gamle bibliotek. Importér JSON-filen under Mere i den nye app. Den gamle localStorage-nøgle importeres også automatisk ved første start, hvis den er tilgængelig på samme origin.

## Installation

På iPad/iPhone: åbn siden i Safari → Del → Føj til hjemmeskærm. På Android bruges browserens installationsfunktion. Efter første onlineindlæsning fungerer appen offline. Service worker-opdateringer træder i kraft efter lukning af de gamle appfaner.

## Data

IndexedDB og en kortvarig localStorage-nødjournal gemmer ændringer. Gem ekstern JSON-backup under Mere; lokal autosave er ikke synkronisering. Import accepterer appens aktuelle v3-format. Browserens datarydning sletter lokal lagring.

## Beregninger og kontrol

`npm test` tester vægt- og volumenprocenter, gram, dråber, skalering, nikotinmodeller og massebalancen i udviklingssessioner. Se SPECIFICATION.md for den aktuelle specifikation. Beregninger antager additive volumener og den angivne vægtfylde. Nikotinstyrke angives som mg nikotin pr. ml, også for nikotinsalt.

Manuel enhedstest før brug: installér på iOS/Android, genåbn offline, opret en udviklingssession, registrér prøveudtagning og tilsætning, genåbn sessionen og eksportér/importér en sikkerhedskopi. Der er ikke automatisk synkronisering mellem enheder.

`browser-check.mjs` udfører den automatiske browserkontrol med Playwright og installeret Chrome. Start serveren på port 8080 først. Angiv eventuelt `EJUICE_PLAYWRIGHT` til din Playwright-pakke, hvis den ikke er installeret lokalt.
