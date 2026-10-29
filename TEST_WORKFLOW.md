# Scénario de test pratique — Ceinture jaune

1. Ouvrez BUDO Studio V3, puis **Candidats → Importer Excel**.
2. Choisissez `Exemple_Excel_TEST.xlsx` (3 personnes de test ; la ligne n°1 reprend le diplôme fourni).
3. Vérifiez **أصفر / 9ème Kyu**, la naissance, la date du grade, puis décochez la troisième personne.
4. Confirmez : la table doit contenir **2 candidats**, tous deux cochés.
5. Entrez `26361` dans « Numérotation à partir de » puis cliquez « Numéroter la sélection » : les numéros doivent être 26361 et 26362.
6. Ouvrez **Éditeur de diplôme**, sélectionnez le jaune, puis « Nouvelle zone ». Créez une zone fixe `تونس`, placez-la sur la ligne « تونس في » et ajustez sa typographie.
7. Passez à une autre ceinture : cette zone personnalisée ne doit **pas** y être présente. Revenez au jaune : elle doit être retrouvée.
8. Retournez dans **Candidats**, décochez la deuxième personne, puis cliquez « Générer les certificats sélectionnés ».
9. Le panneau doit annoncer **1 certificat**, nom du candidat et ceinture. Exportez **PDF multipage** et vérifiez visuellement l'alignement.
10. Recommencez avec les deux personnes, choisissez « ZIP par ceinture » (un PDF multipage) ou « ZIP individuel » (deux PDF distincts).

**À noter :** le modèle XLSX original fourni sans noms n'importe aucun candidat, ce qui est le comportement attendu.
