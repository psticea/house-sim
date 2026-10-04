/**
 * Controls drop-down (top left): Walk (first person) or Fly (drone camera). Same pill +
 * compact menu as the style toggle; its pointer events never reach the canvas.
 */
import type { ControlsMode } from '../core/params';

const ITEMS: readonly { mode: ControlsMode; label: string }[] = [
  { mode: 'walk', label: 'Walk' },
  { mode: 'fly', label: 'Fly' },
];

const ICONS: Record<ControlsMode, string> = {
  // Walking figure.
  walk: '<circle cx="13" cy="4.2" r="1.8"/><path d="M9.5 21l2.3-6.2 2.7 2.2.9 4M11.8 14.8l.9-5.6-3.6 1.6-1 3.2M12.7 9.2l2.3 3 3 .8"/>',
  // Quadcopter.
  fly: '<rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 9.5L6.5 6.5M14.5 9.5l3-3M9.5 14.5l-3 3M14.5 14.5l3 3"/><circle cx="5.5" cy="5.5" r="2.5"/><circle cx="18.5" cy="5.5" r="2.5"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
};

const icon = (mode: ControlsMode): string =>
  `<svg class="style-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[mode]}</svg>`;

export class ControlsToggle {
  readonly root: HTMLDivElement;
  readonly button: HTMLButtonElement;
  private readonly menu: HTMLDivElement;
  private readonly options = new Map<ControlsMode, HTMLButtonElement>();

  constructor(
    parent: HTMLElement,
    private current: ControlsMode,
    private readonly onSelect: (mode: ControlsMode) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'controls-toggle';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'controls-pill';
    this.button.setAttribute('aria-haspopup', 'menu');
    this.button.setAttribute('aria-expanded', 'false');
    this.menu = document.createElement('div');
    this.menu.className = 'controls-menu';
    this.menu.setAttribute('role', 'menu');
    this.menu.setAttribute('aria-label', 'Controls');
    this.menu.hidden = true;
    for (const item of ITEMS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'controls-option';
      b.dataset.controls = item.mode;
      b.setAttribute('role', 'menuitemradio');
      b.innerHTML = `${icon(item.mode)}<span>${item.label}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
        this.button.focus({ preventScroll: true });
        if (item.mode !== this.current) this.onSelect(item.mode);
      });
      this.options.set(item.mode, b);
      this.menu.appendChild(b);
    }
    this.root.append(this.button, this.menu);
    parent.appendChild(this.root);

    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.menu.hidden) this.open();
      else this.close();
    });
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'dblclick'] as const) {
      this.root.addEventListener(type, (e) => e.stopPropagation());
    }
    document.addEventListener('pointerdown', this.onOutside, true);
    this.render();
  }

  get isOpen(): boolean {
    return !this.menu.hidden;
  }

  set(mode: ControlsMode): void {
    this.current = mode;
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
      (document.activeElement as HTMLElement | null)?.click();
      e.preventDefault();
    } else {
      return;
    }
    e.stopPropagation();
  }

  private render(): void {
    const label = ITEMS.find((i) => i.mode === this.current)?.label ?? this.current;
    this.button.innerHTML = `${icon(this.current)}<span class="controls-name">${label}</span><svg class="style-caret" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 10l5 5 5-5"/></svg>`;
    this.button.setAttribute('aria-label', `Controls: ${label}. Change controls`);
    this.root.dataset.controls = this.current;
    for (const [mode, b] of this.options) {
      const on = mode === this.current;
      b.classList.toggle('current', on);
      b.setAttribute('aria-checked', String(on));
    }
  }
}
