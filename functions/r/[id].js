/**
 * Cloudflare Pages Function — /r/:id
 * Renders a shared recipe page with OG meta, deep linking, and Schema.org JSON-LD.
 */

export async function onRequest(context) {
  const id = context.params.id;

  if (!id) {
    return renderError(false);
  }

  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/dischef-prod/databases/(default)/documents/shared_recipes/${id}`;
    const response = await fetch(firestoreUrl);

    if (!response.ok) {
      return renderError(false);
    }

    const data = await response.json();

    if (!data.fields) {
      return renderError(false);
    }

    const recipe = parseFirestoreDoc(data.fields);

    // Check expiration
    if (recipe.expiresAt > 0 && Date.now() > recipe.expiresAt) {
      return renderError(true);
    }

    return renderRecipe(id, recipe);
  } catch (e) {
    return renderError(false);
  }
}

// ──────────────────────────────────────────
// Firestore wire-format parser
// ──────────────────────────────────────────

function parseFirestoreValue(val) {
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.integerValue !== undefined) return Number(val.integerValue);
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.nullValue !== undefined) return null;
  if (val.timestampValue !== undefined) return new Date(val.timestampValue).getTime();
  if (val.arrayValue) {
    return (val.arrayValue.values || []).map(parseFirestoreValue);
  }
  if (val.mapValue) {
    const result = {};
    for (const [key, value] of Object.entries(val.mapValue.fields || {})) {
      result[key] = parseFirestoreValue(value);
    }
    return result;
  }
  return null;
}

function parseFirestoreDoc(fields) {
  const get = (key, fallback) => {
    const val = fields[key];
    if (!val) return fallback;
    const parsed = parseFirestoreValue(val);
    return parsed !== null && parsed !== undefined ? parsed : fallback;
  };

  return {
    title: get('title', 'Recette sans titre'),
    description: get('description', ''),
    prep_time: get('prep_time', ''),
    cook_time: get('cook_time', ''),
    servings: get('servings', 2),
    difficulty: get('difficulty', ''),
    calories_per_serving: get('calories_per_serving', 0),
    ingredients: get('ingredients', []),
    steps: get('steps', []),
    chef_tip: get('chef_tip', ''),
    image_url: get('image_url', null),
    protein: get('protein', null),
    carbs: get('carbs', null),
    fat: get('fat', null),
    expiresAt: get('expiresAt', 0),
    sharedAt: get('sharedAt', 0),
  };
}

// ──────────────────────────────────────────
// HTML helpers
// ──────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

const IOS_STORE = 'https://apps.apple.com/app/dischef/id6739498942';
const ANDROID_STORE = 'https://play.google.com/store/apps/details?id=com.jaco3n4.dischef';

// ──────────────────────────────────────────
// Render recipe page
// ──────────────────────────────────────────

function renderRecipe(id, recipe) {
  const totalTime = [recipe.prep_time, recipe.cook_time].filter(Boolean).join(' + ');
  const ingredientCount = recipe.ingredients?.length || 0;
  const ogDescription = `${esc(recipe.title)} — ${totalTime ? totalTime + ' \u00b7 ' : ''}${ingredientCount} ingredients \u00b7 ${recipe.difficulty}. Decouverte sur DisChef.`;
  const ogImage = recipe.image_url || 'https://dischef.fr/images/og-default.png';
  const pageTitle = `${esc(recipe.title)} — Recette DisChef`;
  const canonicalUrl = `https://dischef.fr/r/${id}`;

  // Schema.org JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    description: recipe.description || `Recette ${recipe.title} sur DisChef`,
    image: recipe.image_url || undefined,
    prepTime: recipe.prep_time ? `PT${recipe.prep_time.replace(/\D/g, '')}M` : undefined,
    cookTime: recipe.cook_time ? `PT${recipe.cook_time.replace(/\D/g, '')}M` : undefined,
    recipeYield: `${recipe.servings} portions`,
    recipeIngredient: recipe.ingredients,
    recipeInstructions: recipe.steps.map((step, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      text: step,
    })),
    nutrition: recipe.calories_per_serving > 0 ? {
      '@type': 'NutritionInformation',
      calories: `${recipe.calories_per_serving} calories`,
      ...(recipe.protein ? { proteinContent: `${recipe.protein}g` } : {}),
      ...(recipe.carbs ? { carbohydrateContent: `${recipe.carbs}g` } : {}),
      ...(recipe.fat ? { fatContent: `${recipe.fat}g` } : {}),
    } : undefined,
    author: {
      '@type': 'Organization',
      name: 'DisChef',
      url: 'https://dischef.fr',
    },
  };

  // Build badges HTML
  let badgesHtml = '';
  if (totalTime) {
    badgesHtml += `
      <div class="recipe-badge">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>${esc(totalTime)}</span>
      </div>`;
  }
  if (recipe.difficulty) {
    badgesHtml += `
      <div class="recipe-badge">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span>${esc(recipe.difficulty)}</span>
      </div>`;
  }
  if (recipe.calories_per_serving > 0) {
    badgesHtml += `
      <div class="recipe-badge">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
        <span>${recipe.calories_per_serving} kcal</span>
      </div>`;
  }
  if (recipe.servings > 0) {
    badgesHtml += `
      <div class="recipe-badge">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>${recipe.servings} ${recipe.servings > 1 ? 'portions' : 'portion'}</span>
      </div>`;
  }

  // Build ingredients HTML
  let ingredientsHtml = '';
  if (recipe.ingredients.length > 0) {
    const items = recipe.ingredients.map(ing =>
      `<li class="ingredient-item"><span class="ingredient-dot"></span><span>${esc(ing)}</span></li>`
    ).join('');
    ingredientsHtml = `
      <section class="recipe-section">
        <h2 class="recipe-section-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/></svg>
          Ingredients
        </h2>
        <ul class="ingredients-list">${items}</ul>
      </section>`;
  }

  // Build steps HTML
  let stepsHtml = '';
  if (recipe.steps.length > 0) {
    const items = recipe.steps.map((step, i) =>
      `<li class="step-item"><div class="step-number">${i + 1}</div><p class="step-text">${esc(step)}</p></li>`
    ).join('');
    stepsHtml = `
      <section class="recipe-section">
        <h2 class="recipe-section-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          Preparation
        </h2>
        <ol class="steps-list">${items}</ol>
      </section>`;
  }

  // Build chef tip HTML
  let chefTipHtml = '';
  if (recipe.chef_tip) {
    chefTipHtml = `
      <section class="recipe-section">
        <div class="chef-tip-card">
          <div class="chef-tip-header">
            <span class="chef-tip-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="10" y1="22" x2="14" y2="22"/></svg>
            </span>
            <h3>Le conseil du Chef</h3>
          </div>
          <p class="chef-tip-text">${esc(recipe.chef_tip)}</p>
        </div>
      </section>`;
  }

  // Build macros HTML
  let macrosHtml = '';
  if (recipe.protein || recipe.carbs || recipe.fat) {
    let macroCards = '';
    if (recipe.protein !== null) {
      macroCards += `<div class="macro-card"><span class="macro-value">${recipe.protein}g</span><span class="macro-label">Proteines</span></div>`;
    }
    if (recipe.carbs !== null) {
      macroCards += `<div class="macro-card"><span class="macro-value">${recipe.carbs}g</span><span class="macro-label">Glucides</span></div>`;
    }
    if (recipe.fat !== null) {
      macroCards += `<div class="macro-card"><span class="macro-value">${recipe.fat}g</span><span class="macro-label">Lipides</span></div>`;
    }
    macrosHtml = `
      <section class="recipe-section">
        <h2 class="recipe-section-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          Valeurs nutritionnelles
        </h2>
        <div class="macros-grid">${macroCards}</div>
      </section>`;
  }

  // Hero image HTML
  let heroHtml = '';
  if (recipe.image_url) {
    heroHtml = `
      <div class="recipe-hero">
        <img src="${esc(recipe.image_url)}" alt="${esc(recipe.title)}" class="recipe-hero-img" loading="eager" />
        <div class="recipe-hero-overlay"></div>
      </div>`;
  }

  // Description HTML
  let descriptionHtml = '';
  if (recipe.description) {
    descriptionHtml = `<p class="recipe-description">${esc(recipe.description)}</p>`;
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${pageTitle}</title>
  <meta name="description" content="${esc(ogDescription)}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${pageTitle}" />
  <meta property="og:description" content="${esc(ogDescription)}" />
  <meta property="og:image" content="${esc(ogImage)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:site_name" content="DisChef" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${pageTitle}" />
  <meta name="twitter:description" content="${esc(ogDescription)}" />
  <meta name="twitter:image" content="${esc(ogImage)}" />

  <!-- Deep Linking -->
  <meta property="al:ios:url" content="dischef://recipe/${esc(id)}" />
  <meta property="al:ios:app_store_id" content="6739498942" />
  <meta property="al:ios:app_name" content="DisChef" />
  <meta property="al:android:url" content="dischef://recipe/${esc(id)}" />
  <meta property="al:android:package" content="com.jaco3n4.dischef" />
  <meta property="al:android:app_name" content="DisChef" />

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

  <style>${CSS_RECIPE}</style>
</head>
<body>
  <div class="recipe-page">
    <!-- Smart App Banner -->
    <div class="app-banner">
      <div class="app-banner-inner">
        <a href="https://dischef.fr" class="app-banner-brand">
          <img src="/images/logo.svg" alt="DisChef" width="40" height="40" />
          <div class="app-banner-text">
            <span class="app-banner-name">DisChef</span>
            <span class="app-banner-tagline">Votre frigo a du talent.</span>
          </div>
        </a>
        <a href="${IOS_STORE}" class="btn btn-primary btn-small app-banner-btn" id="banner-cta">Decouvrir DisChef</a>
      </div>
    </div>

    ${heroHtml}

    <div class="recipe-container">
      <article class="recipe-content${!recipe.image_url ? ' no-hero' : ''}">
        <header class="recipe-header">
          <h1 class="recipe-title">${esc(recipe.title)}</h1>
          ${descriptionHtml}
        </header>

        <div class="recipe-badges">${badgesHtml}</div>
        <div class="recipe-divider"></div>

        ${ingredientsHtml}
        ${stepsHtml}
        ${chefTipHtml}
        ${macrosHtml}
      </article>

      <!-- Footer CTA -->
      <div class="recipe-cta">
        <div class="recipe-cta-card">
          <img src="/images/logo.svg" alt="DisChef" width="48" height="48" class="recipe-cta-logo" />
          <h2 class="recipe-cta-title">Envie de cuisiner avec ce que vous avez ?</h2>
          <p class="recipe-cta-subtitle">Essayez DisChef.</p>
          <p class="recipe-cta-text">DisChef analyse votre frigo et compose des recettes sur mesure. Fini le gaspillage, fini le "qu'est-ce qu'on mange ?".</p>
          <div class="recipe-cta-buttons">
            <a href="${IOS_STORE}" class="btn btn-primary" id="cta-store-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              Telecharger gratuitement
            </a>
          </div>
          <p class="recipe-cta-free">Gratuit — Pas de carte bancaire requise</p>
        </div>
      </div>

      <!-- Mini Footer -->
      <footer class="recipe-footer">
        <a href="https://dischef.fr" class="recipe-footer-brand">
          <img src="/images/logo.svg" alt="DisChef" width="24" height="24" />
          <span>DisChef</span>
        </a>
        <div class="recipe-footer-links">
          <a href="/mentions-legales">Mentions legales</a>
          <a href="/confidentialite">Confidentialite</a>
        </div>
      </footer>
    </div>
  </div>

  <script>
    // Detect platform and update store links
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    var iosUrl = '${IOS_STORE}';
    var androidUrl = '${ANDROID_STORE}';
    var storeUrl = isIOS ? iosUrl : androidUrl;
    document.querySelectorAll('#banner-cta, #cta-store-btn, #empty-store-btn').forEach(function(el) {
      if (el) el.href = storeUrl;
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
    },
  });
}

