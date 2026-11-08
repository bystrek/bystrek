import { deburr } from 'es-toolkit/string';
import { Place } from '../../core/places/places.service';

export const VisitedFilter = { All: 'all', ToVisit: 'to-visit', Visited: 'visited' } as const;
export type VisitedFilter = (typeof VisitedFilter)[keyof typeof VisitedFilter];

export type SearchablePlace = { place: Place; key: string };

// Case- and diacritic-insensitive: "krakow" matches "Kraków", "lodz" matches "Łódź".
// Plain `toLowerCase`: the locale-aware one turns "I" into dotless "ı" in a Turkish browser.
const fold = (text: string): string => deburr(text).toLowerCase();

// Built once per load, so each keystroke only folds the query.
export const toSearchable = (place: Place): SearchablePlace => ({
  place,
  key: fold([place.name, place.address, place.displayAddress, place.notes ?? ''].join('\n')),
});

const matchesVisited = (place: Place, filter: VisitedFilter): boolean =>
  filter === VisitedFilter.All || place.visitedByMe === (filter === VisitedFilter.Visited);

// Every word of the query must appear somewhere, in any order.
export const searchPlaces = (
  places: readonly SearchablePlace[],
  query: string,
  filter: VisitedFilter,
): Place[] => {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return places
    .filter(
      ({ place, key }) => matchesVisited(place, filter) && words.every((w) => key.includes(w)),
    )
    .map(({ place }) => place);
};
