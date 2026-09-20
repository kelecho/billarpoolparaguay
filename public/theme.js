// Aplica el tema antes del primer pintado para que la página no parpadee en claro.
// Vive en un archivo propio para que la política de contenido no necesite permitir scripts en línea.
try {
  var saved = localStorage.getItem('pool-paraguay-theme');
  document.documentElement.dataset.theme = saved === 'dark' || saved === 'light' ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
} catch (e) { document.documentElement.dataset.theme = 'light'; }