// ──────────────────────────────────────────
// Render error page (expired or not found)
// ──────────────────────────────────────────

function renderError(isExpired) {
  const title = isExpired ? 'Cette recette a expire' : 'Recette introuvable';
  const subtitle = isExpired
    ? 'Les liens de partage sont valables 30 jours. Telechargez DisChef pour des recettes illimitees.'
    : 'Ce lien ne mene nulle part. La recette a peut-etre ete supprimee ou le lien est incorrect.';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} — DisChef</title>
  <meta name="description" content="${esc(subtitle)}" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

  <meta property="og:title" content="${esc(title)} — DisChef" />
  <meta property="og:description" content="${esc(subtitle)}" />
  <meta property="og:site_name" content="DisChef" />
  <meta property="og:type" content="website" />

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

  <style>${CSS_RECIPE}</style>
</head>
<body>
  <div class="recipe-page recipe-page-empty">
    <div class="recipe-empty-card">
      <div class="recipe-empty-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <h1 class="recipe-empty-title">${esc(title)}</h1>
      <p class="recipe-empty-text">${esc(subtitle)}</p>
      <div class="recipe-empty-cta">
        <a href="${IOS_STORE}" class="btn btn-primary" id="empty-store-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
          Decouvrir DisChef
        </a>
        <a href="https://dischef.fr" class="btn btn-secondary">Retour a l'accueil</a>
      </div>
    </div>
  </div>

  <script>
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    var storeUrl = isIOS ? '${IOS_STORE}' : '${ANDROID_STORE}';
    var btn = document.getElementById('empty-store-btn');
    if (btn) btn.href = storeUrl;
  </script>
