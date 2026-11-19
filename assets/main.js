import './field.js';

// "Copy email" button
document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; }
  catch { b.textContent = 'Copy failed. Select the address instead.'; }
  setTimeout(() => { b.textContent = 'Copy email'; }, 2000);
}));
