import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Place } from '../../core/places/places.service';
import { Button } from '../../shared/button/button';
import { Icon } from '../../shared/icon/icon';
import { Tag } from '../../shared/tag/tag';
import { CategoryLabelPipe, OsmUrlPipe, UrlHostPipe } from './place-pipes';

export const PlaceRowMode = {
  Idle: 'idle',
  ConfirmDelete: 'confirm-delete',
  // A visit toggle or delete is in flight.
  Busy: 'busy',
  // The list shows the edit form instead of the row.
  Editing: 'editing',
} as const;
export type PlaceRowMode = (typeof PlaceRowMode)[keyof typeof PlaceRowMode];

// One saved place. Presentational: the list's store owns the mode and handles the events.
@Component({
  selector: 'app-place-row',
  imports: [Button, CategoryLabelPipe, Icon, OsmUrlPipe, Tag, UrlHostPipe],
  templateUrl: './place-row.html',
  styleUrl: './place-row.css',
  host: {
    '[attr.data-mode]': 'mode()',
    '[attr.data-visited]': 'place().visitedByMe ? "" : null',
    '[attr.aria-busy]': 'mode() === PlaceRowMode.Busy',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceRow {
  readonly place = input.required<Place>();
  readonly mode = input<PlaceRowMode>(PlaceRowMode.Idle);

  readonly visitedToggled = output<void>();
  readonly editRequested = output<void>();
  readonly deleteRequested = output<void>();
  readonly deleteConfirmed = output<void>();
  readonly deleteCancelled = output<void>();

  protected readonly PlaceRowMode = PlaceRowMode;
}
