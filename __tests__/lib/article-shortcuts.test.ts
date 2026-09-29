import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { articleShortcut } from "../../src/lib/article-shortcuts";

const dom = new JSDOM('<body><p>Article</p><input><div contenteditable="true"><span>editing</span></div><div role="dialog"><button>Close</button></div></body>');
function key(key: string, selector = 'p', options: KeyboardEventInit = {}) {
  const event = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  dom.window.document.querySelector(selector)!.dispatchEvent(event);
  return event;
}
describe('article keyboard shortcuts', () => {
  it('maps left and right to the displayed article order', () => {
    expect(articleShortcut(key('ArrowLeft'))).toBe('previous');
    expect(articleShortcut(key('ArrowRight'))).toBe('next');
    expect(articleShortcut(key('ArrowDown'))).toBeNull();
  });
  it('preserves editing and dialog keyboard controls', () => {
    expect(articleShortcut(key('ArrowRight', 'input'))).toBeNull();
    expect(articleShortcut(key('ArrowRight', 'span'))).toBeNull();
    expect(articleShortcut(key('ArrowRight', 'button'))).toBeNull();
  });
  it('ignores composition, repeats, modifiers and handled events', () => {
    for (const options of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { repeat: true }, { isComposing: true }]) {
      expect(articleShortcut(key('ArrowRight', 'p', options))).toBeNull();
    }
    const handled = key('ArrowRight');
    handled.preventDefault();
    expect(articleShortcut(handled)).toBeNull();
  });
});
