/**
 * Trusted Domains Registry
 *
 * Single source of truth for domains that are known to be safe.
 * Used by both BrowserSecurity (to bypass malicious URL checks)
 * and FilterManager (to bypass ad-blocking rules).
 *
 * NOTE: Ad/tracking domains should NOT be in this list — they are handled
 * separately by the ad-blocking system.
 */

export const TRUSTED_DOMAINS: ReadonlySet<string> = new Set([
  // Search engines
  'google.com',
  'www.google.com',
  'bing.com',
  'www.bing.com',
  'duckduckgo.com',
  'yahoo.com',

  // Google services and CDNs (NOT ad services)
  'gstatic.com',
  'googleapis.com',
  'googleusercontent.com',
  'googlevideo.com',
  'youtube.com',
  'www.youtube.com',
  'ytimg.com',
  'ggpht.com',

  // Major AI provider domains and CDNs
  'anthropic.com',
  's-cdn.anthropic.com',
  'docs.anthropic.com',
  'openai.com',
  'api.openai.com',
  'platform.openai.com',
  'deepseek.com',
  'ai.google.dev',
  'generativelanguage.googleapis.com',

  // ML platforms and model hubs (often false-positived by ad filters)
  'huggingface.co',
  'hf.co',
  'replicate.com',
  'together.ai',
  'groq.com',
  'mistral.ai',
  'cohere.com',
  'ai21.com',

  // Other major CDNs and trusted services
  'cloudflare.com',
  'cdnjs.cloudflare.com',
  'jsdelivr.net',
  'unpkg.com',
  'github.com',
  'githubusercontent.com',
  'raw.githubusercontent.com',
  'microsoft.com',
  'msecnd.net',
  'azureedge.net',
  'akamaized.net',
  'cloudfront.net',
  'fastly.net',
  'fastly.com',

  // Major sites
  'stackoverflow.com',
  'stackexchange.com',
  'wikipedia.org',
  'reddit.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'amazon.com',
  'apple.com',

  // Documentation and developer sites
  'developers.google.com',
  'developer.mozilla.org',
  'vercel.com',
  'vercel.app',
  'netlify.com',
  'netlify.app',

  // Developer blogs and content sites (often false-positived by ad filters)
  'dev.to',
  'medium.com',
  'hashnode.dev',
  'freecodecamp.org',
  'css-tricks.com',
  'smashingmagazine.com',
  'web.dev',
  'hackernoon.com',
  'dzone.com',
  'infoq.com',
  'sitepoint.com',
  'scotch.io',
  'tutorialzine.com',
  'codrops.com',

  // Tech news
  'techcrunch.com',
  'theverge.com',
  'arstechnica.com',
  'wired.com',
  'news.ycombinator.com',

  // Package registries and docs
  'npmjs.com',
  'pypi.org',
  'crates.io',
  'rubygems.org',
  'packagist.org',
  'nuget.org',
  'docs.rs',
  'pkg.go.dev',

  // Cloud provider docs
  'docs.aws.amazon.com',
  'cloud.google.com',
  'docs.microsoft.com',
  'learn.microsoft.com',
  'azure.microsoft.com',

  // Developer tools and documentation
  'nodejs.org',
  'typescriptlang.org',
  'react.dev',
  'vuejs.org',
  'angular.io',
  'svelte.dev',

  // Localhost
  'localhost',
  '127.0.0.1',
]);
