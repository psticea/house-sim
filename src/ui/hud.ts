import type { ControlsMode } from '../core/params';

const HELP: Record<'touch' | 'desktop', Record<ControlsMode, string>> = {
  touch: {
    walk: '<b>Left thumb</b> — move (push to the edge to run)<br><b>Right thumb</b> — look around',
    fly:
      '<b>Left stick</b> — forward / back, sideways<br><b>Right stick</b> — up / down, turn<br>' +
      '<b>Drag</b> elsewhere — tilt the camera',
  },
  desktop: {
    walk: '<b>W A S D</b> / arrows — move · <b>Shift</b> — run<br><b>Mouse</b> — look · <b>Esc</b> — pause',
    fly:
      '<b>W A S D</b> / arrows — fly · <b>E</b> / <b>Space</b> — up · <b>Q</b> / <b>C</b> — down<br>' +
      '<b>Shift</b> — fast · <b>Mouse</b> — look · <b>Esc</b> — pause',
  },
};

/** Start overlay: click to start (desktop, pointer lock) / tap to start (touch). */
export class StartOverlay {
  private readonly el: HTMLDivElement;
  private readonly help: HTMLParagraphElement;
  private dismissed = false;

  constructor(
    root: HTMLElement,
    private readonly touch: boolean,
    private readonly onStart: () => void,
    mode: ControlsMode = 'walk',
  ) {
    this.el = document.createElement('div');
    this.el.className = 'start';
    this.el.innerHTML = `<div class="card"><h1>House Sim</h1><p></p>
           <button type="button">${touch ? 'Tap to start' : 'Click to start'}</button></div>`;
    this.help = this.el.querySelector('p')!;
    this.setMode(mode);
    root.appendChild(this.el);
    this.el.addEventListener('click', () => this.start());
  }

  /** Shows the help of the walk or fly controls. */
  setMode(mode: ControlsMode): void {
    this.help.innerHTML = HELP[this.touch ? 'touch' : 'desktop'][mode];
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
