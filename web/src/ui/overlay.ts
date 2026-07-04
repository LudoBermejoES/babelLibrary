/**
 * The click-to-enter / pause overlay (doc 06 "Pause overlay" — same
 * overlay for ENTER_OVERLAY and PAUSE_OVERLAY, heading swapped).
 */
export class Overlay {
  private readonly element: HTMLDivElement;
  private readonly heading: HTMLParagraphElement;

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.dataset.testid = 'enter-overlay';
    this.element.className = 'overlay';

    this.heading = document.createElement('p');
    this.heading.className = 'overlay-heading';

    const controls = document.createElement('p');
    controls.className = 'overlay-controls';
    controls.textContent = 'WASD to walk, mouse to look, Esc to pause';

    this.element.appendChild(this.heading);
    this.element.appendChild(controls);
    container.appendChild(this.element);

    this.showEnter();
  }

  showEnter(): void {
    this.heading.textContent = 'Click to enter';
    this.element.dataset.testid = 'enter-overlay';
    this.element.style.display = 'flex';
  }

  showPause(): void {
    this.heading.textContent = 'Paused — click to continue';
    this.element.dataset.testid = 'pause-overlay';
    this.element.style.display = 'flex';
  }

  hide(): void {
    this.element.style.display = 'none';
  }
}
