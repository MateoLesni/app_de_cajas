// static/js/fecha_hoy_index.js
document.addEventListener('DOMContentLoaded', () => {
  console.log('[fecha_hoy_index] DOM listo');
  const f = document.getElementById('fechaGlobal');
  if (f && !f.value) {
    const now = new Date();
    const localISO = new Date(now.getTime() - now.getTimezoneOffset()*60000)
      .toISOString().slice(0,10); // yyyy-mm-dd
    f.value = localISO;
  }
  const topDate = document.getElementById('currentDate');
  if (topDate) topDate.textContent = new Date().toLocaleDateString('es-AR');
});
