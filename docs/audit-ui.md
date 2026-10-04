# Audit UI et UX complet (après la phase 4)

Méthode : relecture de chaque écran et de chaque état (vide, chargement, erreur, verrouillé), en clair, en sombre et sur mobile (390 px). Contrôle avec les règles de design de la marque (`design/marque.md`), la check-list anti « design générique » et les Web Interface Guidelines de Vercel. Le parcours complet a été rejoué dans un vrai navigateur après les corrections. Captures dans `docs/audit-ui/`.

## Corrigé

**Navigation**
- Mobile : barre d'onglets en bas d'écran (Tableau de bord, Nouvelle vidéo, Bibliothèque, Chaînes). Avant, deux entrées étaient cachées hors écran sans indice visuel.
- Bug trouvé sur les captures : la barre s'affichait en haut, car l'effet de flou de l'en-tête capturait son positionnement. Corrigé, et le test vérifie maintenant qu'elle est collée en bas.
- La page courante est indiquée partout (onglet actif, `aria-current`).

**États manquants**
- Page « introuvable », pages d'erreur avec « Réessayer » (l'application garde sa navigation) et page d'erreur de dernier recours, toutes en français. Avant, c'était l'écran Next.js par défaut, en anglais.
- Squelettes de chargement à la forme des écrans : tableau de bord, bibliothèque, revue d'un clip.
- Chaînes sur un plan qui ne les inclut pas : un encadré explique le plan requis, avec un bouton « Voir les plans », au lieu d'une page presque vide.

**Formulaires**
- Nouvelle vidéo : zone de dépôt par glisser-déposer, avec le nom et la taille du fichier choisi.
- Style des sous-titres : aperçus visuels au lieu d'une liste déroulante, sur les trois écrans où on le choisit (nouvelle vidéo, revue, compte).
- Connexion et inscription :
  - bouton pour afficher le mot de passe ;
  - pas de correction automatique ni de majuscule automatique sur l'email (gênant sur mobile) ;
  - bouton qui indique l'envoi en cours.
- Bordure des champs trop pâle (1,2:1). Un nouveau jeton `control` l'amène au-dessus de 3:1 en clair comme en sombre.

**Écran vidéo**
- Ajout du titre principal de la page, qui manquait.
- Étapes affichées avec icônes : terminée, en cours, à venir, échec. L'étape « Récupération » apparaît pour les imports par lien ; elle n'avait même pas de libellé.
- Les lecteurs d'écran n'annoncent plus le pourcentage toutes les quelques secondes, seulement le changement de statut.

**Cohérence visuelle**
- Tous les boutons en pilule, conformément à la règle de la marque (les écrans Chaînes et la liste des vidéos avaient des coins carrés).
- Titres de section dans le même style partout, y compris l'admin. Plus aucune couleur hors des jetons de la marque.
- Liste des vidéos : noms longs tronqués proprement, survol visible.
- Liens externes (YouTube) signalés comme s'ouvrant dans un nouvel onglet.

**Landing**
- Bouton pause sur l'animation du téléphone (règle d'accessibilité au-delà de 5 s de mouvement).
- Case « Veille de chaîne » complétée.
- Logo TikTok à la place d'une icône de ciseaux sans rapport.
- Promesses de la FAQ vérifiées dans la configuration réelle : sources supprimées après 7 jours, clips après 90 jours, fichiers jusqu'à 5 Go.

## Vérifié, conforme

- Aucun tiret cadratin, un seul accent (or), une seule échelle d'arrondis, aucun sur-titre décoratif.
- Contrastes du texte : de 5,1:1 à 17,8:1, en clair comme en sombre.
- Clavier :
  - le lien d'évitement est le premier arrêt ;
  - le contour de focus est visible partout, y compris sur les cartes de style ;
  - les curseurs de découpe sont annoncés en minutes et secondes.
- Mobile : aucun défilement horizontal. Les animations sont coupées si l'utilisateur l'a demandé au système.

## Reste à faire, hors de cet audit

- Photos de la landing : ce sont des images d'exemple, à remplacer par vos visuels.
- Textes de la landing en anglais : à adapter lors de l'ouverture de l'anglais.
- Pages légales (CGU, confidentialité, retrait de contenu) : phase 7, le pied de page l'indique.
