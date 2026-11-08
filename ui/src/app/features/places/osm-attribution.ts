import { ChangeDetectionStrategy, Component } from '@angular/core';

// Required (ODbL) wherever geocoded addresses or coordinates from OpenStreetMap are shown.
@Component({
  selector: 'app-osm-attribution',
  template: `©
    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener"
      >OpenStreetMap</a
    >
    contributors`,
  styles: `
    a {
      color: inherit;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OsmAttribution {}
