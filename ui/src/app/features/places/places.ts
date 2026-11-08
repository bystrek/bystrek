import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Alert } from '../../shared/alert/alert';
import { Button } from '../../shared/button/button';
import { Chip } from '../../shared/chip/chip';
import { Icon } from '../../shared/icon/icon';
import { Progress } from '../../shared/progress/progress';
import { OsmAttribution } from './osm-attribution';
import { PlaceBar } from './place-bar';
import { PlaceBarStore } from './place-bar-store';
import { PlaceEntry } from './place-entry';
import { VisitedFilter } from './place-search';
import { PlacesMap } from './places-map';
import { PlacesStore, PlacesView } from './places-store';

const VIEWS: { value: PlacesView; label: string }[] = [
  { value: PlacesView.List, label: 'List' },
  { value: PlacesView.Map, label: 'Map' },
];

const FILTERS: { value: VisitedFilter; label: string }[] = [
  { value: VisitedFilter.All, label: 'All' },
  { value: VisitedFilter.ToVisit, label: 'To visit' },
  { value: VisitedFilter.Visited, label: 'Visited' },
];

@Component({
  selector: 'app-places',
  imports: [Alert, Button, Chip, Icon, OsmAttribution, PlaceBar, PlaceEntry, PlacesMap, Progress],
  providers: [PlacesStore, PlaceBarStore],
  templateUrl: './places.html',
  styleUrl: './places.css',
  host: { '[attr.data-view]': 'store.view()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Places {
  protected readonly store = inject(PlacesStore);
  protected readonly filters = FILTERS;
  protected readonly views = VIEWS;
  protected readonly PlacesView = PlacesView;
}
