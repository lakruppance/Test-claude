# Phase 5 : paiement Stripe, quotas et filigrane

Statut : **terminée et testée en local**, en mode de paiement simulé. Le test avec un vrai compte Stripe (mode test) attend votre compte, voir section 5. En attente de votre validation.

## 1. Vérification de la documentation Stripe

Le site de documentation de Stripe est bloqué par le réseau de mon environnement. J'ai vérifié à la place sur les sources officielles accessibles : les notes de version et les définitions de types de la bibliothèque `stripe` (dépôt `stripe/stripe-node`, registre npm).

- Version utilisée : `stripe` **23.0.0** (publiée le 30 septembre 2026), version d'API **`2026-09-30.endive`**. Node.js 20 minimum.
- Écarts avec ce que l'on trouve souvent dans les exemples, et donc dans ma mémoire, dont j'ai tenu compte :
  - les dates de période d'un abonnement (`current_period_start`, `current_period_end`) ne sont plus sur l'abonnement mais **sur ses éléments** (`items.data[]`) ;
  - une facture ne pointe plus directement vers son abonnement, mais via `parent.subscription_details` ;
  - `payment_method_types` **n'existe plus** pour les sessions Checkout : les moyens de paiement (carte, Apple Pay, SEPA…) s'activent dans le tableau de bord Stripe ;
  - la vérification des signatures de webhook applique maintenant une **tolérance de temps par défaut**, ce qui rejette les rejeux anciens. Un test le vérifie.

## 2. Ce qui est en place

| Élément | Fonctionnement |
|---|---|
| **Paiement** | Page de paiement hébergée par Stripe (Checkout), en français, codes promo acceptés. Aucune donnée de carte ne transite par nos serveurs. |
| **Gestion de l'abonnement** | Portail client Stripe : changer de plan, résilier, moyen de paiement, factures. Montée en gamme immédiate et facturée au prorata ; baisse et résiliation à la fin de la période payée. |
| **Prix** | Retrouvés par leur « clé de recherche » (`pepite_pro_monthly`…) : aucun identifiant de prix à recopier. Prix TTC, comme affichés. Créés par `apps/web/scripts/setup-stripe.mjs`, relançable sans créer de doublons. |
| **Webhook** `/api/stripe/webhook` | Signature vérifiée, chaque événement traité une seule fois, événements arrivés dans le désordre ignorés. Il est le **seul** à pouvoir changer le plan d'un utilisateur. En cas d'erreur, il répond 500 et Stripe réessaie. Il n'est pas soumis au mot de passe du staging (Stripe ne pourrait pas le fournir) : la signature fait office d'authentification. |
| **Statuts** | Actif ou en essai : plan payant. Paiement en échec (`past_due`) : le plan est conservé pendant que Stripe réessaie, avec une alerte dans le compte. Résilié ou impayé : retour au plan Gratuit. |
| **Quotas** | Inchangés : minutes par mois calendaire et durée maximale par vidéo, selon le plan. Un changement de plan s'applique tout de suite. Quand une limite bloque, un lien « Voir les plans » apparaît (envoi refusé, vidéo échouée pour quota ou durée). |
| **Filigrane** | Plan Gratuit : « Fait avec Pépite », en haut à droite, sous l'accroche et loin des sous-titres (voir `phase-5/filigrane.png`). Le texte est réglable (`WATERMARK_TEXT`). Après un passage en plan payant, régénérer un clip retire le filigrane. |
| **Parcours depuis la landing** | « Choisir Pro » mène à l'inscription, puis directement au plan Pro mis en avant dans le compte, puis au paiement. |
| **Mode local** `BILLING_PROVIDER=fake` | Sans compte Stripe : une page de paiement simulée envoie au webhook **les mêmes événements signés** que Stripe, donc le code de production est réellement exercé. Elle est inaccessible hors développement (404), et l'application refuse de démarrer la facturation si ce mode est activé ailleurs. |

**Sécurité**
- Nouvelles tables `subscriptions` et `stripe_events` : RLS activée et forcée.
- Un utilisateur lit son abonnement et rien d'autre.
- Il ne peut modifier ni son plan, ni son client Stripe, ni son abonnement, ni appeler la fonction de synchronisation.
- Les événements Stripe sont illisibles côté client.