</body>
</html>`;

  return new Response(html, {
    status: isExpired ? 410 : 404,
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}

// ──────────────────────────────────────────
// Inline CSS — Japandi Design (complete)
// ──────────────────────────────────────────

const CSS_RECIPE = `
/* === Reset & Base === */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --frigo-50: #fff7ed;
  --frigo-100: #ffedd5;
  --frigo-200: #fed7aa;
  --frigo-300: #fdba74;
  --frigo-400: #fb923c;
  --frigo-500: #f97316;
  --frigo-600: #ea580c;
  --frigo-700: #c2410c;
  --frigo-800: #9a3412;
  --frigo-900: #7c2d12;
  --slate-50: #f8fafc;
  --slate-100: #f1f5f9;
  --slate-200: #e2e8f0;
  --slate-300: #cbd5e1;
  --slate-400: #94a3b8;
  --slate-500: #64748b;
  --slate-600: #475569;
  --slate-700: #334155;
  --slate-800: #1e293b;
  --slate-900: #0f172a;
}

html { scroll-behavior: smooth; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--slate-800); background: #fff; line-height: 1.6; font-size: 16px; }
img { max-width: 100%; height: auto; display: block; }
a { color: inherit; text-decoration: none; }

/* === Buttons === */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font-family: 'Inter', sans-serif; font-weight: 700; font-size: 1.125rem; border: none; cursor: pointer;
  border-radius: 16px; padding: 16px 32px; transition: all 0.2s ease; text-decoration: none;
}
.btn:active { transform: scale(0.98); }
.btn-primary { background: var(--frigo-500); color: #fff; box-shadow: 0 10px 25px rgba(249,115,22,0.3); }
.btn-primary:hover { background: var(--frigo-400); box-shadow: 0 15px 35px rgba(249,115,22,0.4); transform: translateY(-2px); }
.btn-secondary { background: #fff; color: var(--slate-700); border: 2px solid var(--slate-200); }
.btn-secondary:hover { border-color: var(--frigo-300); color: var(--frigo-600); }
.btn-small { font-size: 0.875rem; padding: 10px 20px; border-radius: 12px; }

/* === Recipe Page === */
.recipe-page { min-height: 100vh; background: var(--slate-50); }

/* === Smart App Banner === */
.app-banner {
  position: sticky; top: 0; z-index: 50;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--slate-100);
}
.app-banner-inner { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; max-width: 720px; margin: 0 auto; }
.app-banner-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
.app-banner-brand img { width: 40px; height: 40px; border-radius: 10px; }
.app-banner-text { display: flex; flex-direction: column; }
.app-banner-name { font-size: 0.9375rem; font-weight: 800; color: var(--slate-900); line-height: 1.2; }
.app-banner-tagline { font-size: 0.75rem; color: var(--slate-500); font-weight: 500; line-height: 1.3; }
.app-banner-btn { padding: 8px 18px; font-size: 0.8125rem; border-radius: 10px; white-space: nowrap; }

/* === Hero Image === */
.recipe-hero { position: relative; width: 100%; max-height: 400px; overflow: hidden; background: var(--slate-200); }
.recipe-hero-img { width: 100%; height: 300px; object-fit: cover; display: block; }
.recipe-hero-overlay { position: absolute; bottom: 0; left: 0; right: 0; height: 80px; background: linear-gradient(transparent, var(--slate-50)); pointer-events: none; }

/* === Container === */
.recipe-container { max-width: 720px; margin: 0 auto; padding: 0 20px 40px; }

/* === Content Card === */
.recipe-content {
  background: #fff; border-radius: 20px; padding: 28px 24px 32px;
  margin-top: -32px; position: relative; z-index: 10;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06);
}
.recipe-content.no-hero { margin-top: 20px; }

