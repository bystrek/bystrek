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

  ngOnInit(): void {
    void this.chat.loadHistory();
  }

  ngAfterViewChecked(): void {
    this.scrollAnchor?.nativeElement.scrollIntoView({ block: 'end' });
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