## 3. Preuves

| Vérification | Résultat |
|---|---|
| Tests web, dont le webhook : signature valide, contenu altéré, mauvais secret, horodatage trop ancien, événement rejoué, prix inconnu (pas marqué traité, donc Stripe réessaie), client retrouvé sans métadonnées, période lue sur l'élément d'abonnement | **39/39** |
| Tests base de données, dont 15 sur la facturation : seul le webhook change le plan, événements dans le désordre, `past_due` conserve le plan, `unpaid` et `canceled` reviennent au gratuit, isolation | **75/75** |
| Isolation entre 2 vrais comptes, étendue aux abonnements et aux événements Stripe | **18/18** |
| Tests workers, dont le filigrane : présent seulement quand demandé, texte avec « : » et apostrophe correctement échappé | **44/44** |
| Typecheck, lint, build de production | OK |
| Requêtes au webhook sans signature ou avec une fausse signature | refusées (400) |

Parcours navigateur complet, en mode simulé :
1. landing, « Choisir Pro », inscription : l'intention de plan est conservée jusqu'au compte ;
2. plan Gratuit : le clip généré porte le filigrane ;
3. « Passer à Pro », paiement, retour au compte : « Paiement confirmé », renouvellement affiché, la veille de chaînes est débloquée ;
4. régénération d'un clip : plus de filigrane ;
5. paiement refusé : alerte, plan conservé ;
6. passage à Studio, puis résiliation en fin de période (« prend fin le… ») ;
7. fin de l'abonnement : retour au plan Gratuit.

Aucune erreur dans la page.

Captures dans `docs/phase-5/`.

## 4. Décision à prendre : la TVA

Les prix affichés sont TTC. Deux options :

| | Option A : prix TTC fixes (actuel) | Option B : Stripe Tax |
|---|---|---|
| Principe | Le prix payé est celui affiché, TVA française incluse. | Stripe calcule la TVA selon le pays du client et émet des factures conformes. |
| Coût | Aucun. | Environ 0,5 % par transaction là où vous êtes immatriculé (à vérifier sur la page tarifs de Stripe Tax). |
| Adapté si | Vous êtes en franchise de TVA, ou vos ventes à l'étranger restent sous le seuil européen de 10 000 € par an. | Vous vendez beaucoup hors de France, à des entreprises (numéro de TVA), ou voulez déléguer la conformité. |
| Bascule | | `STRIPE_AUTOMATIC_TAX=true`, plus l'activation de Stripe Tax dans le tableau de bord. Le code est prêt. |

Je recommande A pour démarrer, et B dès que les ventes hors de France deviennent significatives. À valider avec votre comptable.

## 5. Ce qu'il faut de votre côté (staging)

1. Créer un compte Stripe et rester en **mode test**.
2. Dans GitHub, environnement `staging`, ajouter le secret `STRIPE_SECRET_KEY` avec la clé `sk_test_...`. Le déploiement crée alors les produits, les prix et le réglage du portail.
3. Créer le webhook une fois :
   ```
   cd apps/web
   STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe.mjs --webhook-url https://<votre-staging>/api/stripe/webhook
   ```
   Le secret de signature s'affiche **une seule fois** dans votre terminal. Mettez-le directement dans Vercel comme `STRIPE_WEBHOOK_SECRET`, sans le partager. Ajoutez aussi `STRIPE_SECRET_KEY` et `BILLING_PROVIDER=stripe` dans Vercel.
4. Tester avec la carte de test `4242 4242 4242 4242`, et `4000 0000 0000 0341` pour un paiement refusé.

En local avec un vrai compte de test : mettre `BILLING_PROVIDER=stripe` et la clé de test dans `.env.local`, puis lancer `stripe listen --forward-to localhost:3000/api/stripe/webhook`. La CLI Stripe affiche le secret à mettre dans `STRIPE_WEBHOOK_SECRET`.

## 6. Limites connues

- Pas d'essai gratuit des plans payants : le plan Gratuit en tient lieu. On peut l'ajouter dans Stripe sans changer le code.
- Les e-mails de relance et de facture sont ceux de Stripe, à activer dans le tableau de bord (Paramètres > E-mails clients).
