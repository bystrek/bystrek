import { describe, expect, it, mock } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import type { Db } from '../../src/calendar/calendar-copy-lock';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import { placeVisits } from '../../src/db/schema';
import {
  GEOCODER,
  GeocoderError,
  OsmType,
  type GeocodedLocation,
  type Geocoder,
} from '../../src/geo/geocoder';
import { PlaceCategory } from '../../src/places/place-category';
import type { Place } from '../../src/places/places.service';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

const CAMELOT: GeocodedLocation = {
  osmType: OsmType.Node,
  osmId: 12_345_678_901,
  displayAddress: 'Café Camelot, Świętego Tomasza 17, Kraków',
  lat: 50.0624,
  lng: 19.9389,
};
const RYNEK: GeocodedLocation = {
  osmType: OsmType.Way,
  osmId: 42,
  displayAddress: 'Rynek Główny 1, Kraków',
  lat: 50.0617,
  lng: 19.9373,
};

const camelot = {
  name: 'Café Camelot',
  category: PlaceCategory.Cafe,
  address: 'Świętego Tomasza 17, Kraków',
  notes: 'great cheesecake',
  osmType: CAMELOT.osmType,
  osmId: CAMELOT.osmId,
};

// An in-memory geocoder: `lookup` finds the `found` locations, `search` returns them all.
function fakeGeocoder(...locations: GeocodedLocation[]) {
  const state = { down: false, found: locations };
  const answer = <T>(value: () => T) =>
    state.down ? Promise.reject(new GeocoderError('down')) : Promise.resolve(value());
  const geocoder = {
    lookup: mock((type: OsmType, id: number) =>
      answer(() => state.found.find((l) => l.osmType === type && l.osmId === id) ?? null),
    ),
    search: mock((address: string) => answer(() => (address ? state.found : []))),
  } satisfies Geocoder;
  return Object.assign(state, geocoder);
}

async function setUp(db: Db, ...locations: GeocodedLocation[]) {
  const geocoder = fakeGeocoder(...locations);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DRIZZLE)
    .useValue(db)
    .overrideProvider(GEOCODER)
    .useValue(geocoder)
    .compile();
  const app: INestApplication = moduleRef.createNestApplication();
  await app.init();

  const as = async (email: string) => {
    const { user, token } = await signUpTestUser(db, { email, name: email.split('@')[0] });
    const auth = { Authorization: `Bearer ${token}` };
    const http = () => request(app.getHttpServer());
    return {
      user,
      get: (path: string) => http().get(path).set(auth),
      post: (path: string, body: object) => http().post(path).set(auth).send(body),
      patch: (path: string, body: object) => http().patch(path).set(auth).send(body),
      put: (path: string) => http().put(path).set(auth),
      delete: (path: string) => http().delete(path).set(auth),
    };
  };
  return { app, geocoder, as };
}

const list = (res: request.Response) => res.body as Place[];

