# PlannerIA Backend

Backend Node.js/Express pour Life Planner IA.

## Installation

```bash
npm install
```

## Configuration

Créez un fichier `.env` à la racine du backend avec :

```
PORT=4000
MONGO_URI=mongodb://localhost:27017/planneria
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
OPENAI_API_KEY=your-openai-api-key
JWT_SECRET=your-jwt-secret
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

## Lancement

```bash
npm run dev
```

Le serveur démarre sur le port 4000.

