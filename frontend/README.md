# Frontend SmartCovoit

Next.js (App Router, TypeScript, Tailwind). Voir `/docs/README.md` à la
racine du repo pour la vue d'ensemble du projet.

## Développement

```bash
npm install
npm run dev
```

Nécessite `NEXT_PUBLIC_API_URL` dans `.env.local` (cf. `.env.local` déjà
présent en local, pointant vers `http://localhost:8000`).

## Structure

- `app/page.tsx` — création d'un événement
- `app/events/[id]/page.tsx` — inscriptions (conducteur/passager) et
  affichage des tournées calculées
- `lib/api.ts` — seul point d'appel réseau vers le backend
