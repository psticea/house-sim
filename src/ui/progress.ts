/** Small non-blocking progress pill while the realistic materials stream in. */
export class AssetProgress {
  private readonly el: HTMLDivElement;
  private readonly bar: HTMLElement;
  private timer = 0;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'asset-progress';
    this.el.setAttribute('role', 'status');
    const label = document.createElement('span');
    label.textContent = 'Loading materials';
    const track = document.createElement('b');
    this.bar = document.createElement('i');
    track.appendChild(this.bar);
    this.el.append(label, track);
    root.appendChild(this.el);
  }

  update(fraction: number, done: boolean): void {
    window.clearTimeout(this.timer);
    this.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
    if (done) {
      this.timer = window.setTimeout(() => this.el.classList.remove('on'), 400);
    } else {
      this.el.classList.add('on');
    }
  }
}
