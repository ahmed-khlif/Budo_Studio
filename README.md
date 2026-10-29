# BUDO Studio V3 — Certificats de ceintures

Application de génération de certificats : import Excel, contrôle des candidats, éditeur visuel de diplômes, personnalisation de zones et export PDF/ZIP côté client. Le socle backend de la migration full-stack se trouve maintenant dans `server/`.

## Démarrer

**Simple :** décompressez le ZIP, ouvrez `index.html` avec Chrome ou Edge (ou utilisez `Ouvrir_BUDO_Studio.bat` sous Windows). **Conseillé pour un stockage local fiable :** ouvrez le dossier dans VS Code, puis lancez `index.html` avec l'extension **Live Server**. Aucun `npm install` n'est requis.

## Migration full-stack par phases

### Phase 1 — socle API et données

Le serveur Express expose les routes CRUD candidates, les presets de modèles, l'import d'images Cloudinary et les endpoints Gemini pour brainstorming/OCR. Sans variables Supabase, il démarre avec un adaptateur mémoire local afin que l'API puisse être testée immédiatement.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

API de contrôle : `http://localhost:8787/api/health`. Pour activer Supabase, exécutez `supabase/schema.sql`, puis renseignez les variables dans `.env`. Pour activer l'espace privé, mettez `REQUIRE_AUTH=true` côté serveur et `VITE_REQUIRE_AUTH=true` dans `frontend/.env`; le formulaire React utilise Supabase Auth et l'API vérifie le JWT. Les exports PDF/ZIP restent volontairement dans le navigateur et ne sont jamais envoyés à l'API.

Le guide de configuration des services est dans [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md).

### Phase 2 — espace React

Le nouvel espace React est dans `frontend/`. Il fonctionne avec l'API de Phase 1 et comprend la gestion CRUD, l'aperçu d'import `.xlsx`/`.csv` avec mapping des colonnes, l'OCR Gemini avec validation avant sauvegarde, les presets, l'upload Cloudinary et un thème clair/sombre.

```powershell
npm run frontend:dev
```

Ouvrez `http://localhost:5181/` (le port `5173` peut être occupé par une autre version du prototype). Après `npm run build:full`, la version React est aussi servie par l'API à `http://localhost:8787/workspace/`.

### Phase 3 — éditeur React et export privé

L'onglet **Certificate editor** est maintenant un éditeur React complet pour les zones de texte : déplacement direct, position, taille, rotation, couleur, police, alignement, visibilité, texte fixe ou champ candidat. Les configurations complètes sont enregistrables comme presets API. Le fond peut venir de Cloudinary ou du fond local existant.

Les boutons d'export construisent le PDF image et le ZIP directement dans le navigateur. Aucun fichier final n'est envoyé à Express, Supabase, Cloudinary ou Gemini.

### Phases suivantes

1. React/Vite : shell applicatif, gestion candidats branchée sur l'API et abonnement Supabase Realtime.
2. Import contrôlé : aperçu visuel, mapping des colonnes Excel, corrections et confirmation avant sauvegarde.
3. Éditeur React : thèmes, presets persistants, fonds Cloudinary et zones éditables.
4. IA : OCR image Gemini avec prévisualisation modifiable, brainstorming de layouts et validation manuelle avant insertion.
5. Authentification optionnelle Supabase, permissions workspace, tests et déploiement.

## Workflow recommandé

1. **Vue générale → Importer Excel**, ou **Candidats → Importer Excel**.
2. Dans la fenêtre de **prévisualisation**, vérifiez la feuille, choisissez la couleur de ceinture par groupe, éditez les cellules si besoin et cochez seulement les personnes à importer.
3. **Confirmer l'importation**. La table Candidats permet recherche, filtres ceinture/état, tri, pagination et cases de sélection individuelles/collectives.
4. Renseignez le premier numéro officiel et cliquez **Numéroter la sélection**. Il n'est attribué qu'aux candidats cochés ; les numéros déjà utilisés ailleurs sont évités.
5. **Bibliothèque des modèles** : ajoutez le fond vierge approprié pour chaque ceinture. Le fond jaune fourni est déjà chargé ; les dix autres modèles ne sont pas inventés.
6. **Éditeur de diplôme** : choisissez la ceinture, cliquez sur une zone pour la sélectionner ou **Nouvelle zone** / double-clic sur le certificat pour en ajouter une. Déplacez-la par glisser-déposer, utilisez les poignées pour la redimensionner et les flèches pour déplacer par incréments. Ajustez police, taille, graisse, italique, soulignement, espacement, direction, opacité, couleur, position et rotation.
7. **Exporter les diplômes** : sélectionnez l'étendue (candidats cochés, résultats filtrés, ceinture active ou tous), vérifiez la liste puis générez un PDF multipage, un ZIP par ceinture ou un ZIP avec un PDF par candidat.

## Import exact de votre modèle Excel

Fichier `.xlsx` avec les feuilles configurées comme dans `Liste_Candidats_Examen_Kyu_corrige` :

