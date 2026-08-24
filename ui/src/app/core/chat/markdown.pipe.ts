import { Pipe, PipeTransform } from '@angular/core';
import { renderMarkdown } from './markdown';

// Pure by default: Angular only re-invokes transform() when `text` actually
// changes, so re-rendering one streamed message doesn't re-parse/sanitize
// every other bubble in the history on each change-detection pass.
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(text: string): string {
    return renderMarkdown(text);
  }
}
