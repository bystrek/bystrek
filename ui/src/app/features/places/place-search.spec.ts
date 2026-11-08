import { aPlace } from './place-fixtures';
import { VisitedFilter, searchPlaces, toSearchable } from './place-search';

const camelot = aPlace({ id: 'camelot', notes: 'Great cheesecake' });
const manufaktura = aPlace({
  id: 'manufaktura',
  name: 'Manufaktura',
  category: 'shop',
  address: 'Drewnowska 58, Łódź',
  displayAddress: 'Manufaktura, Drewnowska, Bałuty, Łódź, Polska',
  visitedByMe: true,
});
const all = [camelot, manufaktura].map(toSearchable);
const ids = (query: string, filter: VisitedFilter = VisitedFilter.All) =>
  searchPlaces(all, query, filter).map((p) => p.id);

describe('searchPlaces', () => {
  it('ignores case and diacritics, including ł', () => {
    expect(ids('krakow')).toEqual(['camelot']);
    expect(ids('LODZ')).toEqual(['manufaktura']);
    expect(ids('cafe')).toEqual(['camelot']);
    expect(ids('ŁÓDŹ')).toEqual(['manufaktura']);
  });

  it('searches name, address, the geocoded address and notes', () => {
    expect(ids('manufaktura')).toEqual(['manufaktura']);
    expect(ids('tomasza')).toEqual(['camelot']);
    expect(ids('stare miasto')).toEqual(['camelot']);
    expect(ids('cheesecake')).toEqual(['camelot']);
  });

  it('needs every word, in any order', () => {
    expect(ids('cheesecake krakow')).toEqual(['camelot']);
    expect(ids('cheesecake lodz')).toEqual([]);
  });

  it('returns everything in order for a blank query', () => {
    expect(ids('  ')).toEqual(['camelot', 'manufaktura']);
  });

  it('filters by the current user’s visits', () => {
    expect(ids('', VisitedFilter.Visited)).toEqual(['manufaktura']);
    expect(ids('', VisitedFilter.ToVisit)).toEqual(['camelot']);
    expect(ids('krakow', VisitedFilter.Visited)).toEqual([]);
  });
});
