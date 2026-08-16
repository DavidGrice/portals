const app = document.querySelector('#app');

if (!app) {
  throw new Error('Missing #app root');
}

app.dataset.ready = 'true';
console.log('portals-grok: Vite shell ready');
