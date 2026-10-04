# Maquettes décrites en texte (skills `imagegen-frontend-web` et `image-to-code`)

> Faute de générateur d'images, chaque section et chaque écran sont spécifiés ici avant d'être codés. Le code suit ces descriptions.

## Lecture du brief (`design-taste-frontend`, section 0.B)

« Lecture : landing SaaS et application pour créateurs vidéo francophones, avec un langage d'outil précis et chaleureux, orienté Tailwind v4, Motion, Phosphor, Bricolage Grotesque et Geist. »

Réglages :

| Zone | VARIANCE | MOTION | DENSITY |
|---|---|---|---|
| Landing | 7 | 5 | 4 |
| Application | 4 | 3 | 6 |

L'application est une interface produit. Le skill se déclare hors périmètre pour ce cas ; j'y applique ses règles de couleur, de typographie, d'états et d'accessibilité, sans ses effets de mise en scène.

Choix globaux :
- **Thème** : clair et sombre suivant le système.
- **Héro** : moyen, éditorial.
- **Fil narratif** : « la pépite », c'est-à-dire chercher, trouver, tailler.
- **Moment de seconde lecture** : un score géant « 87 » en chiffres mono dans la section Score.
- **Composants signature** :
  - lecteur vertical avec sous-titres animés ;
  - timeline de scores ;
  - grille bento ;
  - questions-réponses en accordéon.

## Landing (8 sections, 2 sous-titres en petites capitales au maximum)

1. **Héro.**
   - Composition : texte à gauche sur 5 colonnes, visuel à droite sur 7 colonnes, avec un léger décalage vers le haut pour casser la symétrie.
   - Fond uni papier.
   - Titre : « Vos vidéos longues cachent des pépites. » (2 lignes).
   - Sous-titre : « Pépite repère les meilleurs moments, les recadre en vertical et les sous-titre. Prêts pour TikTok et Shorts. » (18 mots).
   - Boutons : « Essayer gratuitement » (or, pilule) et « Voir les tarifs » (lien souligné).
   - Visuel : un **vrai composant**. Un téléphone 9:16 avec une photo, des sous-titres mot à mot animés en style Impact, le mot actif en or, et un score « 87 » dans une pastille.
2. **Démonstration avant / après.**
   - Composition pleine largeur, fond « surface ».
   - À gauche, une image 16:9 (la vidéo longue) avec sa timeline de segments colorés selon le score.
   - Au centre, une flèche.
   - À droite, 3 clips 9:16 recadrés à partir de la même image, avec leur score.
   - Titre : « Une heure de vidéo. Trois clips. Zéro montage. »
3. **Fonctionnement.**
   - Trois colonnes inégales (5/4/3) séparées par des filets, sans cartes.
   - Verbes : « Ajoutez », « Relisez », « Publiez », chacun avec une phrase de 15 mots maximum.
4. **Bento des fonctionnalités** (5 cellules, 5 contenus) :
   - recadrage sur le visage (grande cellule avec image) ;
   - 3 styles de sous-titres (cellule or pâle avec un aperçu de texte réel) ;
   - import YouTube, Drive et Dropbox ;
   - surveillance de chaînes ;
   - publication YouTube et TikTok (cellule sombre).
5. **Score (moment de seconde lecture).**
   - Composition décentrée.
   - Le chiffre « 87 » en mono très grand à gauche.
   - À droite, les 4 critères (accroche, autonomie, intensité, chute), chacun avec un nombre et une phrase. Pas de barres de progression.
   - Titre : « Chaque clip est noté. Et expliqué. »
6. **Tarifs.**
   - 4 colonnes, le plan Créateur mis en avant (bordure or).
   - Prix, minutes, durée par vidéo, 3 lignes de fonctionnalités, un bouton.
   - Ce sont les vraies valeurs de la table `plans`.
7. **FAQ.** Accordéon natif en `details`, 6 questions : droits sur les vidéos, langues, YouTube bloqué, données, résiliation, qualité.
8. **Appel final et pied de page.**
   - Bandeau encre plein, titre court, un bouton or.
   - Pied de page : logo, liens (Tarifs, Connexion, CGU et Confidentialité, ces deux pages arrivant en phase 7).

## Application

- **Barre de navigation** (64 px) : logo, Tableau de bord, Nouvelle vidéo, Bibliothèque, Chaînes, puis Compte et Admin à droite.
- **Tableau de bord (onboarding)** :
  - sans vidéo : un grand panneau, « Ajoutez votre première vidéo », deux chemins (fichier ou lien), une estimation « 2 minutes » ;
  - avec des vidéos : le quota du mois, « à relire », la liste en temps réel.
- **Nouvelle vidéo** : onglets Fichier ou Lien, choix du style par aperçu visuel des 3 styles, déclaration de droits.
- **Vidéo** :
  - progression ;
  - **timeline des segments** sur toute la durée de la source, chaque segment étant un bloc dont l'opacité d'or suit le score ;
  - transcription avec surlignage des passages retenus ;
  - grille des clips, chacun menant à sa revue.
- **Revue du clip** :
  - lecteur 9:16 à gauche ;
  - à droite : score et 4 critères, justification, **poignées de découpe** (début et fin sur une mini timeline de ±30 s, recalées sur les mots), choix du style, accroche, boutons Régénérer, Valider et Rejeter ;
  - métadonnées YouTube et TikTok avec boutons « Copier », puis téléchargement.
- **Bibliothèque** : filtres (statut, style), grille de vignettes, sélection multiple et « Télécharger la sélection ».
- **Compte** :
  - profil et styles par défaut ;
  - plan et consommation ;
  - connexions YouTube et TikTok (« bientôt », phase 6) ;
  - abonnement et factures (« bientôt », phase 5).
