import { Pipe, PipeTransform } from '@angular/core';
import { Place, PlaceCategory } from '../../core/places/places.service';
import { MissingItem } from '../../core/places/place-draft.service';

const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  [PlaceCategory.Restaurant]: 'Restaurant',
  [PlaceCategory.Cafe]: 'Café',
  [PlaceCategory.Bar]: 'Bar',
  [PlaceCategory.Shop]: 'Shop',
  [PlaceCategory.Museum]: 'Museum',
  [PlaceCategory.Attraction]: 'Attraction',
  [PlaceCategory.Park]: 'Park',
  [PlaceCategory.Accommodation]: 'Accommodation',
  [PlaceCategory.Other]: 'Other',
};

@Pipe({ name: 'categoryLabel' })
export class CategoryLabelPipe implements PipeTransform {
  transform(category: PlaceCategory): string {
    return CATEGORY_LABEL[category];
  }
}

/** The OpenStreetMap page of the object the address was geocoded to. */
@Pipe({ name: 'osmUrl' })
export class OsmUrlPipe implements PipeTransform {
  transform(place: Pick<Place, 'osmType' | 'osmId'>): string {
    return `https://www.openstreetmap.org/${place.osmType}/${place.osmId}`;
  }
}

/** "https://www.camelot.pl/menu" → "camelot.pl". */
@Pipe({ name: 'urlHost' })
export class UrlHostPipe implements PipeTransform {
  transform(url: string): string {
    return URL.parse(url)?.hostname.replace(/^www\./, '') ?? url;
  }
}

const MISSING_LABEL: Record<MissingItem, string> = {
  [MissingItem.Name]: 'The place’s name',
  [MissingItem.Address]: 'Its address',
  [MissingItem.AddressNotFound]:
    'An address OpenStreetMap can find: check the spelling, add the street number or city',
};

@Pipe({ name: 'missingItem' })
export class MissingItemPipe implements PipeTransform {
  transform(item: MissingItem): string {
    return MISSING_LABEL[item];
  }
}
