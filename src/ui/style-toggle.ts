/**
 * Style toggle (plan.md S2): a small pill in the top-right corner showing the current
 * look; tap/click opens a compact menu of the three looks. Lives in `#ui` above the
 * canvas and the start overlay; its pointer events never reach the canvas, so it can't
 * start the joystick, a look drag or pointer lock.
 */
import type { StyleName } from '../core/params';

export interface StyleToggleItem {
  name: StyleName;
  label: string;
}

const ICONS: Record<StyleName, string> = {
  // Pencil.
  sketchup:
    '<path d="M4 20l1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z"/><path d="M13.8 6.8l3.4 3.4"/>',
  // Comic burst.
  borderlands:
    '<path d="M12 2.8l2 5 5.2-2-2.3 4.9 4.6 2.6-5.2 1 .9 5.4L12 17.4 6.8 19.7l.9-5.4-5.2-1 4.6-2.6-2.3-4.9 5.2 2z"/>',
  // Sun.
  real: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
};

const icon = (name: StyleName): string =>
  `<svg class="style-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

export class StyleToggle {
  readonly root: HTMLDivElement;
  readonly button: HTMLButtonElement;
  private readonly menu: HTMLDivElement;
  private readonly options = new Map<StyleName, HTMLButtonElement>();
  private current: StyleName;
  private busy = false;

  constructor(
    parent: HTMLElement,
    private readonly items: readonly StyleToggleItem[],
    initial: StyleName,
    private readonly onSelect: (name: StyleName) => void,
  ) {
    this.current = initial;
    this.root = document.createElement('div');
    this.root.className = 'style-toggle';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'style-pill';
    this.button.setAttribute('aria-haspopup', 'menu');
    this.button.setAttribute('aria-expanded', 'false');
    this.menu = document.createElement('div');
    this.menu.className = 'style-menu';
    this.menu.setAttribute('role', 'menu');
    this.menu.setAttribute('aria-label', 'Visual style');
    this.menu.hidden = true;
    for (const item of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'style-option';
      b.dataset.style = item.name;
      b.setAttribute('role', 'menuitemradio');
      b.innerHTML = `${icon(item.name)}<span>${item.label}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
        this.button.focus({ preventScroll: true });
        if (item.name !== this.current) this.onSelect(item.name);
      });
      this.options.set(item.name, b);
      this.menu.appendChild(b);
    }
    this.root.append(this.button, this.menu);
    parent.appendChild(this.root);

    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.menu.hidden) this.open();
      else this.close();
    });
    // Keep the game's key handlers (movement, K) out of menu navigation.
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    // Never let the pointer reach the canvas / start overlay underneath.
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'dblclick'] as const) {
      this.root.addEventListener(type, (e) => e.stopPropagation());
    }
    document.addEventListener('pointerdown', this.onOutside, true);
    this.render();
  }

  get isOpen(): boolean {
    return !this.menu.hidden;
  }

  /** Updates the pill (e.g. after K or a programmatic switch). */
  set(name: StyleName): void {
    this.current = name;
    this.render();
  }

  /** "Switching…" state while a look is built for the first time. */
  setBusy(busy: boolean): void {
    this.busy = busy;
    this.render();
  }

  open(): void {
    this.menu.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.root.classList.add('open');
    this.options.get(this.current)?.focus({ preventScroll: true });
  }

  close(): void {
    this.menu.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    this.root.classList.remove('open');
  }

  private readonly onOutside = (e: PointerEvent): void => {
    if (this.isOpen && !this.root.contains(e.target as Node)) this.close();
  };

  private onKey(e: KeyboardEvent): void {
    const list = [...this.options.values()];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.code === 'Escape' && this.isOpen) {
      this.close();
      this.button.focus({ preventScroll: true });
    } else if (this.isOpen && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) {
      const step = e.code === 'ArrowDown' ? 1 : -1;
      list[(Math.max(0, i) + step + list.length) % list.length]?.focus({ preventScroll: true });
      e.preventDefault();
    } else if (e.code === 'Space') {
      // The game's key handler cancels Space on window; activate the focused button here.
      (document.activeElement as HTMLElement | null)?.click();
      e.preventDefault();
    } else {
      return;
    }
    e.stopPropagation();
  }

  private render(): void {
    const label = this.items.find((i) => i.name === this.current)?.label ?? this.current;
    this.button.innerHTML = `${icon(this.current)}<span class="style-name">${
      this.busy ? 'Switching…' : label
    }</span><svg class="style-caret" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 10l5 5 5-5"/></svg>`;
    this.button.setAttribute('aria-label', `Visual style: ${label}. Change style`);
    this.button.setAttribute('aria-busy', String(this.busy));
    this.root.dataset.style = this.current;
    this.root.classList.toggle('busy', this.busy);
    for (const [name, b] of this.options) {
      const on = name === this.current;
      b.classList.toggle('current', on);
      b.setAttribute('aria-checked', String(on));
    }
  }
}
