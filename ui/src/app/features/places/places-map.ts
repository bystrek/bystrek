import {
  ChangeDetectionStrategy,
  Component,
  Pipe,
  PipeTransform,
  ViewEncapsulation,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MapComponent, MarkerComponent } from '@maplibre/ngx-maplibre-gl';
import { provideMaplibreWorker } from '@maplibre/ngx-maplibre-gl/config';
import { LngLatBounds, LngLatLike, Map, MapMouseEvent, PaddingOptions } from 'maplibre-gl';
import { APP_CONFIG } from '../../core/config/app-config';
import { Place } from '../../core/places/places.service';
import { Icon } from '../../shared/icon/icon';

// Where the map opens when there are no pins to fit.
const POLAND: LngLatLike = [19.4, 52.1];

// The page's controls float over the top of the map; fitting and centring use the rest.
const UNDER_CONTROLS: PaddingOptions = { top: 220, bottom: 32, left: 32, right: 32 };

// The camera fits the pins shown when the map opens; later searches only hide pins.
@Pipe({ name: 'pinBounds' })
export class PinBoundsPipe implements PipeTransform {
  transform(places: readonly Place[]): LngLatBounds | undefined {
    if (places.length === 0) return undefined;
    return places.reduce((b, p) => b.extend([p.lng, p.lat]), new LngLatBounds());
  }
}

// Pins for the given places. Presentational: the page owns the selection.
@Component({
  selector: 'app-places-map',
  imports: [Icon, MapComponent, MarkerComponent, PinBoundsPipe],
  // MapLibre loads its worker from a separate file, copied next to the bundle by angular.json.
  providers: [provideMaplibreWorker('maplibre-gl-worker.mjs')],
  templateUrl: './places-map.html',
  styleUrl: './places-map.css',
  // Styles the marker and attribution elements MapLibre creates; its own stylesheet is global.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlacesMap {
  readonly places = input.required<readonly Place[]>();
  readonly selectedId = input<string | null>(null);
  readonly selected = output<string | null>();

  protected readonly styleUrl = inject(APP_CONFIG).mapStyleUrl;
  protected readonly poland = POLAND;
  protected readonly fitPadding = { padding: UNDER_CONTROLS, maxZoom: 15 };
  protected readonly map = signal<Map | null>(null);

  constructor() {
    // The card that opens below is taller than the command bar, so the map shrinks: centre the
    // tapped pin so it stays in sight. Only a new selection moves the map, not a search.
    effect(() => {
      const map = this.map();
      const id = this.selectedId();
      const place = untracked(() => this.places().find((p) => p.id === id));
      if (map && place) map.easeTo({ center: [place.lng, place.lat], padding: UNDER_CONTROLS });
    });
  }

  // A tap on the map itself, not on a pin, closes the card.
  protected mapClicked(event: MapMouseEvent): void {
    const target = event.originalEvent.target as Element | null;
    if (!target?.closest('.places-map-pin')) this.selected.emit(null);
  }
}
