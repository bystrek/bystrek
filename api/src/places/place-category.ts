// What kind of place it is. The draft model (#143) picks one; `other` when nothing fits.
// Stored as the `place_category` Postgres enum, so adding a value needs a migration.
export const PlaceCategory = {
  Restaurant: 'restaurant',
  Cafe: 'cafe',
  Bar: 'bar',
  Shop: 'shop',
  Museum: 'museum',
  Attraction: 'attraction',
  Park: 'park',
  Accommodation: 'accommodation',
  Other: 'other',
} as const;
export type PlaceCategory = (typeof PlaceCategory)[keyof typeof PlaceCategory];
