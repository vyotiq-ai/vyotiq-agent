/**
 * Autocomplete Module
 * 
 * AI-powered inline autocomplete for the chat input.
 */

export { AutocompleteService, getAutocompleteService, initAutocompleteService } from './AutocompleteService';
export { AutocompleteCache } from './cache';
export type { CacheEntry, SelectedProvider, AutocompleteConfig } from './types';
export { DEFAULT_AUTOCOMPLETE_CONFIG } from './types';
