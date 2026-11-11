import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { ApiToken, ApiTokensService } from './api-tokens.service';

const token: ApiToken = {
  id: 't1',
  name: 'Health',
  start: 'bystrek_abcd',
  createdAt: '2026-11-11T10:00:00.000Z',
  lastRequest: null,
};

describe('ApiTokensService', () => {
  let service: ApiTokensService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: { apiUrl: '/api' } },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ApiTokensService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('creates a token, returns it once and reloads the list', async () => {
    const created = service.create('  Health  ');
    const request = httpMock.expectOne('/api/api/auth/api-key/create');
    expect(request.request.body).toEqual({ name: 'Health' });
    request.flush({ ...token, key: 'bystrek_secret' });
    await Promise.resolve();
    httpMock.expectOne('/api/api/auth/api-key/list').flush({ apiKeys: [token] });

    expect(await created).toBe('bystrek_secret');
    expect(service.tokens()).toEqual([token]);
  });

  it('revokes a token by id and reloads the list', async () => {
    const revoked = service.revoke('t1');
    const request = httpMock.expectOne('/api/api/auth/api-key/delete');
    expect(request.request.body).toEqual({ keyId: 't1' });
    request.flush({ success: true });
    await Promise.resolve();
    httpMock.expectOne('/api/api/auth/api-key/list').flush({ apiKeys: [] });

    await revoked;
    expect(service.tokens()).toEqual([]);
  });

  it("reports the API's message when creating fails", async () => {
    const created = service.create('x'.repeat(40));
    httpMock
      .expectOne('/api/api/auth/api-key/create')
      .flush({ message: 'Name is too long.' }, { status: 400, statusText: 'Bad Request' });

    await expect(created).rejects.toThrow('Name is too long.');
  });
});