/* === Header === */
.recipe-header { margin-bottom: 20px; }
.recipe-title { font-size: clamp(1.5rem, 4vw, 2rem); font-weight: 900; color: var(--slate-900); letter-spacing: -0.02em; line-height: 1.2; margin-bottom: 10px; }
.recipe-description { font-size: 1rem; color: var(--slate-500); line-height: 1.6; }

/* === Badges === */
.recipe-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
.recipe-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: var(--frigo-50); color: var(--frigo-700); border-radius: 100px; font-size: 0.8125rem; font-weight: 600; white-space: nowrap; }
.recipe-badge svg { color: var(--frigo-400); flex-shrink: 0; }

/* === Divider === */
.recipe-divider { width: 40px; height: 3px; background: linear-gradient(135deg, var(--frigo-400), var(--frigo-500)); border-radius: 2px; margin-bottom: 28px; }

/* === Sections === */
.recipe-section { margin-bottom: 32px; }
.recipe-section:last-child { margin-bottom: 0; }
.recipe-section-title { display: flex; align-items: center; gap: 8px; font-size: 1.125rem; font-weight: 800; color: var(--slate-900); letter-spacing: -0.01em; margin-bottom: 16px; }
.recipe-section-title svg { color: var(--frigo-500); flex-shrink: 0; }

