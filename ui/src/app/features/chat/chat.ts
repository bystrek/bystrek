import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  afterRenderEffect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../core/chat/chat.service';
import { MarkdownPipe } from '../../core/chat/markdown.pipe';

@Component({
  selector: 'app-chat',
  imports: [FormsModule, MarkdownPipe],
  templateUrl: './chat.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './chat.css',
})
export class Chat implements OnInit {
  protected readonly chat = inject(ChatService);

  @ViewChild('scrollAnchor') private scrollAnchor?: ElementRef<HTMLElement>;

  readonly draft = signal('');

  // Tracks the last message content actually rendered, so the render effect
  // (which fires on every render whose reactive dependencies change,
  // including unrelated ones like typing in the input) only auto-scrolls
  // when a message was added or grew — not on every keystroke.
  private lastRenderedMessages = '';

  // Whether the user was scrolled to the bottom the last time they actually
  // scrolled — deliberately NOT recomputed from post-update DOM
  // measurements after the message list grows, since by that point the
  // new message has already grown scrollHeight, making "am I near the
  // bottom" look false for any message taller than the threshold even
  // when the user was sitting exactly at the bottom beforehand. A plain
  // `scroll` event only fires on genuine user scrolling (the browser
  // doesn't move scrollTop just because content was appended below), so
  // it reflects real intent instead.
  private pinnedToBottom = true;

  constructor() {
    // afterRenderEffect (not ngAfterViewChecked) because change detection is
    // zoneless: an async signal update (e.g. history arriving from the
    // network) patches the DOM through the reactive graph without running
    // the classic view-checked lifecycle, so ngAfterViewChecked never
    // fired for the update that actually needed the scroll.
    afterRenderEffect(() => {
      const snapshot = this.chat
        .messages()
        .map((m) => m.text.length)
        .join(',');
      if (snapshot === this.lastRenderedMessages) return;
      this.lastRenderedMessages = snapshot;

      if (this.pinnedToBottom) {
        this.scrollAnchor?.nativeElement.scrollIntoView({ block: 'end' });
      }
    });
  }

  ngOnInit(): void {
    void this.chat.loadHistory();
  }

  onScroll(): void {
    const container = this.scrollAnchor?.nativeElement.parentElement;
    if (!container) return;
    this.pinnedToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  }

  send(): void {
    const text = this.draft().trim();
    if (!text) return;
    this.chat.send(text);
    this.draft.set('');
  }
}
