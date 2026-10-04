# Phase 2 : socle SaaS

Statut : **terminée et testée en local.** En attente de votre validation.

## 1. Ce qui est en place

| Brique | Détail |
|---|---|
| **Comptes** | Inscription par email avec confirmation, connexion, mot de passe oublié et réinitialisation, déconnexion. Google prêt : il s'active dès que le fournisseur est configuré dans Supabase. Mot de passe de 10 caractères minimum, avec majuscules, minuscules et chiffres. |
| **Espaces utilisateurs** | Tableau de bord par utilisateur : vidéos, progression **en temps réel** (Supabase Realtime, filtré par la RLS), clips à relire, consommation du mois. Zone `/app` protégée : sans session, redirection vers la connexion. |
| **Isolation (RLS)** | Toutes les tables ont la RLS activée **et forcée**. Les lectures de l'app passent par la session de l'utilisateur. Les fichiers ne sont signés que pour des lignes que l'utilisateur a le droit de voir. Les clés de stockage sont préfixées par l'identifiant de l'utilisateur. |
| **Déclaration de droits** | Table `rights_declarations` : utilisateur, date, contenu, texte exact certifié (versionné), IP et navigateur. Elle est obligatoire à chaque ajout de vidéo. |
| **Plans et quotas** | Table `plans` (Gratuit 30 min, Créateur 300, Pro 1 000, Studio 3 000, avec une durée maximale par vidéo). Les minutes sont réservées de façon atomique au début du traitement et rendues si celui-ci échoue. Une vidéo qui dépasse le quota est arrêtée avec un message clair. |
| **Limites anti-abus** | 3 traitements simultanés et 20 vidéos par jour au maximum par utilisateur. |
| **Admin interne** | `/admin`, réservé aux comptes `is_admin` (attribuable uniquement côté serveur). Coût total, minutes traitées et coût moyen par minute du mois ; traitements en échec avec étape, nombre de tentatives et erreur ; coût par traitement ; utilisateurs avec plan, minutes et nombre de vidéos. |
| **Coûts** | Visibles uniquement par les admins. Les utilisateurs ne les voient pas. |

## 2. Preuves

| Vérification | Résultat |
|---|---|
| Tests base de données (pgTAP) : RLS partout ; A ne lit ni ne modifie rien de B ; impossible de se donner un plan, le rôle admin ou des minutes ; logique de quota | **47/47** |
| Tests d'intégration avec 2 vrais comptes (JWT réels via l'API Supabase), sur les 8 tables : A ne voit, ne modifie et ne crée rien chez B ; un visiteur anonyme ne voit rien | **14/14** |
| Parcours complet dans un vrai navigateur | OK, détail ci-dessous |
| Tests unitaires workers et web (dont réservation et remboursement des minutes) | 24/24 et 12/12 |
| Build de production, typecheck, lint | OK |

Détail du parcours navigateur :
- inscription, email de confirmation reçu dans la boîte locale, clic sur le lien, arrivée sur le tableau de bord ;
- upload, traitement, clip prêt ;
- B ouvre l'URL du traitement de A : « introuvable », et l'API répond 404 ;
- B ouvre `/admin` : 404 ;
- mot de passe oublié, email reçu, nouveau mot de passe, reconnexion ;
- mise à jour du tableau de bord **en direct**, sans recharger la page.

Les deux suites de tests d'isolation tournent automatiquement dans la CI.

Captures dans `docs/phase-2/` :
- `dashboard-vide.png`
- `traitement.png`
- `dashboard.png`
- `admin.png`

## 3. Tester chez vous (local)

`scripts/local-up.sh`, puis http://localhost:3000.
1. Créez un compte. L'email de confirmation arrive dans la boîte locale : http://localhost:54324.
2. Pour accéder à l'admin : `node scripts/make-admin.mjs votre@email`.

## 4. Pour le staging et la production (à faire dans les tableaux de bord)

1. **Supabase > Authentication > URL Configuration** :
   - Site URL : l'URL du site ;
   - Redirect URLs : `https://<votre-domaine>/auth/callback`.
2. **Supabase > Authentication > Providers > Email** :
   - confirmation obligatoire ;
   - mot de passe de 10 caractères minimum, avec majuscules, minuscules et chiffres.
3. **SMTP** : le serveur d'envoi par défaut de Supabase est fortement limité. Il faut configurer Resend ou un équivalent (Authentication > SMTP Settings) avant d'ouvrir le service.
4. **Google** :
   - dans Google Cloud, créez un client OAuth « Application Web » avec comme URI de redirection `https://<ref>.supabase.co/auth/v1/callback` ;
   - collez l'identifiant et le secret dans Supabase > Providers > Google (directement dans le tableau de bord, jamais dans le chat) ;
   - mettez `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` dans Vercel.
5. **Variable à ajouter dans Vercel** : `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clé publique, protégée par la RLS).
6. **Premier admin** : dans l'éditeur SQL de Supabase, exécutez `update public.profiles set is_admin = true where email = '…';`.

## 5. Points d'attention

- La migration de phase 2 **supprime les traitements créés sans compte** pendant la phase 1. Ils ne pouvaient pas être rattachés à un utilisateur ; cela ne concerne que des données de test.
- Les quotas sont **mensuels, par mois calendaire**. En phase 5, ils seront alignés sur la période de facturation Stripe.
- Le plan d'un utilisateur ne se change que côté serveur. Stripe s'en chargera en phase 5.

## 6. Suite

**Phase 3 : ingestion complète.** Import Google Drive et Dropbox, URL YouTube avec détection des blocages et repli sur l'upload, surveillance de chaînes par RSS, reprise d'un upload interrompu.
