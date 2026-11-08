import { ChangeDetectionStrategy, Component, inject, input, linkedSignal } from '@angular/core';
import { FormField, FormRoot, form, required } from '@angular/forms/signals';
import { Place, PlaceCategory } from '../../core/places/places.service';
import { Button } from '../../shared/button/button';
import { OsmAttribution } from './osm-attribution';
import { CategoryLabelPipe } from './place-pipes';
import { PlacesStore } from './places-store';

// Blank notes and url are sent as '' and cleared by the API.
const toFormValue = (place: Place) => ({
  name: place.name,
  category: place.category,
  address: place.address,
  notes: place.notes ?? '',
  url: place.url ?? '',
});

// The minimal edit form that replaces a row while it is being edited.
@Component({
  selector: 'app-place-form',
  imports: [Button, CategoryLabelPipe, FormField, FormRoot, OsmAttribution],
  templateUrl: './place-form.html',
  styleUrl: './place-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceForm {
  protected readonly store = inject(PlacesStore);
  readonly place = input.required<Place>();

  private readonly model = linkedSignal(() => toFormValue(this.place()));
  protected readonly editForm = form(
    this.model,
    (path) => {
      required(path.name, { message: 'Enter a name.' });
      required(path.address, { message: 'Enter an address.' });
    },
    {
      submission: {
        // The API's message (e.g. "Couldn't find that address") shows under the form.
        action: async () => {
          try {
            await this.store.save(this.place().id, this.model());
            return undefined;
          } catch (err) {
            return { kind: 'server', message: (err as Error).message };
          }
        },
      },
    },
  );

  protected readonly categories = Object.values(PlaceCategory);
}