/* === Ingredients === */
.ingredients-list { list-style: none; display: flex; flex-direction: column; }
.ingredient-item { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--slate-100); font-size: 0.9375rem; color: var(--slate-700); line-height: 1.5; }
.ingredient-item:last-child { border-bottom: none; }
.ingredient-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--frigo-400); flex-shrink: 0; margin-top: 7px; }

/* === Steps === */
.steps-list { list-style: none; display: flex; flex-direction: column; gap: 20px; }
.step-item { display: flex; gap: 14px; align-items: flex-start; }
.step-number { width: 28px; height: 28px; min-width: 28px; background: var(--frigo-500); color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8125rem; font-weight: 800; margin-top: 1px; }
.step-text { font-size: 0.9375rem; color: var(--slate-600); line-height: 1.7; flex: 1; }

/* === Chef Tip === */
.chef-tip-card { background: linear-gradient(135deg, var(--frigo-50), #fff7ed); border: 1px solid var(--frigo-100); border-radius: 16px; padding: 20px; }
.chef-tip-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.chef-tip-icon { width: 32px; height: 32px; background: var(--frigo-500); color: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.chef-tip-header h3 { font-size: 0.9375rem; font-weight: 800; color: var(--frigo-800); letter-spacing: -0.01em; }
.chef-tip-text { font-size: 0.9375rem; color: var(--frigo-700); line-height: 1.6; font-style: italic; }

/* === Macros === */
.macros-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.macro-card { background: var(--slate-50); border: 1px solid var(--slate-100); border-radius: 14px; padding: 16px 12px; text-align: center; display: flex; flex-direction: column; gap: 4px; }
.macro-value { font-size: 1.25rem; font-weight: 800; color: var(--slate-900); }
.macro-label { font-size: 0.75rem; font-weight: 600; color: var(--slate-500); text-transform: uppercase; letter-spacing: 0.04em; }

/* === Footer CTA === */
.recipe-cta { margin-top: 32px; }
.recipe-cta-card {
  background: linear-gradient(135deg, var(--slate-900), var(--slate-800));
  border-radius: 24px; padding: 40px 28px; text-align: center; position: relative; overflow: hidden;
}
.recipe-cta-card::before { content: ''; position: absolute; top: -80px; right: -80px; width: 240px; height: 240px; background: radial-gradient(circle, rgba(249,115,22,0.15), transparent 70%); pointer-events: none; }
.recipe-cta-logo { margin: 0 auto 16px; border-radius: 12px; position: relative; z-index: 1; }
.recipe-cta-title { font-size: clamp(1.25rem, 3vw, 1.5rem); font-weight: 800; color: #fff; margin-bottom: 4px; letter-spacing: -0.01em; position: relative; z-index: 1; }
.recipe-cta-subtitle { font-size: 1rem; font-weight: 600; color: var(--frigo-400); margin-bottom: 12px; position: relative; z-index: 1; }
.recipe-cta-text { font-size: 0.9375rem; color: var(--slate-400); line-height: 1.6; margin-bottom: 24px; max-width: 420px; margin-left: auto; margin-right: auto; position: relative; z-index: 1; }
.recipe-cta-buttons { position: relative; z-index: 1; margin-bottom: 12px; }
.recipe-cta-buttons .btn { padding: 14px 28px; font-size: 1rem; }
.recipe-cta-free { font-size: 0.8125rem; color: var(--slate-500); position: relative; z-index: 1; }

/* === Mini Footer === */
.recipe-footer { display: flex; align-items: center; justify-content: space-between; padding: 24px 0; margin-top: 32px; border-top: 1px solid var(--slate-200); }
.recipe-footer-brand { display: flex; align-items: center; gap: 8px; text-decoration: none; }
.recipe-footer-brand img { width: 24px; height: 24px; border-radius: 6px; }
.recipe-footer-brand span { font-size: 0.875rem; font-weight: 700; color: var(--slate-600); }
.recipe-footer-links { display: flex; gap: 16px; }
.recipe-footer-links a { font-size: 0.75rem; color: var(--slate-400); text-decoration: none; transition: color 0.2s; }
.recipe-footer-links a:hover { color: var(--frigo-500); }

/* === Empty / Expired State === */
.recipe-page-empty { display: flex; align-items: center; justify-content: center; padding: 24px; }
.recipe-empty-card { text-align: center; max-width: 440px; background: #fff; border-radius: 24px; padding: 48px 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 20px 60px rgba(0,0,0,0.06); }
.recipe-empty-icon { width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--frigo-50), var(--frigo-100)); color: var(--frigo-500); border-radius: 20px; margin: 0 auto 24px; }
.recipe-empty-title { font-size: 1.5rem; font-weight: 800; color: var(--slate-900); letter-spacing: -0.02em; margin-bottom: 12px; }
.recipe-empty-text { font-size: 0.9375rem; color: var(--slate-500); line-height: 1.6; margin-bottom: 28px; }
.recipe-empty-cta { display: flex; flex-direction: column; gap: 12px; align-items: center; }
.recipe-empty-cta .btn { width: 100%; max-width: 300px; }

/* === Responsive === */
@media (max-width: 480px) {
  .recipe-container { padding: 0 16px 32px; }
  .recipe-content { padding: 24px 20px 28px; border-radius: 16px; }
  .recipe-cta-card { padding: 32px 20px; border-radius: 20px; }
  .recipe-empty-card { padding: 36px 24px; border-radius: 20px; }
  .recipe-footer { flex-direction: column; gap: 12px; text-align: center; }
  .macros-grid { gap: 8px; }
  .macro-card { padding: 12px 8px; }
  .macro-value { font-size: 1.0625rem; }
}

@media (min-width: 768px) {
  .recipe-hero-img { height: 400px; }
  .recipe-container { padding: 0 32px 60px; }
  .recipe-content { margin-top: -48px; padding: 40px 48px 48px; border-radius: 24px; }
  .recipe-content.no-hero { margin-top: 20px; }
  .macros-grid { gap: 16px; }
  .macro-card { padding: 20px 16px; }
}

/* === Reduced Motion === */
@media (prefers-reduced-motion: reduce) {
  .recipe-page * { animation: none !important; transition: none !important; }
}
`;
