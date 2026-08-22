import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChatService } from '../../core/chat/chat.service';

@Component({
  selector: 'app-chat',
  imports: [FormsModule],
  templateUrl: './chat.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './chat.css',
})
export class Chat implements OnInit, AfterViewChecked {
  protected readonly chat = inject(ChatService);
  private readonly router = inject(Router);

  @ViewChild('scrollAnchor') private scrollAnchor?: ElementRef<HTMLElement>;

  readonly draft = signal('');

  // Tracks the last message content actually rendered, so `ngAfterViewChecked`
  // (which fires on every change detection pass, including unrelated ones
  // like typing in the input) only auto-scrolls when a message was added or
  // grew — not on every keystroke.
  private lastRenderedMessages = '';

  ngOnInit(): void {
    void this.chat.loadHistory();
  }

  ngAfterViewChecked(): void {
    const snapshot = this.chat
      .messages()
      .map((m) => m.text.length)
      .join(',');
    if (snapshot === this.lastRenderedMessages) return;
    this.lastRenderedMessages = snapshot;

    const anchor = this.scrollAnchor?.nativeElement;
    const container = anchor?.parentElement;
    if (!anchor || !container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    if (nearBottom) {
      anchor.scrollIntoView({ block: 'end' });
    }
  }

  send(): void {
    const text = this.draft().trim();
    if (!text) return;
    this.chat.send(text);
    this.draft.set('');
  }

  async back(): Promise<void> {
    await this.router.navigateByUrl('/');
  }
}
