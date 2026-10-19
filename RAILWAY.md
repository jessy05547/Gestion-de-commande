# Déploiement sur Railway

Le dépôt est préparé pour un seul service web Railway : le conteneur construit l'interface React, Django sert les fichiers statiques et les routes `/api/`, et PostgreSQL stocke les données. En développement, la base MySQL locale et le serveur Vite restent inchangés.

## Créer le projet

1. Créer un projet Railway depuis ce dépôt GitHub et utiliser la racine du dépôt comme racine du service. Railway détecte le `Dockerfile` à la racine.
2. Ajouter un service **PostgreSQL** au projet.
3. Dans les variables du service web, ajouter :
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}` (adapter `Postgres` au nom réel du service de base).
   - `DJANGO_SECRET_KEY` : une nouvelle clé aléatoire, générée localement avec `python -c "import secrets; print(secrets.token_urlsafe(50))"`.
   - `DJANGO_DEBUG=false`.
   - L'API HTTPS transactionnelle Brevo. Dans Railway, ouvrir **Variables** sur le service web et vérifier les variables :
     - `BREVO_API_KEY` : la clé API Brevo déjà configurée dans Railway.
     - `DJANGO_DEFAULT_FROM_EMAIL` : l'adresse d'expédition vérifiée dans Brevo, par exemple `no-reply@votre-domaine.com`.

   Activer l'envoi transactionnel et vérifier l'adresse ou le domaine d'expédition dans Brevo. En production, `django-anymail` utilise le backend `anymail.backends.brevo.EmailBackend` et son API HTTPS ; aucun identifiant ou port SMTP n'est requis. Si `DJANGO_EMAIL_BACKEND` pointe encore vers le backend SMTP, supprimer cette variable pour laisser le backend Brevo par défaut s'appliquer. La clé API reste une variable Railway confidentielle et ne doit jamais être copiée dans le dépôt ni préfixée par `VITE_`.
4. Dans les paramètres de déploiement du service web, définir la commande **Pre-deploy** à `python backend/config/manage.py migrate --noinput`. Elle applique les migrations à PostgreSQL avant le démarrage du nouveau conteneur.
5. Configurer le contrôle de santé sur `/health/`, générer un domaine public Railway, puis déployer.

`ALLOWED_HOSTS` et `CSRF_TRUSTED_ORIGINS` incluent automatiquement le domaine `*.railway.app` fourni par Railway. Django reconnaît le protocole HTTPS transmis par le proxy Railway, redirige le trafic public HTTP et exempte `/health/` de cette redirection pour laisser fonctionner les sondes internes. Pour utiliser un domaine personnalisé, ajouter son nom à `DJANGO_ALLOWED_HOSTS` (séparé par des virgules) et son origine HTTPS à `CSRF_TRUSTED_ORIGINS`, par exemple `https://app.example.com`.

## Vérifications après déploiement

- Ouvrir `https://<domaine-public>/health/` : la réponse attendue est `{"status": "ok"}`. Ce contrôle vérifie également la connexion à PostgreSQL.
- Ouvrir `https://<domaine-public>/register`, demander un code de vérification et vérifier sa réception avant de terminer l'inscription. En cas d'échec, contrôler les journaux du service Railway, la variable `BREVO_API_KEY` et l'adresse expéditeur vérifiée côté Brevo.
- Ouvrir `https://<domaine-public>/login`, puis vérifier la connexion. L'API est servie sur la même origine sous `/api/`.
- Contrôler les journaux Railway si la compilation Docker, les migrations ou le démarrage échouent. Les erreurs de migration arrêtent le déploiement au lieu de servir une application avec une base incomplète.

## Notes

- Les données MySQL locales ne sont pas copiées automatiquement dans PostgreSQL. Pour conserver des données existantes, exporter puis importer la base séparément avant de basculer les utilisateurs.
- Les fichiers frontaux sont inclus dans l'image Docker et peuvent être reconstruits à chaque déploiement; aucun volume de fichiers statiques n'est requis.
- Ne pas committer de clé secrète, de fichier `.env` ou de sauvegarde de base de données. En production, l'application refuse de démarrer en mode debug désactivé sans `DJANGO_SECRET_KEY`.
- Les réglages PostgreSQL et le service Railway sont à créer dans le tableau de bord Railway; ce dépôt ne contient aucun identifiant ni secret de déploiement.