| Adresse | Valeur métier |
|---|---|
| D6 | Couleur / ceinture (si renseignée) |
| C6 | Degré Kyu (si renseigné) |
| B6 | Date d'examen du groupe |
| E6 | Effectif prévu, **pas le nombre de lignes réellement remplies** |
| D13:D… | Nom et prénom |
| B13:B… | Date de naissance |
| A13:A… | Date d'obtention du grade |
| E13:E… | N° de ligne Excel / ordre de liste, **pas le N° officiel de diplôme** |

Le fichier `.xlsx` transmis contient 30 emplacements de candidats, mais aucune identité renseignée : son import affiche **0 candidat**. Pour tester l'application immédiatement, utilisez `Exemple_Excel_TEST.xlsx`. Cet exemple contient le candidat du diplôme jaune fourni et **deux personnes fictives explicitement marquées « مترشح تجريبي »**.

La date de grade manquante reprend la date d'examen, ou la date locale du jour si celle-ci est absente ; le champ est toujours modifiable avant impression.

## Configuration des zones

- Chaque **ceinture** possède son **propre fond** et **son propre tableau de zones**. Modifier la zone du jaune ne modifie pas la zone du vert.
- Une zone peut être **fixe** (`custom`) ou liée à un champ Excel (`name`, `birth`, `obtained`, `examDate`, `serial`, `ordinal`, `belt`, `kyu`, `origin`). Le texte fixe est le même sur les certificats de cette ceinture. Les champs dynamiques sont remplacés par les informations de chaque candidat lors de l'export.
- La zone est déplaçable (drag & drop), redimensionnable par 4 poignées, modifiable via des coordonnées numériques X/Y en points PDF, verrouillable et masquable. Undo/Redo, grille, guides, aimantation et zoom sont disponibles.
- Possibilité de **dupliquer** ou **supprimer** une zone, de copier toute une mise en page depuis une autre ceinture, et d'importer/exporter le **preset JSON** de la ceinture.
- Les réglages sont enregistrés automatiquement dans le `localStorage` du navigateur. Les images de modèles et la police personnalisée, si importée, sont sauvegardées en `IndexedDB` selon les permissions du navigateur.

## Fond de certificat et polices

- Fond jaune fourni : `assets/yellow-blank.png`, image haute résolution issue du PDF vierge fourni, avec logos, tampons et textes fixes conservés visuellement.
- Les autres fonds peuvent être PNG, JPG, WEBP ou PDF. **PDF :** la conversion passe par PDF.js chargé depuis le CDN jsDelivr ; une connexion internet est nécessaire pour cet usage. Pour un usage complètement hors-ligne, importez les fonds en PNG/JPG haute résolution.
- Police par défaut : **Mirza Regular**, chargée en ligne via Google Fonts. Possibilité de charger localement son fichier TTF/OTF depuis l'éditeur. **Aucun fichier de police n'est distribué dans ce ZIP.** Si la police attendue n'est pas chargée, l'export affiche une erreur plutôt que de remplacer silencieusement la police.
- Couleurs par défaut : **rouge `#BD001C`** (nom et numéro) et **bleu `#004AAD`** (dates), toutes modifiables zone par zone.

## Règles d'exactitude

- Les 11 ceintures sont reprises de la liste déroulante du fichier original, dans le même ordre.
- Seule la correspondance **jaune / أصفر = 9ème Kyu** est confirmée par l'exemple fourni. Les autres correspondances ne sont pas déduites.
- L'application **refuse de générer** un certificat si le nom, les dates, la ceinture, le numéro officiel ou le fond du modèle sont manquants, ou si des numéros sont en double.
- L'import ne crée jamais directement des certificats : il y a une confirmation des lignes, puis une validation avant export. Les candidats non cochés ne sont pas inclus si vous utilisez la portée « sélectionnés ».

## Limitations transparentes

- Les **éléments fixes** intégrés au fond (logos, cachets, texte du diplôme) sont conservés tels quels, et ne sont pas décomposés en objets éditables. Les zones ajoutées par l'application sont entièrement personnalisables.
- Le PDF exporté contient une image haute résolution par page (y compris le texte), afin de garantir l'apparence à l'impression. Le texte du PDF n'est donc pas sélectionnable ni éditable dans un lecteur PDF.
- L'historique des candidats dépend du stockage local du navigateur : exportez les données sources et les presets importants pour les conserver en dehors du navigateur. Ce n'est pas un système de partage/synchronisation multi-appareils.
- Le rendu final doit être relu avant l'impression en série, surtout après avoir ajouté des zones ou chargé un nouveau modèle. Déplacer une zone manuellement peut évidemment la faire chevaucher une autre.

## Tests fonctionnels effectués

- L'Excel de test à 3 fiches a été lu correctement, puis deux fiches sélectionnées, éditées et confirmées.
- Tri/filtrage des lignes, numérotation sélective `26361`/`26362`, vérification de la prévisualisation d'export.
- Création d'une zone, déplacement réel à la souris, annulation du mouvement, changement de police/style et vérification de l'indépendance des modèles jaune/vert.
- PDF de **1 page**, ZIP **1 PDF de 2 pages** (par couleur), ZIP **2 PDF d'1 page** (par personne), tous relus en PDF après génération.
- Tests réalisés dans un navigateur Chromium automatisé en injectant les ressources locales ; non testés sur toutes les versions de navigateur ou imprimantes physiques.
#   B u d o _ S t u d i o  
 