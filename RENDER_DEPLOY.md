# Déploiement sur Render — Backend QR Solution

Important: vous avez partagé une chaîne MongoDB contenant des identifiants. Faites immédiatement une rotation du mot de passe MongoDB et créez un nouvel utilisateur/URI pour Render.

1) Pré-requis
- Compte Render connecté à GitHub/GitLab
- Branche `main` contenant le dossier `backend`

2) Fichier d'exemple
- `backend/.env.example` contient les variables attendues (ne mettez pas de secrets dans le repo).

3) Création du service Web sur Render
- Créez un nouveau service type **Web Service**.
- Connectez votre repo, choisissez la branche `main`.
- Si votre repo est monorepo, définissez `Root Directory` sur `backend`.
- Environment: `Node`
- Build command: `npm install`
- Start command: `npm start`
- Branch auto-deploy: active si vous voulez déploiement automatique.

4) Variables d'environnement / Secrets
- Sur Render, ne mettez pas la chaîne MongoDB dans le repo. Créez un **Secret**/Environment Variable nommé `MONGODB_URI` et collez la chaîne de connexion (la valeur fournie par votre admin DB).
- Ajoutez aussi (optionnel): `NODE_ENV=production`, `FRONTEND_URL=https://votre-frontend.example`.
- Render fournit automatiquement la variable `PORT` — l'app utilise `process.env.PORT`.

5) Stockage fichiers (uploads)
- Le dossier `uploads/` dans le service Render est éphémère (conteneur persistant tant que le service tourne, mais pas adapté au stockage permanent ou redéploiements).
- Pour stockage persistant, utilisez un service objet (S3, DigitalOcean Spaces, Backblaze, etc.) et ajoutez ces secrets à Render (par ex. `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`).
- Option: remplacer le middleware d'upload pour envoyer directement sur S3 (ex: `multer-s3`). Je peux préparer un patch si vous voulez.

6) Local — test rapide
- Créez un fichier `.env` local à `backend` (ne pas le committer) contenant:

```
MONGODB_URI=your_connection_string_here
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

- Puis:

```bash
cd backend
npm install
npm start
```

7) Recommandations sécurité
- Révoquez/rototez le mot de passe exposé immédiatement.
- Utilisez un utilisateur MongoDB avec les permissions minimales nécessaires (pas admin global si non requis).
- Activez l'IP whitelisting si possible ou utilisez des VPC peering/privates endpoints.

8) Support
Si vous voulez, je peux:
- a) implémenter l'upload vers S3 et modifier `backend/middleware/upload.js` (patch prêt à l'emploi), ou
- b) préparer des captures d'écran / étapes pas-à-pas dans l'interface Render.

Fichiers ajoutés: `backend/RENDER_DEPLOY.md`, `backend/.env.example`.