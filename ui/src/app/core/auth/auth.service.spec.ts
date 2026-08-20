import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('initSession resolves to no session, with zero HTTP calls, when no token is stored', async () => {
    await service.initSession();

    expect(service.session()).toBeNull();
    httpMock.expectNone(`${environment.apiUrl}/api/auth/get-session`);
  });

  it('initSession resolves a session from get-session when a token is stored', async () => {
    localStorage.setItem('bystrek_token', 'existing-token');

    const pending = service.initSession();
    const req = httpMock.expectOne(`${environment.apiUrl}/api/auth/get-session`);
    req.flush({ user: { id: '1', name: 'Me', role: 'user' } });
    await pending;

    expect(service.session()).toEqual({ user: { id: '1', name: 'Me', role: 'user' } });
  });

  it('signIn stores the bearer token from the set-auth-token response header', async () => {
    const pending = service.signIn('me@example.com', 'password');

    const req = httpMock.expectOne(`${environment.apiUrl}/api/auth/sign-in/email`);
    req.flush({}, { headers: { 'set-auth-token': 'fake-token' } });
    await pending;

    expect(localStorage.getItem('bystrek_token')).toBe('fake-token');
  });

  it('signIn throws when no set-auth-token header is present', async () => {
    const pending = service.signIn('me@example.com', 'password');

    const req = httpMock.expectOne(`${environment.apiUrl}/api/auth/sign-in/email`);
    req.flush({});

    await expect(pending).rejects.toThrow('no session token was returned');
    expect(localStorage.getItem('bystrek_token')).toBeNull();
  });
});
