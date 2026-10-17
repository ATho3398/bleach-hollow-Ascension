import { versionLabel } from './version';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.innerHTML = `
    <main style="font-family: system-ui, sans-serif; padding: 24px; color: #e8e8ef; background: #0d0d12; min-height: 100vh; box-sizing: border-box;">
      <h1 style="margin: 0 0 8px;">블리치 할로우 어센션</h1>
      <p style="margin: 0 0 24px; opacity: .7;">Bleach Hollow Ascension · 준비 중</p>
      <small style="opacity: .5;">${versionLabel()}</small>
    </main>`;
}
