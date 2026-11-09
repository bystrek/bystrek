import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { AuthService, SignInStateMismatch } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: { apiUrl: '/api' } },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
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
    httpMock.expectNone(`/api/api/auth/get-session`);
  });

  it('initSession resolves a session from get-session when a token is stored', async () => {
    localStorage.setItem('bystrek_token', 'existing-token');

    const pending = service.initSession();
    const req = httpMock.expectOne(`/api/api/auth/get-session`);
    req.flush({
      user: { id: '1', name: 'Me', role: 'user', firstName: null, lastName: null, image: null },
    });
    await pending;

    expect(service.session()).toEqual({
      user: { id: '1', name: 'Me', role: 'user', firstName: null, lastName: null, image: null },
    });
  });

  it('completeSignIn swaps the one-time token for a bearer token, then loads the session', async () => {
    sessionStorage.setItem('bystrek_sign_in_state', 'state-1');
    const pending = service.completeSignIn('one-time', 'state-1');

    const verifyReq = httpMock.expectOne(`/api/api/auth/one-time-token/verify`);
    expect(verifyReq.request.body).toEqual({ token: 'one-time' });
    verifyReq.flush({}, { headers: { 'set-auth-token': 'fake-token' } });
    await Promise.resolve();

    httpMock.expectOne(`/api/api/auth/get-session`).flush({
      user: { id: '1', name: 'Me', role: 'user', firstName: null, lastName: null, image: null },
    });
    await pending;

    expect(localStorage.getItem('bystrek_token')).toBe('fake-token');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('completeSignIn refuses a callback this tab did not start, without redeeming the token', async () => {
    sessionStorage.setItem('bystrek_sign_in_state', 'mine');

    await expect(service.completeSignIn('forwarded', 'someone-else')).rejects.toThrow(
      SignInStateMismatch,
    );
    httpMock.expectNone(`/api/api/auth/one-time-token/verify`);
    expect(sessionStorage.getItem('bystrek_sign_in_state')).toBeNull();
  });

  it('completeSignIn throws when the one-time token is rejected', async () => {
    sessionStorage.setItem('bystrek_sign_in_state', 'state-1');
    const pending = service.completeSignIn('used', 'state-1');

    httpMock
      .expectOne(`/api/api/auth/one-time-token/verify`)
      .flush({ message: 'Invalid token' }, { status: 400, statusText: 'Bad Request' });

    await expect(pending).rejects.toThrow('Invalid token');
    expect(localStorage.getItem('bystrek_token')).toBeNull();
  });

  it('updateProfile posts the derived name plus split fields, then refreshes the session', async () => {
    localStorage.setItem('bystrek_token', 'existing-token');

    const pending = service.updateProfile('Michał', 'B', 'data:image/jpeg;base64,abc');

    const updateReq = httpMock.expectOne(`/api/api/auth/update-user`);
    expect(updateReq.request.body).toEqual({
      name: 'Michał B',
      firstName: 'Michał',
      lastName: 'B',
      image: 'data:image/jpeg;base64,abc',
    });
    updateReq.flush({ status: true });
    await Promise.resolve();

    const sessionReq = httpMock.expectOne(`/api/api/auth/get-session`);
    sessionReq.flush({
      user: {
        id: '1',
        name: 'Michał B',
        role: 'user',
        firstName: 'Michał',
        lastName: 'B',
        image: 'data:image/jpeg;base64,abc',
      },
    });
    await pending;

    expect(service.session()?.user.firstName).toBe('Michał');
  });

  it('updateProfile rejects whitespace-only names without sending a request', async () => {
    await expect(service.updateProfile('  ', 'B', null)).rejects.toThrow(
      'First and last name are required.',
    );
    httpMock.expectNone(`/api/api/auth/update-user`);
  });

  it('updateProfile throws on a failed request without refreshing the session', async () => {
    const pending = service.updateProfile('Michał', 'B', null);

    const updateReq = httpMock.expectOne(`/api/api/auth/update-user`);
    updateReq.flush({ message: 'nope' }, { status: 400, statusText: 'Bad Request' });

    await expect(pending).rejects.toThrow('nope');
    httpMock.expectNone(`/api/api/auth/get-session`);
  });
});
