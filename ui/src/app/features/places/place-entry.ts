import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { PlaceForm } from './place-form';
import { PlaceRow, PlaceRowMode } from './place-row';
import { PlaceListRow, PlacesStore } from './places-store';

// A place as the list and the map card show it: the row, or its edit form, wired to the store.
@Component({
  selector: 'app-place-entry',
  imports: [PlaceForm, PlaceRow],
  template: `
    @let place = row().place;
    @if (row().mode === PlaceRowMode.Editing) {
      <app-place-form [place]="place" />
    } @else {
      <app-place-row
        [place]="place"
        [mode]="row().mode"
        (visitedToggled)="store.toggleVisited(place.id)"
        (editRequested)="store.startEdit(place.id)"
        (deleteRequested)="store.askDelete(place.id)"
        (deleteConfirmed)="store.confirmDelete(place.id)"
        (deleteCancelled)="store.cancelDelete()"
      />
    }
  `,
  styles: `
    :host {
      display: block;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceEntry {
  readonly row = input.required<PlaceListRow>();
  protected readonly store = inject(PlacesStore);
  protected readonly PlaceRowMode = PlaceRowMode;
}
