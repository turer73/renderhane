import type {Page} from './core';

type QrStep = 'content' | 'style' | 'preview';

/**
 * Turns the long QR form into a phone-sized three-step workspace without
 * changing the underlying QR state, validation, or export code.
 */
export function enhanceMobileToolFlow(root: HTMLElement, page: Page): () => void {
  if (page !== 'qr') return () => undefined;
  const workspace = root.querySelector<HTMLElement>('.rh-qr-workspace');
  const form = root.querySelector<HTMLElement>('.rh-qr-content');
  const preview = root.querySelector<HTMLElement>('.rh-qr-preview-panel');
  if (!workspace || !form || !preview) return () => undefined;

  const children = Array.from(form.children) as HTMLElement[];
  const styleStart = children.findIndex(child => child.classList.contains('rh-qr-step'));
  if (styleStart < 1) return () => undefined;

  const doc = root.ownerDocument;
  const contentPane = doc.createElement('div');
  const stylePane = doc.createElement('div');
  contentPane.id = 'rh-qr-pane-content';
  stylePane.id = 'rh-qr-pane-style';
  preview.id = 'rh-qr-pane-preview';
  contentPane.dataset.qrPane = 'content';
  stylePane.dataset.qrPane = 'style';
  preview.dataset.qrPane = 'preview';
  children.slice(0, styleStart).forEach(child => contentPane.append(child));
  children.slice(styleStart).forEach(child => stylePane.append(child));
  form.append(contentPane, stylePane);

  const nav = doc.createElement('div');
  nav.className = 'rh-qr-mobile-steps';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'QR oluşturma adımları');
  const labels: Array<[QrStep, string]> = [
    ['content', '1 · İçerik'],
    ['style', '2 · Stil'],
    ['preview', '3 · Önizle ve indir'],
  ];
  nav.innerHTML = labels.map(([step, label]) =>
    `<button type="button" role="tab" data-qr-mobile-step="${step}" aria-controls="rh-qr-pane-${step}">${label}</button>`
  ).join('');
  workspace.before(nav);

  const activate = (step: QrStep, focus = false) => {
    root.dataset.qrMobileStep = step;
    nav.querySelectorAll<HTMLButtonElement>('[data-qr-mobile-step]').forEach(button => {
      const active = button.dataset.qrMobileStep === step;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus({preventScroll: true});
    });
  };
  const onClick = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-qr-mobile-step]');
    const step = button?.dataset.qrMobileStep as QrStep | undefined;
    if (!step) return;
    activate(step, true);
    workspace.scrollIntoView({block: 'start', behavior: 'smooth'});
  };
  nav.addEventListener('click', onClick);
  activate('content');
  return () => nav.removeEventListener('click', onClick);
}
