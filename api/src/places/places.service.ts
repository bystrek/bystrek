import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, ne } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../db/drizzle.provider';
import * as schema from '../db/schema';
import { places, placeVisits, users } from '../db/schema';
import { GEOCODER, type GeocodedLocation, type Geocoder, type OsmType } from '../geo/geocoder';
import { locateAddress, locateOsmObject } from './locate-place';
import type { PlaceCategory } from './place-category';
import type { NewPlaceDto, PlacePatchDto } from './place.dto';
import { DuplicatePlaceError, PlaceNotFoundError } from './places.errors';

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  address: string;
  displayAddress: string;
  lat: number;
  lng: number;
  osmType: OsmType;
  osmId: number;
  notes: string | null;
  url: string | null;
  createdBy: { id: string; name: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
  visitedByMe: boolean;
}

// Places are shared: any user may create, edit or delete any of them. Visits are per user
// (PlaceVisitsService); the listing reads the current user's.
@Injectable()
export class PlacesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    @Inject(GEOCODER) private readonly geocoder: Geocoder,
  ) {}

  // Every place, newest first. No paging: the UI searches the full set in memory.
  list(userId: string): Promise<Place[]> {
    return this.select(userId).orderBy(desc(places.createdAt), places.id);
  }

  async get(userId: string, id: string): Promise<Place> {
    const [place] = await this.select(userId).where(eq(places.id, id));
    if (!place) throw new PlaceNotFoundError(id);
    return place;
  }

  // The place already saved at an OSM object, if any.
  async findByOsm(userId: string, osmType: OsmType, osmId: number): Promise<Place | undefined> {
    const [place] = await this.select(userId).where(
      and(eq(places.osmType, osmType), eq(places.osmId, osmId)),
    );
    return place;
  }

  // Coordinates come from looking up the confirmed OSM object, never from the client.
  async create(userId: string, input: NewPlaceDto): Promise<Place> {
    const location = await locateOsmObject(this.geocoder, input.osmType, input.osmId);
    const [row] = await this.db
      .insert(places)
      .values({
        name: input.name,
        category: input.category,
        address: input.address,
        notes: input.notes ?? null,
        url: input.url ?? null,
        ...location,
        createdBy: userId,
      })
      // Not a caught unique violation: that would abort the surrounding transaction.
      .onConflictDoNothing({ target: [places.osmType, places.osmId] })
      .returning({ id: places.id });
    if (!row) throw new DuplicatePlaceError();
    return this.get(userId, row.id);
  }

  // A changed address is geocoded again; if that fails, nothing is updated.
  async update(userId: string, id: string, patch: PlacePatchDto): Promise<Place> {
    const [current] = await this.db
      .select({ address: places.address })
      .from(places)
      .where(eq(places.id, id));
    if (!current) throw new PlaceNotFoundError(id);

    let location: GeocodedLocation | undefined;
    if (patch.address !== undefined && patch.address !== current.address) {
      location = await locateAddress(this.geocoder, patch.address);
      if (await this.isTaken(location, id)) throw new DuplicatePlaceError();
    }

    await this.db
      .update(places)
      .set({ ...patch, ...location })
      .where(eq(places.id, id));
    return this.get(userId, id);
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.db
      .delete(places)
      .where(eq(places.id, id))
      .returning({ id: places.id });
    if (!deleted.length) throw new PlaceNotFoundError(id);
  }

  private select(userId: string) {
    return this.db
      .select({
        id: places.id,
        name: places.name,
        category: places.category,
        address: places.address,
        displayAddress: places.displayAddress,
        lat: places.lat,
        lng: places.lng,
        osmType: places.osmType,
        osmId: places.osmId,
        notes: places.notes,
        url: places.url,
        createdBy: { id: users.id, name: users.name },
        createdAt: places.createdAt,
        updatedAt: places.updatedAt,
        visitedByMe: isNotNull(placeVisits.userId).mapWith(Boolean),
      })
      .from(places)
      .leftJoin(users, eq(users.id, places.createdBy))
      .leftJoin(
        placeVisits,
        and(eq(placeVisits.placeId, places.id), eq(placeVisits.userId, userId)),
      )
      .$dynamic();
  }

  // Checked up front rather than caught, for the same reason as in `create`. A concurrent
  // save of the same OSM object can still hit the unique index and fail the request.
  private async isTaken(location: GeocodedLocation, exceptId: string): Promise<boolean> {
    const [other] = await this.db
      .select({ id: places.id })
      .from(places)
      .where(
        and(
          eq(places.osmType, location.osmType),
          eq(places.osmId, location.osmId),
          ne(places.id, exceptId),
        ),
      );
    return !!other;
  }
}
