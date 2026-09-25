/** Minimal loading screen (the scene is procedural, so this is short). */
export class LoadingScreen {
  private readonly el: HTMLElement | null;
  private readonly bar: HTMLElement | null;
  private readonly label: HTMLElement | null;

  constructor() {
    this.el = document.getElementById('loading');
    this.bar = this.el?.querySelector<HTMLElement>('.bar > i') ?? null;
    this.label = this.el?.querySelector<HTMLElement>('.label') ?? null;
  }

  progress(fraction: number, text: string): void {
    if (this.bar) this.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
    if (this.label) this.label.textContent = text;
  }

  error(text: string): void {
    this.el?.classList.add('error');
    if (this.label) this.label.textContent = text;
  }

  hide(): void {
    if (!this.el) return;
    this.el.classList.add('done');
    window.setTimeout(() => this.el?.remove(), 600);
  }
}
