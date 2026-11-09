import {
  ChangeDetectionStrategy,
  Component,
  Pipe,
  PipeTransform,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Alert } from '../../shared/alert/alert';
import { Button } from '../../shared/button/button';
import { Card } from '../../shared/card/card';
import { Stack } from '../../shared/stack/stack';

// Error codes from Pocket ID (OAuth), better-auth's callback and the sign-in callback route.
const SIGN_IN_ERRORS: Record<string, string> = {
  access_denied: "Your Pocket ID account doesn't have access to bystrek.",
  invalid_token: 'That sign-in link has expired. Try again.',
  state_mismatch: "That sign-in wasn't started in this tab. Sign in here instead.",
};

@Pipe({ name: 'signInError' })
export class SignInErrorPipe implements PipeTransform {
  transform(code: string): string {
    return SIGN_IN_ERRORS[code] ?? `Sign in failed (${code}). Try again.`;
  }
}

@Component({
  selector: 'app-login',
  imports: [Alert, Button, Card, Stack, SignInErrorPipe],
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './login.css',
})
export class Login {
  private readonly auth = inject(AuthService);

  readonly error = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('error'));
  signIn(): void {
    this.auth.startSignIn();
  }
}
