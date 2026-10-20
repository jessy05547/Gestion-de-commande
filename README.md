# Gestion de commande

Application web permettant aux utilisateurs de gérer leurs commandes, fournisseurs, produits, stocks, factures et paiements. L'interface React et l'API Django sont conçues pour être déployées ensemble.

## Technologies

- Frontend : React, Vite et Axios
- Backend : Django REST Framework et JWT
- Développement local : MySQL
- Hébergement Railway : PostgreSQL

## Développement local

Installer les dépendances du frontend avec `cd frontend; npm ci`, puis démarrer Vite avec `npm run dev`. Le proxy `/api` de Vite transmet les requêtes à Django sur `127.0.0.1:8000`.

Configurer et démarrer Django depuis `backend/config` avec l'environnement Python du projet, puis appliquer les migrations avec `python manage.py migrate`. L'API est disponible sous `/api/`.

En production, les e-mails transactionnels utilisent `django-anymail` avec l'API HTTPS Brevo. Configurer `BREVO_API_KEY` et `DJANGO_DEFAULT_FROM_EMAIL` (adresse vérifiée dans Brevo) dans l'environnement du backend. En développement, Django utilise par défaut le backend console.

La création d'une commande envoie la demande au fournisseur avec un lien de réponse unique valable sept jours. Une confirmation déclenche une notification de paiement; l'enregistrement du mode de paiement crée le paiement, la facture PDF et met à jour le stock. La facture apparaît dans le tableau correspondant et est également jointe à l'e-mail envoyé au fournisseur. Pour les articles hors catalogue, la confirmation les ajoute au catalogue avec un stock initial à zéro.
Lors d'une inscription, un code de vérification à 6 chiffres est envoyé par e-mail. En développement, Django affiche les e-mails dans la console par défaut. En production, `django-anymail` envoie les messages avec l'API HTTPS transactionnelle de Brevo ; définir `BREVO_API_KEY` et `DJANGO_DEFAULT_FROM_EMAIL` (adresse d'expédition vérifiée dans Brevo) dans l'environnement du backend. Le code expire après 10 minutes et cinq essais incorrects au maximum.

## Déploiement

Le Dockerfile à la racine construit le frontend et le sert avec Django. Pour créer le service PostgreSQL, configurer les variables Railway et lancer le premier déploiement, suivre le [guide Railway](./RAILWAY.md).
