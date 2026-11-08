import { Pipe, PipeTransform } from '@angular/core';
import { Place, PlaceCategory } from '../../core/places/places.service';

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
