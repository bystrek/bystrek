import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { Place, PlaceCategory } from './places.service';

// Mirrors the API's PlaceDraftResponse (POST /places/draft).
export type PlaceDraft = {
  name: string | null;
  category: PlaceCategory;
  address: string | null;
  notes: string | null;
  url: string | null;
};
export type CompleteDraft = PlaceDraft & { name: string; address: string };

// From OpenStreetMap (ODbL): show the attribution wherever it appears.
export type GeocodedLocation = Pick<Place, 'osmType' | 'osmId' | 'displayAddress' | 'lat' | 'lng'>;

// What the user still has to add to the text before it can be saved.
export const MissingItem = {
  Name: 'name',
  Address: 'address',
  // The address is there, but the geocoder doesn't know it.
  AddressNotFound: 'address_not_found',
} as const;
export type MissingItem = (typeof MissingItem)[keyof typeof MissingItem];

export type PlaceDraftResponse =
  | { kind: 'ready'; draft: CompleteDraft; location: GeocodedLocation }
  | { kind: 'needs_input'; draft: PlaceDraft; missing: MissingItem[] }
  | { kind: 'needs_choice'; draft: CompleteDraft; candidates: GeocodedLocation[] }
  | { kind: 'duplicate'; draft: CompleteDraft; place: Place }
  | { kind: 'cant_do'; text: string }
  | { kind: 'text'; text: string };

// Matches the API's MAX_DRAFT_TEXT_LENGTH.
export const MAX_DRAFT_TEXT_LENGTH = 1000;

// Drafts a place from the whole prompt; nothing is saved. Cold, so a draft can be cancelled.
@Injectable({ providedIn: 'root' })
export class PlaceDraftService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).apiUrl}/places/draft`;

  draft(text: string): Observable<PlaceDraftResponse> {
    return this.http.post<PlaceDraftResponse>(this.url, { text });
  }
}
