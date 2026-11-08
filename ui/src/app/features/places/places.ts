import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Alert } from '../../shared/alert/alert';
import { Button } from '../../shared/button/button';
import { Chip } from '../../shared/chip/chip';
import { Progress } from '../../shared/progress/progress';
import { OsmAttribution } from './osm-attribution';
import { PlaceBar } from './place-bar';
import { PlaceBarStore } from './place-bar-store';
import { PlaceForm } from './place-form';
import { PlaceRow, PlaceRowMode } from './place-row';
import { VisitedFilter } from './place-search';
import { PlacesStore } from './places-store';

const FILTERS: { value: VisitedFilter; label: string }[] = [
  { value: VisitedFilter.All, label: 'All' },
  { value: VisitedFilter.ToVisit, label: 'To visit' },
  { value: VisitedFilter.Visited, label: 'Visited' },
];

@Component({
  selector: 'app-places',
  imports: [Alert, Button, Chip, OsmAttribution, PlaceBar, PlaceForm, PlaceRow, Progress],
  providers: [PlacesStore, PlaceBarStore],
  templateUrl: './places.html',
  styleUrl: './places.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Places {
  protected readonly store = inject(PlacesStore);
  protected readonly filters = FILTERS;
  protected readonly PlaceRowMode = PlaceRowMode;
}
