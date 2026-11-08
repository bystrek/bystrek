import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { errorMessage } from '../http/error-message';

// Mirrors the API's `place_category` enum.
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

export const OsmType = { Node: 'node', Way: 'way', Relation: 'relation' } as const;
export type OsmType = (typeof OsmType)[keyof typeof OsmType];

// Shared by every user; `visitedByMe` is the current user's. `displayAddress`, `lat`, `lng`
// and the OSM id come from OpenStreetMap (ODbL): show the attribution wherever they appear.
export type Place = {
  id: string;
  name: string;
  category: PlaceCategory;
  address: string;
  displayAddress: string;
  lat: number;
  lng: number;
  osmType: OsmType;
  osmId: number;
  notes: string | null;
  url: string | null;
  createdBy: { id: string; name: string | null } | null;
  createdAt: string;
  updatedAt: string;
  visitedByMe: boolean;
};

// A blank `notes` or `url` clears it. A changed address is geocoded again by the API.
// A confirmed draft plus the OSM object the user chose; the API looks up its coordinates.
export type NewPlace = Pick<Place, 'name' | 'category' | 'address' | 'notes' | 'url'> &
  Pick<Place, 'osmType' | 'osmId'>;

export type PlacePatch = Partial<Pick<Place, 'name' | 'category' | 'address' | 'notes' | 'url'>>;

@Injectable({ providedIn: 'root' })
export class PlacesService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).apiUrl}/places`;

  // Every place, newest first. No paging: the list searches the full set in memory.
  list(): Promise<Place[]> {
    return send(this.http.get<Place[]>(this.url), 'Could not load places.');
  }

  // Rejects with "That place is already on the list" when the OSM object is taken.
  create(place: NewPlace): Promise<Place> {
    return send(this.http.post<Place>(this.url, place), 'Could not save the place.');
  }

  update(id: string, patch: PlacePatch): Promise<Place> {
    return send(this.http.patch<Place>(`${this.url}/${id}`, patch), 'Could not save the place.');
  }

  remove(id: string): Promise<void> {
    return send(this.http.delete<void>(`${this.url}/${id}`), 'Could not delete the place.');
  }

  setVisited(id: string, visited: boolean): Promise<void> {
    const url = `${this.url}/${id}/visit`;
    return send(
      visited ? this.http.put<void>(url, null) : this.http.delete<void>(url),
      'Could not update the visit.',
    );
  }
}

// The API's message when it sent one (e.g. "Couldn't find that address"), else the fallback.
async function send<T>(request: Observable<T>, fallback: string): Promise<T> {
  try {
    return await firstValueFrom(request);
  } catch (err) {
    throw new Error(errorMessage(err, fallback));
  }
}
