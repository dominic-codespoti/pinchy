// Search functionality - exports from hooks
export {
  SearchProvider,
  useCommandPalette,
  useRecentSearches,
  useSearchResults,
} from '@/shared/hooks/use-search';

export type {
  SearchResult,
  SearchResultType,
  RecentSearch,
  SearchData,
} from '@/shared/hooks/use-search';

export { SearchTrigger } from './trigger';
