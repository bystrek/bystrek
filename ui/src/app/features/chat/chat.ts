import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  ViewEncapsulation,
  afterNextRender,
  afterRenderEffect,
  inject,
  signal,
} from '@angular/core';
import { FormField, FormRoot, disabled, form, required } from '@angular/forms/signals';
import { ChatService } from '../../core/chat/chat.service';
import { MarkdownPipe } from '../../core/chat/markdown.pipe';
import { StatusBanner } from '../../shared/status-banner/status-banner';

@Component({
  selector: 'app-chat',
  imports: [FormField, FormRoot, MarkdownPipe, StatusBanner],
  templateUrl: './chat.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './chat.css',
  // Bubble content comes in via [innerHTML], which never gets the
  // _ngcontent attribute emulated encapsulation scopes styles by — so the
  // `.bubble p` etc. rules would never match. Styles are global; every
  // selector in chat.css is rooted at the `app-chat` host element.
  encapsulation: ViewEncapsulation.None,
})
export class Chat implements OnInit {
  protected readonly chat = inject(ChatService);

  @ViewChild('scrollAnchor') private scrollAnchor?: ElementRef<HTMLElement>;

  private readonly model = signal({ draft: '' });
  protected readonly draftForm = form(this.model, (path) => {
    required(path.draft);
    disabled(path.draft, { when: () => this.chat.sending() });
  });

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

  // The message list doesn't scroll itself — the nearest scrollable
  // ancestor (the layout's content pane) does, so the scrollbar sits at the
  // pane's edge and messages run under the sticky input. Resolved from the
  // DOM rather than injected so this component doesn't depend on the
  // layout's markup.
  private scrollContainer: HTMLElement | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const container = this.resolveScrollContainer();
      if (!container) return;
      const onScroll = () => this.onScroll(container);
      container.addEventListener('scroll', onScroll, { passive: true });
      destroyRef.onDestroy(() => container.removeEventListener('scroll', onScroll));
    });

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

      // Scroll to the very end rather than scrollIntoView on the anchor:
      // the input is sticky over the bottom of the scrollport, and
      // scrollIntoView would park the anchor underneath it.
      const container = this.resolveScrollContainer();
      if (this.pinnedToBottom && container) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }

  ngOnInit(): void {
    void this.chat.loadHistory();
  }

  private onScroll(container: HTMLElement): void {
    this.pinnedToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  }

  private resolveScrollContainer(): HTMLElement | null {
    if (this.scrollContainer) return this.scrollContainer;
    const anchor = this.scrollAnchor?.nativeElement;
    if (!anchor) return null;
    for (
      let el = anchor.parentElement;
      el && el !== anchor.ownerDocument.body;
      el = el.parentElement
    ) {
      const { overflowY } = getComputedStyle(el);
      if (overflowY === 'auto' || overflowY === 'scroll') {
        this.scrollContainer = el;
        return el;
      }
    }
    this.scrollContainer = anchor.ownerDocument.scrollingElement as HTMLElement | null;
    return this.scrollContainer;
  }

  send(): void {
    const text = this.model().draft.trim();
    if (!text) return;
    this.chat.send(text);
    this.model.set({ draft: '' });
  }
}
