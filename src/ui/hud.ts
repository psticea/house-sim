/** Start overlay: click to start (desktop, pointer lock) / tap to start (touch). */
export class StartOverlay {
  private readonly el: HTMLDivElement;
  private dismissed = false;

  constructor(
    root: HTMLElement,
    touch: boolean,
    private readonly onStart: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'start';
    this.el.innerHTML = touch
      ? `<div class="card"><h1>House Sim</h1>
           <p><b>Left thumb</b> — move (push to the edge to run)<br><b>Right thumb</b> — look around</p>
           <button type="button">Tap to start</button></div>`
      : `<div class="card"><h1>House Sim</h1>
           <p><b>W A S D</b> / arrows — move · <b>Shift</b> — run<br><b>Mouse</b> — look · <b>Esc</b> — pause</p>
           <button type="button">Click to start</button></div>`;
    root.appendChild(this.el);
    this.el.addEventListener('click', () => this.start());
  }

  private start(): void {
    this.onStart();
    this.hide();
  }

  show(): void {
    this.dismissed = false;
    this.el.classList.remove('off');
  }

  hide(): void {
    this.dismissed = true;
    this.el.classList.add('off');
  }

  get visible(): boolean {
    return !this.dismissed;
  }
}
