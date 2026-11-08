import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAX_DRAFT_TEXT_LENGTH } from '../../core/places/place-draft.service';
import { Button } from '../../shared/button/button';
import { CommandBar } from '../../shared/command-bar/command-bar';
import { CommandResult } from '../../shared/command-bar/command-result';
import { Tag } from '../../shared/tag/tag';
import { OsmAttribution } from './osm-attribution';
import { PlaceBarStore } from './place-bar-store';
import { CategoryLabelPipe, MissingItemPipe, OsmUrlPipe, UrlHostPipe } from './place-pipes';

// The /places command bar. Unlike the agenda's, the prompt stays in the input after a draft so
// it can be refined, and clears only after a save or cancel.
@Component({
  selector: 'app-place-bar',
  imports: [
    Button,
    CategoryLabelPipe,
    CommandBar,
    CommandResult,
    MissingItemPipe,
    OsmAttribution,
    OsmUrlPipe,
    Tag,
    UrlHostPipe,
  ],
  templateUrl: './place-bar.html',
  styleUrl: './place-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceBar {
  protected readonly store = inject(PlaceBarStore);
  protected readonly maxLength = MAX_DRAFT_TEXT_LENGTH;
}
