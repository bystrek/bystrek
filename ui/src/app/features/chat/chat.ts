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
import { ChatService } from '../../core/chat/chat.service';
import { renderMarkdown } from '../../core/chat/markdown';

@Component({
  selector: 'app-chat',
  imports: [FormsModule],
  templateUrl: './chat.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './chat.css',
})
export class Chat implements OnInit, AfterViewChecked {
  protected readonly chat = inject(ChatService);
  protected readonly renderMarkdown = renderMarkdown;

  @ViewChild('scrollAnchor') private scrollAnchor?: ElementRef<HTMLElement>;

  readonly draft = signal('');

  // Tracks the last message content actually rendered, so `ngAfterViewChecked`
  // (which fires on every change detection pass, including unrelated ones
  // like typing in the input) only auto-scrolls when a message was added or
  // grew — not on every keystroke.
  private lastRenderedMessages = '';

  // Whether the user was scrolled to the bottom the last time they actually
  // scrolled — deliberately NOT recomputed from post-update DOM
  // measurements in ngAfterViewChecked, since by the time that runs the
  // new message has already grown scrollHeight, making "am I near the
  // bottom" look false for any message taller than the threshold even
  // when the user was sitting exactly at the bottom beforehand. A plain
  // `scroll` event only fires on genuine user scrolling (the browser
  // doesn't move scrollTop just because content was appended below), so
  // it reflects real intent instead.
  private pinnedToBottom = true;

  ngOnInit(): void {
    void this.chat.loadHistory();
  }

  onScroll(): void {
    const container = this.scrollAnchor?.nativeElement.parentElement;
    if (!container) return;
    this.pinnedToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  }

  ngAfterViewChecked(): void {
    const snapshot = this.chat
      .messages()
      .map((m) => m.text.length)
      .join(',');
    if (snapshot === this.lastRenderedMessages) return;
    this.lastRenderedMessages = snapshot;

    if (this.pinnedToBottom) {
      this.scrollAnchor?.nativeElement.scrollIntoView({ block: 'end' });
    }
  }

  send(): void {
    const text = this.draft().trim();
    if (!text) return;
    this.chat.send(text);
    this.draft.set('');
  }
}
