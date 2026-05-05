# DisChef Web — Site Vitrine (Astro + Cloudflare Pages)

## Memoire du Projet
- **Stack :** Astro 4.16, TypeScript strict, Firebase 11.
- **URL :** https://dischef.fr
- **Deploiement :** Cloudflare Pages (output statique).
- **Objectif :** Landing page de l'app DisChef + pages legales + reset password.

## Architecture

```
src/
├── pages/                 # Pages Astro (file-based routing)
│   ├── index.astro        #   Landing page principale
│   ├── reset-password.astro #  Reset mot de passe (Firebase Auth)
│   ├── cgu.astro          #   Conditions generales d'utilisation
│   ├── confidentialite.astro # Politique de confidentialite
│   ├── mentions-legales.astro # Mentions legales
│   └── 404.astro          #   Page 404
├── components/            # Composants Astro (12)
│   ├── Header.astro       #   Navigation
│   ├── Hero.astro         #   Hero section
│   ├── Features.astro     #   Fonctionnalites
│   ├── HowItWorks.astro   #   Comment ca marche
│   ├── VoiceDemo.astro    #   Demo vocale
│   ├── AntiGaspi.astro    #   Section anti-gaspillage
│   ├── LeChef.astro       #   Presentation du Chef IA
│   ├── SocialProof.astro  #   Temoignages / preuves sociales
│   ├── FAQ.astro          #   Questions frequentes
│   ├── Download.astro     #   Liens de telechargement
│   ├── Newsletter.astro   #   Inscription newsletter
│   └── Footer.astro       #   Pied de page
├── layouts/
│   └── BaseLayout.astro   # Layout principal (meta, fonts, analytics)
├── styles/
│   └── global.css         # Styles globaux
└── env.d.ts               # Types d'environnement

functions/                 # Cloudflare Pages Functions
└── r/[id].js              # Redirect dynamique (partage recettes)

public/                    # Assets statiques (images, icons)
```

## Configuration
- **`astro.config.mjs`** : Output statique, site `https://dischef.fr`, CSS minifie.
- **`.env.example`** : Variables Firebase requises (API key, auth domain, project ID).
- **`.node-version`** : Node 20.
- **Path alias** : `@/*` → `src/*` (tsconfig).

## Commandes

```bash
# Dev local
npm run dev          # astro dev

# Build
npm run build        # astro build (output statique)

# Preview build
npm run preview      # astro preview
```

## Regles
1. Le site est 100% statique (pas de SSR), sauf la Cloudflare Function pour les redirections de partage.
2. La page `reset-password.astro` utilise Firebase Auth cote client — necessite les variables `.env`.
3. Les composants suivent l'ordre de la landing page : Hero → Features → HowItWorks → VoiceDemo → AntiGaspi → LeChef → SocialProof → FAQ → Download → Newsletter → Footer.
4. Le design doit rester coherent avec le design system de l'app mobile (`.context/DESIGN_SYSTEM.md` dans `disChef-mobile/`).
