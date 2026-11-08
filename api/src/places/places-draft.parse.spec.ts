import { describe, expect, it } from 'bun:test';
import { PlaceCategory } from './place-category';
import { parseDraft } from './places-draft.parse';

const camelot = {
  kind: 'place' as const,
  name: 'Café Camelot',
  category: PlaceCategory.Cafe,
  address: 'Świętego Tomasza 17, Kraków',
  notes: 'great cheesecake',
  url: 'https://camelot.example.pl',
};

describe('parseDraft', () => {
  it('reads a complete place', () => {
    const { kind, ...draft } = camelot;
    expect(parseDraft(JSON.stringify(camelot))).toEqual({ kind: 'place', draft });
  });

  it('turns blank or absent fields into null', () => {
    expect(
      parseDraft('{"kind":"place","name":"  ","category":"bar","address":null,"url":""}'),
    ).toEqual({
      kind: 'place',
      draft: { name: null, category: 'bar', address: null, notes: null, url: null },
    });
  });

  it('defaults an unknown category to other and drops a non-http url', () => {
    expect(
      parseDraft(JSON.stringify({ ...camelot, category: 'bakery', url: 'javascript:alert(1)' })),
    ).toMatchObject({ draft: { category: 'other', url: null } });
  });

  it('drops coordinates and other unknown keys', () => {
    const parsed = parseDraft(JSON.stringify({ ...camelot, lat: 50.06, lng: 19.94 }));
    expect(parsed).toMatchObject({ kind: 'place' });
    expect(parsed && 'draft' in parsed ? Object.keys(parsed.draft) : []).toEqual([
      'name',
      'category',
      'address',
      'notes',
      'url',
    ]);
  });

  it('reads cant_do', () => {
    expect(parseDraft('{"kind":"cant_do"}')).toEqual({ kind: 'cant_do' });
  });

  it('rejects malformed replies', () => {
    expect(parseDraft('Café Camelot is on Świętego Tomasza')).toBeUndefined();
    expect(parseDraft('[]')).toBeUndefined();
    expect(parseDraft('{"kind":"list"}')).toBeUndefined();
    expect(parseDraft('{"kind":"place","name":42}')).toBeUndefined();
    expect(parseDraft(JSON.stringify({ ...camelot, name: 'x'.repeat(201) }))).toBeUndefined();
  });
});
