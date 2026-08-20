import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import {
  BookingAuthGuard,
  LOGIN_REDIRECT_KEY,
  LOGIN_MESSAGE_KEY,
} from './booking-auth.guard';
import { AuthService } from '../Premium/services/auth.service';

describe('BookingAuthGuard', () => {
  let guard: BookingAuthGuard;
  let router: Router;
  let authService: { isLoggedIn: boolean };
  let navigateSpy: jasmine.Spy;

  const fakeRoute = {} as ActivatedRouteSnapshot;
  const fakeState = (url: string) => ({ url } as RouterStateSnapshot);

  beforeEach(() => {
    authService = { isLoggedIn: false };

    TestBed.configureTestingModule({
      imports: [RouterTestingModule.withRoutes([])],
      providers: [
        BookingAuthGuard,
        { provide: AuthService, useValue: authService },
      ],
    });

    guard = TestBed.inject(BookingAuthGuard);
    router = TestBed.inject(Router);
    navigateSpy = spyOn(router, 'navigateByUrl');
    sessionStorage.clear();
  });

  it('allows a logged-in user through', () => {
    authService.isLoggedIn = true;
    expect(guard.canActivate(fakeRoute, fakeState('/payment'))).toBe(true);
  });

  it('redirects a guest to /login carrying the intended URL as a query param', () => {
    const result = guard.canActivate(fakeRoute, fakeState('/payment?bus=1&seats=12,13'));

    expect(result).toBeInstanceOf(UrlTree);
    const tree = result as UrlTree;
    expect(tree.root.children['primary']?.segments.map((s) => s.path).join('/')).toBe(
      'login'
    );
    expect(tree.queryParams['redirect']).toBe('/payment?bus=1&seats=12,13');
  });

  it('attaches the auth.loginToContinue message so /login can explain the detour', () => {
    const result = guard.canActivate(fakeRoute, fakeState('/booking-confirmation/ABC123')) as UrlTree;
    expect(result.queryParams['message']).toBe(LOGIN_MESSAGE_KEY);
  });

  it('remembers the exact target URL so the booking resumes after login', () => {
    const url = '/payment?bus=abc&from=BLR&to=MAI&date=2026-08-20&seats=4,5&passengers=2';
    guard.canActivate(fakeRoute, fakeState(url));

    expect(sessionStorage.getItem(LOGIN_REDIRECT_KEY)).toBe(url);
  });
});
