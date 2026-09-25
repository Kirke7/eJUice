# eJUice Lab

Lokal blandings- og udviklingsdatabase på dansk. Ingen konto, serverdatabase eller runtime-afhængigheder.

## Åbn lokalt

Kør `npm start` og åbn `http://localhost:8080`. ES-moduler og service worker kræver HTTP/HTTPS; åbn ikke index.html direkte som fil.

## GitHub Pages

Upload projektets filer til det ønskede repository. Vælg Settings → Pages → Deploy from a branch → main → /(root). Appens relative adresser understøtter både et projekts understi og eget domæne. Før udskiftning af den gamle app: eksportér det gamle bibliotek. Importér JSON-filen under Mere i den nye app. Ældre data flyttes ikke automatisk; behold sikkerhedskopien, til importen er kontrolleret.

## Installation

På iPad/iPhone: åbn siden i Safari → Del → Føj til hjemmeskærm. På Android bruges browserens installationsfunktion. Efter første onlineindlæsning fungerer appen offline. Service worker-opdateringer træder i kraft efter lukning af de gamle appfaner.

## Data

IndexedDB gemmer ændringer; en kortvarig localStorage-journal er et ekstra sikkerhedsnet og må ikke blokere gemning. Gem jævnligt en ekstern JSON-backup under Mere; appen viser, når biblioteket er ændret siden sidste eksportforsøg. Lokal autosave er ikke synkronisering.

Import accepterer appens v3-format og viser antal blandinger, ingredienser og sessioner, før du godkender overskrivning. Appen gemmer automatisk en intern kopi af det nuværende bibliotek før import, som kan gendannes under Mere. Denne kopi ligger på samme enhed og erstatter **ikke** en eksporteret sikkerhedskopi: browserens datarydning sletter begge.

## Beregninger og kontrol

`npm test` tester vægt- og volumenprocenter, gram, dråber, skalering, nikotinmodeller, massebalancen i udviklingssessioner, importkontrol og lokal lagring. Se SPECIFICATION.md for den aktuelle specifikation. Beregninger antager additive volumener og den angivne vægtfylde. Nikotinstyrke angives som mg nikotin pr. ml, også for nikotinsalt. En udviklingssession kan kun blive til en ny opskrift, hvis resultatet kan gengives præcist med den aktuelle ingrediensdatabase og én-base-modellen.

Blandinger kan duplikeres til videreudvikling. Lav batch viser den skalerede beregning og kan udskrive en batch-seddel/PDF; Mere kan udskrive hele blandingsbiblioteket.

Manuel enhedstest før brug: installér på iOS/Android, genåbn offline, opret en udviklingssession, registrér prøveudtagning og tilsætning, genåbn sessionen og eksportér/importér en sikkerhedskopi. Der er ikke automatisk synkronisering mellem enheder.

`browser-check.mjs` udfører den automatiske browserkontrol med Playwright og installeret Chrome. Start serveren på port 8080 først. Angiv eventuelt `EJUICE_PLAYWRIGHT` til din Playwright-pakke, hvis den ikke er installeret lokalt.
