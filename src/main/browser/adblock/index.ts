/**
 * Ad Blocking Module
 * 
 * Provides ad/tracker blocking using external filter lists (EasyList, etc.)
 * Filters are downloaded and cached in user data directory.
 */
export {
  FilterManager,
  getFilterManager,
  initFilterManager,
  type FilterManagerConfig,
} from './FilterManager';
