import type { Generator } from '../core/params/types';

/**
 * The front door: pick what you want to print.
 *
 * Like the parameter panel, this knows nothing about any particular generator.
 * It renders the name, tagline, highlights and artwork each one declares, so a
 * new generator appears here the moment it is added to the registry.
 */
export class Home {
  readonly el: HTMLElement;

  constructor(
    generators: readonly Generator[],
    private readonly onPick: (id: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.id = 'home';
    this.el.hidden = true;

    const inner = document.createElement('div');
    inner.className = 'home-inner';

    const head = document.createElement('header');
    head.className = 'home-head';
    head.innerHTML = `
      <h1>3D Print Generator</h1>
      <p>Pick a model, set it up in millimetres, and take away a watertight STL or 3MF.
         Every part is real solid geometry - nothing here is a mesh someone eyeballed.</p>
    `;
    inner.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'home-grid';
    for (const g of generators) grid.appendChild(this.card(g));
    inner.appendChild(grid);

    const foot = document.createElement('p');
    foot.className = 'home-foot hint';
    foot.textContent =
      'Everything you change lives in the address bar, so any configuration is a link you can send someone.';
    inner.appendChild(foot);

    this.el.appendChild(inner);
  }

  private card(g: Generator): HTMLElement {
    const card = document.createElement('button');
    card.className = 'model-card';
    card.type = 'button';
    card.setAttribute('aria-label', `${g.name}: ${g.tagline ?? g.description}`);

    const art = document.createElement('div');
    art.className = 'model-art';
    // Generator-authored module source, never user input.
    art.innerHTML = g.art ?? '';
    card.appendChild(art);

    const body = document.createElement('div');
    body.className = 'model-body';

    const h = document.createElement('h2');
    h.textContent = g.name;
    body.appendChild(h);

    const tagline = document.createElement('p');
    tagline.className = 'model-tagline';
    tagline.textContent = g.tagline ?? g.description;
    body.appendChild(tagline);

    if (g.highlights?.length) {
      const ul = document.createElement('ul');
      ul.className = 'model-points';
      for (const point of g.highlights) {
        const li = document.createElement('li');
        li.textContent = point;
        ul.appendChild(li);
      }
      body.appendChild(ul);
    }

    const cta = document.createElement('span');
    cta.className = 'model-cta';
    cta.textContent = 'Open';
    body.appendChild(cta);

    card.appendChild(body);
    card.addEventListener('click', () => this.onPick(g.id));
    return card;
  }

  show(): void {
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}
