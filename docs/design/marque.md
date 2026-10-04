# Identité de marque (skill `brandkit`)

> Aucun outil de génération d'images n'est disponible dans cet environnement. La planche 3×3 est donc décrite ici en texte, puis implémentée en code : logo SVG, jetons de couleur, polices.

## Stratégie

| | |
|---|---|
| Catégorie | Outil de montage par IA pour créateurs vidéo (podcasts, interviews, formations, vlogs) |
| Public | Créateurs et petites équipes francophones qui publient des formats longs et veulent exister sur TikTok et Shorts sans monteur |
| Promesse | Retrouver les meilleurs moments d'une vidéo longue et les rendre prêts à poster |
| Métaphore | **La pépite** : de l'or caché dans une heure de vidéo, qu'on extrait et qu'on taille |
| Personnalité | Précise, directe, artisanale plutôt que gadget |
| À éviter | Violet « IA », étincelles, robots, promesses chiffrées inventées |

## Nom

**Pépite** (provisoire, en un seul endroit du code : `apps/web/src/lib/brand.ts`).

Alternatives :
- **Rushes** : le terme métier des images brutes ;
- **Tranche** : l'idée de découper.

Le nom de domaine n'est pas vérifié. Je peux le faire si vous le souhaitez.

## Logo

Marque géométrique simple : **un cadre vertical 9:16 aux coins arrondis, dont le coin supérieur droit est taillé en facette**. C'est à la fois l'écran du téléphone (le format du clip) et la pierre taillée (la pépite extraite).
- La facette est remplie de la couleur d'accent.
- Le cadre suit la couleur du texte, ce qui le rend lisible en clair comme en sombre.
- Construction : rectangle 12×20 avec un rayon de 3, coupé par une diagonale de 45° sur 6 unités, et un triangle d'accent dans la découpe.
- Le mot-symbole est en Bricolage Grotesque, graisse 700, avec un approche légèrement resserré.

## Couleurs

Une seule couleur d'accent, verrouillée sur tout le site et l'application.

| Jeton | Clair | Sombre | Usage |
|---|---|---|---|
| `--ink` (texte) | `#121314` | `#EDEDEB` | Texte, cadre du logo |
| `--paper` (fond) | `#FAFAF8` | `#0E0F10` | Fond de page |
| `--surface` | `#FFFFFF` | `#17181A` | Panneaux, champs |
| `--muted` | `#5B5E63` | `#A3A6AB` | Texte secondaire (contraste AA vérifié) |
| `--line` | `#E4E4E0` | `#2A2C2F` | Séparateurs |
| `--gold` (accent) | `#F5B000` | `#F5B000` | Boutons principaux (texte en `--ink`), surlignage du mot prononcé, scores élevés |
| `--gold-soft` | `#FFF3CC` | `#3A2E08` | Fonds de mise en avant |
| `--danger` | `#B42318` | `#F97066` | Erreurs uniquement |

Règles :
- L'or ne sert **jamais** de couleur de texte sur fond clair (contraste insuffisant). Il sert de fond, avec un texte encre.
- La timeline des scores utilise une seule teinte, du gris vers l'or. Pas d'arc-en-ciel.

## Typographie

| Rôle | Police | Pourquoi |
|---|---|---|
| Titres | **Bricolage Grotesque** (600 à 800) | Grotesque expressive et un peu artisanale, cohérente avec « tailler une pierre ». Ni Inter, ni serif. |
| Texte et interface | **Geist** | Neutre et très lisible en petite taille |
| Chiffres (scores, durées, coûts) | **Geist Mono** | Chiffres tabulaires |

## Formes

- Boutons : pilule (arrondi complet).
- Cartes et lecteurs : 16 px.
- Champs : 10 px.

C'est la seule exception documentée à la règle « un seul système d'arrondis ».

## Planche 3×3 (description)

1. **Couverture** : grand logo et mot-symbole sur fond encre, beaucoup d'espace vide.
2. **Construction** : le cadre 9:16 et la diagonale de coupe tracés sur une grille.
3. **Application numérique** : l'en-tête de l'application avec le logo et l'onglet navigateur.
4. **Essence** : « Les meilleurs moments, prêts à poster. »
5. **Couleurs** : encre, papier, or.
6. **Typographie** : spécimen Bricolage Grotesque et Geist.
7. **Application physique** : autocollant pastille du logo sur un étui de téléphone.
8. **Direction d'image** : photos de tournage (micro, studio podcast, éclairage chaud), légèrement désaturées.
9. **Détail système** : un clip vertical avec le sous-titre « Impact », le mot actif en or.

## Accroche

« Les meilleurs moments, prêts à poster. »
