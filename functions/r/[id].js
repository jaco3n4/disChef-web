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
  const ogDescription = `${esc(recipe.title)} \u2014 ${totalTime ? totalTime + ' \u00b7 ' : ''}${ingredientCount} ingr\u00e9dients \u00b7 ${recipe.difficulty}. D\u00e9couverte sur DisChef.`;
  const ogImage = recipe.image_url || 'https://dischef.fr/images/og-default.png';
  const pageTitle = `${esc(recipe.title)} \u2014 Recette DisChef`;
  const canonicalUrl = `https://dischef.fr/r/${id}`;

  // Schema.org JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    description: recipe.description || `Recette \u00ab ${recipe.title} \u00bb sur DisChef`,
    image: recipe.image_url || undefined,
    prepTime: recipe.prep_time ? `PT${recipe.prep_time.replace(/\D/g, '')}M` : undefined,
    cookTime: recipe.cook_time ? `PT${recipe.cook_time.replace(/\D/g, '')}M` : undefined,
    recipeYield: `${recipe.servings} portions`,
    recipeIngredient: recipe.ingredients.map(ing =>
      typeof ing === 'string' ? ing : ing && ing.name
        ? `${ing.name}${ing.quantity ? ' ' + ing.quantity + (ing.unit ? ' ' + ing.unit : '') : ''}`
        : String(ing)
    ),
    recipeInstructions: recipe.steps.map((step, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      text: typeof step === 'string' ? step : step && step.instruction ? step.instruction : String(step),
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

  // Build meta info HTML
  let metaHtml = '';
  if (totalTime) {
    metaHtml += `
              <span class="recipe-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                ${esc(totalTime)}
              </span>`;
  }
  if (recipe.difficulty) {
    metaHtml += `
              <span class="recipe-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14.5a2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path d="M12 14.5V22"/><path d="m15.4 17.4 3.6 3.6"/><path d="m8.6 17.4-3.6 3.6"/><path d="M19.4 6.6a10 10 0 1 0-14.8 0"/></svg>
                ${esc(recipe.difficulty)}
              </span>`;
  }
  if (recipe.calories_per_serving > 0) {
    metaHtml += `
              <span class="recipe-meta-item calories">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                ${recipe.calories_per_serving} kcal
              </span>`;
  }
  if (recipe.servings > 0) {
    metaHtml += `
              <span class="recipe-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                ${recipe.servings} ${recipe.servings > 1 ? 'portions' : 'portion'}
              </span>`;
  }

  // Build ingredients HTML (pill style)
  let ingredientsHtml = '';
  if (recipe.ingredients.length > 0) {
    const items = recipe.ingredients.map(ing => {
      if (typeof ing === 'string') {
        return `<li class="ingredient-item"><span class="ingredient-name">${esc(ing)}</span></li>`;
      }
      if (ing && ing.name) {
        const qty = ing.quantity ? `${ing.quantity}${ing.unit ? ' ' + esc(ing.unit) : ''}` : '';
        return `<li class="ingredient-item"><span class="ingredient-name">${esc(ing.name)}</span>${qty ? `<span>${qty}</span>` : ''}</li>`;
      }
      return `<li class="ingredient-item"><span class="ingredient-name">${esc(String(ing))}</span></li>`;
    }).join('');
    ingredientsHtml = `
          <section class="recipe-section">
            <h2 class="recipe-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2"/><path d="M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/><path d="M10 10v6"/><path d="M14 10v6"/></svg>
              Ingr\u00e9dients
            </h2>
            <ul class="ingredients-list">${items}</ul>
          </section>`;
  }

  // Build steps HTML
  let stepsHtml = '';
  if (recipe.steps.length > 0) {
    const items = recipe.steps.map((step, i) => {
      const text = typeof step === 'string'
        ? esc(step)
        : step && step.instruction
          ? esc(step.instruction)
          : esc(String(step));
      const timerHtml = (step && step.timer_seconds && step.timer_seconds > 0)
        ? ` <span class="step-timer"><svg viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg> ${Math.round(step.timer_seconds / 60)} min</span>`
        : '';
      return `<li class="step-item"><div class="step-number">${i + 1}</div><p class="step-text">${text}${timerHtml}</p></li>`;
    }).join('');
    stepsHtml = `
          <section class="recipe-section">
            <h2 class="recipe-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Pr\u00e9paration
            </h2>
            <ol class="steps-list">${items}</ol>
          </section>`;
  }

  // Build chef tip HTML (yellow theme)
  let chefTipHtml = '';
  if (recipe.chef_tip) {
    chefTipHtml = `
          <section class="recipe-section">
            <div class="chef-tip-card">
              <svg class="chef-tip-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
              <div class="chef-tip-content">
                <h3>Le conseil du Chef</h3>
                <p class="chef-tip-text">${esc(recipe.chef_tip)}</p>
              </div>
            </div>
          </section>`;
  }

  // Build macros HTML
  let macrosHtml = '';
  if (recipe.protein || recipe.carbs || recipe.fat) {
    let macroCards = '';
    if (recipe.protein !== null) {
      macroCards += `<div class="macro-card"><span class="macro-value">${recipe.protein}g</span><span class="macro-label">Prot\u00e9ines</span></div>`;
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>${pageTitle}</title>
  <meta name="description" content="${esc(ogDescription)}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <link rel="icon" type="image/svg+xml" href="/images/logo.svg" />
  <link rel="icon" type="image/png" href="/images/logo.png" />

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${pageTitle}" />
  <meta property="og:description" content="${esc(ogDescription)}" />
  <meta property="og:image" content="${esc(ogImage)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:site_name" content="DisChef" />
  <meta property="og:locale" content="fr_FR" />

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
          <img src="/images/logo.svg" alt="DisChef" width="44" height="44" />
          <div class="app-banner-text">
            <span class="app-banner-name">DisChef</span>
            <span class="app-banner-tagline">Votre frigo a du talent.</span>
          </div>
        </a>
        <a href="${IOS_STORE}" class="btn btn-primary btn-small" id="banner-cta">D\u00e9couvrir</a>
      </div>
    </div>

    <div class="recipe-container">
      <div class="recipe-card-wrapper">
        ${heroHtml}

        <article class="recipe-content${!recipe.image_url ? ' no-hero' : ''}">
          <header class="recipe-header">
            <div class="recipe-meta text-uppercase-tracking">${metaHtml}
            </div>
            <h1 class="recipe-title title-black">${esc(recipe.title)}</h1>
            ${descriptionHtml}
          </header>

          ${ingredientsHtml}
          ${stepsHtml}
          ${chefTipHtml}
          ${macrosHtml}
        </article>
      </div>

      <!-- Footer CTA -->
      <div class="recipe-cta">
        <div class="recipe-cta-card">
          <img src="/images/logo.svg" alt="DisChef" width="56" height="56" class="recipe-cta-logo" />
          <h2 class="recipe-cta-title">Envie de cuisiner avec ce que vous avez ?</h2>
          <p class="recipe-cta-subtitle">Essayez DisChef.</p>
          <p class="recipe-cta-text">DisChef analyse votre frigo et compose des recettes sur mesure. Fini le gaspillage, fini le &laquo; qu&#x27;est-ce qu&#x27;on mange ? &raquo;.</p>
          <div class="recipe-cta-buttons">
            <a href="${IOS_STORE}" class="btn btn-primary" id="cta-store-btn">
              T\u00e9l\u00e9charger gratuitement
            </a>
          </div>
          <p class="recipe-cta-free">Gratuit \u2014 Pas de carte bancaire requise</p>
        </div>
      </div>

      <!-- Mini Footer -->
      <footer class="recipe-footer">
        <a href="https://dischef.fr">DisChef \u00a9 2026</a>
        <a href="/mentions-legales">Mentions l\u00e9gales</a>
        <a href="/confidentialite">Confidentialit\u00e9</a>
      </footer>
    </div>
  </div>

  <script>
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
  const title = isExpired ? 'Cette recette a expir\u00e9' : 'Recette introuvable';
  const subtitle = isExpired
    ? 'Les liens de partage sont valables 30 jours. T\u00e9l\u00e9chargez DisChef pour des recettes illimit\u00e9es.'
    : 'Ce lien ne m\u00e8ne nulle part. La recette a peut-\u00eatre \u00e9t\u00e9 supprim\u00e9e ou le lien est incorrect.';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>${esc(title)} \u2014 DisChef</title>
  <meta name="description" content="${esc(subtitle)}" />
  <link rel="icon" type="image/svg+xml" href="/images/logo.svg" />

  <meta property="og:title" content="${esc(title)} \u2014 DisChef" />
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
          D\u00e9couvrir DisChef
        </a>
        <a href="https://dischef.fr" class="btn btn-secondary">Retour \u00e0 l&#x27;accueil</a>
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
// Inline CSS — New Design
// ──────────────────────────────────────────

const CSS_RECIPE = `
/* === Reset & Base === */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --orange-50: #fff7ed; --orange-100: #ffedd5; --orange-400: #fb923c; --orange-500: #f97316; --orange-600: #ea580c;
  --slate-50: #f8fafc; --slate-100: #f1f5f9; --slate-200: #e2e8f0; --slate-300: #cbd5e1; --slate-400: #94a3b8;
  --slate-500: #64748b; --slate-600: #475569; --slate-700: #334155; --slate-800: #1e293b; --slate-900: #0f172a;
  --yellow-50: #fefce8; --yellow-100: #fef08a; --yellow-500: #eab308; --yellow-700: #a16207; --yellow-800: #854d0e;
}

html { scroll-behavior: smooth; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
body { font-family: 'Inter', sans-serif; color: var(--slate-800); background: var(--slate-100); line-height: 1.6; font-size: 16px; }
img { max-width: 100%; height: auto; display: block; }
a { color: inherit; text-decoration: none; }

/* === Typography Helpers === */
.title-black { font-weight: 900; letter-spacing: -0.02em; }
.text-uppercase-tracking { text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.75rem; font-weight: 700; }

/* === Buttons === */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font-family: inherit; font-weight: 700; font-size: 1rem; border: none; cursor: pointer;
  border-radius: 9999px; padding: 16px 32px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); text-decoration: none;
}
.btn:active { transform: scale(0.96); }
.btn-primary { background: var(--orange-500); color: #fff; box-shadow: 0 10px 25px -5px rgba(249,115,22,0.4); }
.btn-primary:hover { background: var(--orange-600); transform: translateY(-2px); box-shadow: 0 15px 35px -5px rgba(249,115,22,0.5); }
.btn-secondary { background: #fff; color: var(--slate-700); border: 2px solid var(--slate-200); border-radius: 9999px; }
.btn-secondary:hover { border-color: var(--orange-400); color: var(--orange-600); }
.btn-small { font-size: 0.8125rem; padding: 10px 20px; box-shadow: none; }

/* === Recipe Page Layout === */
.recipe-page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding-bottom: 40px; }

/* === Smart App Banner === */
.app-banner {
  position: sticky; top: 0; z-index: 50; width: 100%;
  background: rgba(255,255,255,0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
}
.app-banner-inner { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; max-width: 800px; margin: 0 auto; }
.app-banner-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
.app-banner-brand img { width: 44px; height: 44px; border-radius: 12px; }
.app-banner-text { display: flex; flex-direction: column; }
.app-banner-name { font-size: 1rem; font-weight: 800; color: var(--slate-900); line-height: 1.1; }
.app-banner-tagline { font-size: 0.75rem; color: var(--slate-500); font-weight: 500; margin-top: 2px; }

/* === Hero Container === */
.recipe-container { max-width: 800px; width: 100%; padding: 24px; animation: slideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; transform: translateY(20px); }
@keyframes slideUp { to { opacity: 1; transform: translateY(0); } }

/* === Content Card === */
.recipe-card-wrapper {
  background: #fff; border-radius: 48px; overflow: hidden;
  box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.05), 0 0 0 1px rgba(226, 232, 240, 0.5);
}

/* === Hero Image === */
.recipe-hero { position: relative; width: 100%; height: 350px; background: var(--slate-100); overflow: hidden; }
.recipe-hero-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.recipe-hero-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.4) 100%); pointer-events: none; }

/* === Content Body === */
.recipe-content { padding: 40px 48px 60px; }
.recipe-content.no-hero { padding-top: 48px; }

/* === Header & Meta === */
.recipe-meta { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 24px; color: var(--slate-500); }
.recipe-meta-item { display: flex; align-items: center; gap: 6px; }
.recipe-meta-item svg { width: 16px; height: 16px; flex-shrink: 0; }
.recipe-meta-item.calories { color: var(--orange-500); }

.recipe-header { margin-bottom: 32px; }
.recipe-title { font-size: clamp(2rem, 5vw, 2.75rem); color: var(--slate-900); line-height: 1.1; margin-bottom: 8px; }
.recipe-description { font-size: 1.125rem; color: var(--slate-500); font-weight: 500; }

/* === Sections === */
.recipe-section { margin-bottom: 40px; }
.recipe-section:last-child { margin-bottom: 0; }
.recipe-section-title {
  display: flex; align-items: center; gap: 10px; font-size: 1rem; font-weight: 800;
  color: var(--slate-900); margin-bottom: 20px;
}
.recipe-section-title svg { color: var(--slate-900); width: 18px; height: 18px; }

/* === Ingredients List (Pill Style) === */
.ingredients-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }
.ingredient-item {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.875rem; color: var(--slate-600); font-weight: 500;
  background: var(--slate-50); padding: 14px 20px;
  border-radius: 16px; border: 1px solid rgba(226, 232, 240, 0.6);
}
.ingredient-name { color: var(--slate-800); font-weight: 600; }

/* === Steps === */
.steps-list { list-style: none; display: flex; flex-direction: column; gap: 24px; }
.step-item { display: flex; gap: 16px; align-items: flex-start; }
.step-number {
  width: 26px; height: 26px; min-width: 26px; background: var(--orange-500); color: #fff;
  border-radius: 8px; display: flex; align-items: center; justify-content: center;
  font-size: 0.75rem; font-weight: 900; margin-top: 2px;
}
.step-text { font-size: 0.9375rem; color: var(--slate-600); line-height: 1.8; flex: 1; }
.step-timer {
  display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 700;
  color: var(--slate-500); background: var(--slate-100); padding: 4px 12px;
  border-radius: 999px; margin-left: 8px; vertical-align: middle; white-space: nowrap;
}
.step-timer svg { width: 12px; height: 12px; fill: currentColor; }

/* === Chef Tip (Yellow) === */
.chef-tip-card {
  background: var(--yellow-50); border: 1px solid var(--yellow-100);
  border-radius: 24px; padding: 24px; display: flex; gap: 16px; align-items: flex-start;
}
.chef-tip-icon { color: var(--yellow-500); flex-shrink: 0; margin-top: 2px; }
.chef-tip-content h3 { font-size: 0.75rem; font-weight: 800; color: var(--yellow-800); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
.chef-tip-text { font-size: 0.875rem; color: rgba(161, 98, 7, 0.8); line-height: 1.6; font-style: italic; }

/* === Macros === */
.macros-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.macro-card { background: var(--slate-50); border: 1px solid rgba(226, 232, 240, 0.6); border-radius: 16px; padding: 16px 12px; text-align: center; display: flex; flex-direction: column; gap: 4px; }
.macro-value { font-size: 1.25rem; font-weight: 800; color: var(--slate-900); }
.macro-label { font-size: 0.75rem; font-weight: 600; color: var(--slate-500); text-transform: uppercase; letter-spacing: 0.04em; }

/* === CTA Footer === */
.recipe-cta { margin-top: 48px; }
.recipe-cta-card {
  background: var(--slate-900); border-radius: 32px; padding: 48px 32px;
  text-align: center; position: relative; overflow: hidden; color: #fff;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.15);
}
.recipe-cta-logo { width: 56px; height: 56px; margin: 0 auto 20px; border-radius: 16px; }
.recipe-cta-title { font-size: 1.75rem; font-weight: 900; margin-bottom: 8px; letter-spacing: -0.02em; }
.recipe-cta-subtitle { font-size: 1.125rem; font-weight: 600; color: var(--orange-400); margin-bottom: 16px; }
.recipe-cta-text { font-size: 1rem; color: var(--slate-400); line-height: 1.6; margin-bottom: 32px; max-width: 480px; margin-left: auto; margin-right: auto; }
.recipe-cta-buttons .btn { width: 100%; max-width: 320px; }
.recipe-cta-free { font-size: 0.8125rem; color: var(--slate-500); margin-top: 16px; font-weight: 500; }

/* === Mini Footer === */
.recipe-footer { display: flex; align-items: center; justify-content: center; gap: 24px; padding: 32px 0; margin-top: 16px; }
.recipe-footer a { font-size: 0.8125rem; font-weight: 600; color: var(--slate-400); text-decoration: none; transition: color 0.2s; }
.recipe-footer a:hover { color: var(--slate-900); }

/* === Empty / Expired State === */
.recipe-page-empty { display: flex; align-items: center; justify-content: center; padding: 24px; }
.recipe-empty-card { text-align: center; max-width: 440px; background: #fff; border-radius: 32px; padding: 48px 32px; box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.05), 0 0 0 1px rgba(226, 232, 240, 0.5); }
.recipe-empty-icon { width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; background: var(--orange-50); color: var(--orange-500); border-radius: 20px; margin: 0 auto 24px; }
.recipe-empty-title { font-size: 1.5rem; font-weight: 800; color: var(--slate-900); letter-spacing: -0.02em; margin-bottom: 12px; }
.recipe-empty-text { font-size: 0.9375rem; color: var(--slate-500); line-height: 1.6; margin-bottom: 28px; }
.recipe-empty-cta { display: flex; flex-direction: column; gap: 12px; align-items: center; }
.recipe-empty-cta .btn { width: 100%; max-width: 300px; }

/* === Responsive === */
@media (max-width: 640px) {
  .recipe-container { padding: 16px; }
  .recipe-card-wrapper { border-radius: 32px; }
  .recipe-hero { height: 280px; }
  .recipe-content { padding: 32px 24px 40px; }
  .recipe-meta { gap: 12px; }
  .recipe-cta-card { padding: 40px 24px; border-radius: 28px; }
  .step-timer { display: block; margin-left: 0; margin-top: 8px; width: fit-content; }
  .recipe-empty-card { padding: 36px 24px; border-radius: 24px; }
}

/* === Reduced Motion === */
@media (prefers-reduced-motion: reduce) {
  .recipe-page * { animation: none !important; transition: none !important; }
}
`;
