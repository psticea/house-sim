/** Room name toast shown when the player enters a room / zone. */
export class RoomToast {
  private readonly el: HTMLDivElement;
  private timer = 0;
  current = '';

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'toast';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    root.appendChild(this.el);
  }

  show(name: string): void {
    this.current = name;
    this.el.textContent = name;
    this.el.classList.add('on');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.classList.remove('on'), 2200);
  }
}
