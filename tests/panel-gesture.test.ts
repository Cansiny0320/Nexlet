import { describe, it, expect } from 'vite-plus/test';
import { PanelGesture } from '../src/main/panel-gesture';
const event = (type: 'down' | 'up' | 'move', time: number, x = 10, button = 'right') => ({
  type,
  time,
  x,
  y: 20,
  button,
});
describe('panel gesture', () => {
  it('replays an ordinary right click once', () => {
    const g = new PanelGesture('right', 200);
    expect(g.handle(event('down', 0)).suppress).toBe(true);
    expect(g.handle(event('up', 90))).toMatchObject({ suppress: true, replay: 'click' });
    expect(g.tick(220).trigger).toBeUndefined();
  });
  it('long hold triggers once, then release is forwarded to panel', () => {
    const g = new PanelGesture('right', 200);
    g.handle(event('down', 0));
    expect(g.tick(199).trigger).toBeUndefined();
    expect(g.tick(200).trigger).toEqual({ x: 10, y: 20 });
    expect(g.tick(300).trigger).toBeUndefined();
    expect(g.handle(event('up', 550))).toMatchObject({
      suppress: true,
      release: { x: 10, y: 20, quick: false },
    });
  });
  it('drag restores right down and preserves real up', () => {
    const g = new PanelGesture('right', 200);
    g.handle(event('down', 0));
    expect(g.handle(event('move', 40, 30))).toMatchObject({ suppress: false, replay: 'down' });
    expect(g.handle(event('up', 100, 30)).suppress).toBe(false);
    expect(g.tick(300).trigger).toBeUndefined();
  });
  it('quick release stays in click mode and middle works immediately', () => {
    const g = new PanelGesture('middle', 200);
    expect(g.handle(event('down', 0, 10, 'middle')).trigger).toBeDefined();
    expect(g.handle(event('up', 80, 10, 'middle')).release?.quick).toBe(true);
  });
  it('cancel flushes a withheld down without later trigger', () => {
    const g = new PanelGesture('right', 200);
    g.handle(event('down', 0));
    expect(g.cancel().replay).toBe('down');
    expect(g.tick(999).trigger).toBeUndefined();
  });
});
