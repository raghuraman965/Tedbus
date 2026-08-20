import { Subject } from 'rxjs';
import { ViewSeatsComponent } from './view-seats.component';
import { LoginModalComponent } from '../../../../Premium/components/login-modal/login-modal.component';

// The Proceed-to-Book auth gate is unit-tested by constructing the component
// directly with mocked collaborators — no template compilation, no TestBed
// module wiring — so the exact gate logic is what gets exercised:
//   guest  -> login modal opens (booking state preserved) -> resume on success
//   logged -> seats validated immediately, no modal.
describe('ViewSeatsComponent proceedToBook login gate', () => {
  let snackBar: jasmine.SpyObj<any>;
  let translate: any;
  let busService: jasmine.SpyObj<any>;
  let authService: { isLoggedIn: boolean };
  let dialog: jasmine.SpyObj<any>;
  let router: jasmine.SpyObj<any>;
  let component: ViewSeatsComponent;

  beforeEach(() => {
    snackBar = jasmine.createSpyObj('MatSnackBar', ['open']);
    translate = { instant: (key: string) => key };
    busService = jasmine.createSpyObj('BusService', ['validateSeats']);
    authService = { isLoggedIn: false };
    dialog = jasmine.createSpyObj('MatDialog', ['open']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    // Default dialog handle: a modal that never closes. Tests that need to
    // simulate a login/dismiss override this via dialog.open.and.returnValue.
    dialog.open.and.returnValue({
      afterClosed: () => new Subject<boolean>(),
    });

    component = new ViewSeatsComponent(
      snackBar,
      translate,
      busService,
      authService as any,
      dialog,
      router
    );
    component.busid = 'bus1';
    component.date = '2026-08-20';
  });

  it('blocks a guest before any seat validation and opens the login modal with the resume message', () => {
    component.selectedseats = [5, 6];
    component.proceedToBook();

    expect(dialog.open).toHaveBeenCalledWith(
      LoginModalComponent,
      jasmine.objectContaining({ data: { message: 'auth.loginToContinue' } })
    );
    expect(busService.validateSeats).not.toHaveBeenCalled();
  });

  it('after a successful login re-runs the blocked action (validates the same seats)', () => {
    const afterClosed = new Subject<boolean>();
    dialog.open.and.returnValue({ afterClosed: () => afterClosed.asObservable() });
    busService.validateSeats.and.returnValue(
      new Subject() // should never be subscribed to before login completes
    );
    component.selectedseats = [5, 6];

    component.proceedToBook();
    expect(dialog.open).toHaveBeenCalled();
    expect(busService.validateSeats).not.toHaveBeenCalled();

    // User logs in inside the modal, then closes it successfully.
    authService.isLoggedIn = true;
    afterClosed.next(true);
    afterClosed.complete();

    expect(busService.validateSeats).toHaveBeenCalledWith({
      busId: 'bus1',
      date: '2026-08-20',
      seats: [5, 6],
    });
  });

  it('does nothing when the login modal is dismissed without logging in', () => {
    const afterClosed = new Subject<boolean>();
    dialog.open.and.returnValue({ afterClosed: () => afterClosed.asObservable() });
    component.selectedseats = [5, 6];

    component.proceedToBook();
    afterClosed.next(false);
    afterClosed.complete();

    expect(busService.validateSeats).not.toHaveBeenCalled();
  });

  it('validates seats immediately for a logged-in user, no modal involved', () => {
    authService.isLoggedIn = true;
    component.selectedseats = [1];
    busService.validateSeats.and.returnValue(new Subject());

    component.proceedToBook();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(busService.validateSeats).toHaveBeenCalled();
  });

  it('is a no-op when no seats are selected or a validation is already running', () => {
    component.selectedseats = [];
    component.proceedToBook();
    expect(dialog.open).not.toHaveBeenCalled();
    expect(busService.validateSeats).not.toHaveBeenCalled();

    component.selectedseats = [1];
    component.proceeding = true;
    component.proceedToBook();
    expect(busService.validateSeats).not.toHaveBeenCalled();
  });
});