describe('/places (integration)', () => {
  it('401s without a session token', async () => {
    await withRollback(testDb, async (tx) => {
      const { app } = await setUp(tx);

      expect((await request(app.getHttpServer()).get('/places')).status).toBe(401);

      await app.close();
    });
  });

  it('creates a place from the confirmed OSM object and lists it', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx, CAMELOT);
      const me = await as('me@example.com');

      const created = await me.post('/places', camelot);

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        name: 'Café Camelot',
        category: 'cafe',
        address: 'Świętego Tomasza 17, Kraków',
        displayAddress: CAMELOT.displayAddress,
        lat: CAMELOT.lat,
        lng: CAMELOT.lng,
        osmType: 'node',
        osmId: CAMELOT.osmId,
        notes: 'great cheesecake',
        url: null,
        createdBy: { id: me.user.id, name: 'me' },
        visitedByMe: false,
      });
      expect(list(await me.get('/places'))).toEqual([created.body as Place]);

      await app.close();
    });
  });

  it('ignores client-supplied coordinates', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx, CAMELOT);
      const me = await as('me@example.com');

      const created = await me.post('/places', {
        ...camelot,
        lat: 1,
        lng: 2,
        displayAddress: 'Somewhere else',
      });

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        lat: CAMELOT.lat,
        lng: CAMELOT.lng,
        displayAddress: CAMELOT.displayAddress,
      });

      await app.close();
    });
  });

  it('409s on a second place at the same OSM object', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx, CAMELOT);
      const me = await as('me@example.com');
      await me.post('/places', camelot);

      const again = await me.post('/places', { ...camelot, name: 'Camelot' });

      expect(again.status).toBe(409);
      expect(list(await me.get('/places'))).toHaveLength(1);

      await app.close();
    });
  });

  it('503s and saves nothing when the geocoder is down', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as, geocoder } = await setUp(tx, CAMELOT);
      const me = await as('me@example.com');
      geocoder.down = true;

      const res = await me.post('/places', camelot);

      expect(res.status).toBe(503);
      expect(list(await me.get('/places'))).toEqual([]);

      await app.close();
    });
  });

  it('422s when the OSM object no longer exists', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx);
      const me = await as('me@example.com');

      expect((await me.post('/places', camelot)).status).toBe(422);

      await app.close();
    });
  });

  it('400s on an invalid body', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx, CAMELOT);
      const me = await as('me@example.com');

      expect((await me.post('/places', { ...camelot, category: 'zoo' })).status).toBe(400);
      expect((await me.post('/places', { ...camelot, name: '  ' })).status).toBe(400);
      expect((await me.post('/places', { ...camelot, url: 'javascript:alert(1)' })).status).toBe(
        400,
      );
      expect((await me.post('/places', { ...camelot, osmId: undefined })).status).toBe(400);

      await app.close();
    });
  });

  it('keeps visits per user', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx, CAMELOT);
      const me = await as('me@example.com');
      const you = await as('you@example.com');
      const { id } = (await me.post('/places', camelot)).body as Place;

      expect((await me.put(`/places/${id}/visit`)).status).toBe(204);
      expect((await me.put(`/places/${id}/visit`)).status).toBe(204);

      expect(list(await me.get('/places'))[0].visitedByMe).toBe(true);
      expect(list(await you.get('/places'))[0].visitedByMe).toBe(false);

      expect((await me.delete(`/places/${id}/visit`)).status).toBe(204);
      expect(list(await me.get('/places'))[0].visitedByMe).toBe(false);

      await app.close();
    });
  });

  it('404s when marking a missing place visited', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx);
      const me = await as('me@example.com');

      expect((await me.put(`/places/${crypto.randomUUID()}/visit`)).status).toBe(404);
      expect((await me.put('/places/not-a-uuid/visit')).status).toBe(400);

      await app.close();
    });
  });

  it("lets any user delete a place, and the place's visits go with it", async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx, CAMELOT);
      const me = await as('me@example.com');
      const you = await as('you@example.com');
      const { id } = (await me.post('/places', camelot)).body as Place;
      await me.put(`/places/${id}/visit`);
      await you.put(`/places/${id}/visit`);

      expect((await you.delete(`/places/${id}`)).status).toBe(204);

      expect(list(await me.get('/places'))).toEqual([]);
      expect(await tx.select().from(placeVisits)).toEqual([]);
      expect((await you.delete(`/places/${id}`)).status).toBe(404);

      await app.close();
    });
  });

  it('lets any user edit a place without geocoding when the address is unchanged', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as, geocoder } = await setUp(tx, CAMELOT);
      const me = await as('me@example.com');
      const you = await as('you@example.com');
      const { id } = (await me.post('/places', camelot)).body as Place;
      geocoder.down = true;

      const res = await you.patch(`/places/${id}`, {
        notes: '',
        url: 'https://camelot.pl',
        address: camelot.address,
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        notes: null,
        url: 'https://camelot.pl',
        name: camelot.name,
      });
      expect(geocoder.search).not.toHaveBeenCalled();

      await app.close();
    });
  });

  it('re-geocodes a changed address', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as, geocoder } = await setUp(tx, CAMELOT);
      const me = await as('me@example.com');
      const { id } = (await me.post('/places', camelot)).body as Place;
      geocoder.found = [RYNEK, CAMELOT];

      const res = await me.patch(`/places/${id}`, { address: 'Rynek Główny 1, Kraków' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        address: 'Rynek Główny 1, Kraków',
        displayAddress: RYNEK.displayAddress,
        lat: RYNEK.lat,
        osmType: 'way',
        osmId: 42,
      });

      await app.close();
    });
  });

  it('blocks an address change the geocoder cannot resolve', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as, geocoder } = await setUp(tx, CAMELOT);
      const me = await as('me@example.com');
      const { id } = (await me.post('/places', camelot)).body as Place;
      const patch = { address: 'Nowhere 1', name: 'Renamed' };

      geocoder.down = true;
      expect((await me.patch(`/places/${id}`, patch)).status).toBe(503);
      geocoder.down = false;
      geocoder.found = [];
      expect((await me.patch(`/places/${id}`, patch)).status).toBe(422);

      expect(list(await me.get('/places'))[0]).toMatchObject({
        name: camelot.name,
        address: camelot.address,
      });

      await app.close();
    });
  });

  it('409s when a new address lands on another place', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as, geocoder } = await setUp(tx, CAMELOT, RYNEK);
      const me = await as('me@example.com');
      const { id } = (await me.post('/places', camelot)).body as Place;
      await me.post('/places', { ...camelot, name: 'Rynek', osmType: RYNEK.osmType, osmId: 42 });
      geocoder.found = [RYNEK];

      expect((await me.patch(`/places/${id}`, { address: 'Rynek 1' })).status).toBe(409);

      await app.close();
    });
  });
});
