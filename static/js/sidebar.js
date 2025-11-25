// static/js/sidebar.js
// Funcionalidad del sidebar (toggle mobile, etc.)

(function() {
  'use strict';

  // Toggle sidebar en mobile
  const toggleBtn = document.getElementById('toggleSidebar');
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.querySelector('.sidebar');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-open');
    });
  }

  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-open');
    });
  }

  // Cerrar sidebar al hacer click fuera en mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768) {
      if (!sidebar?.contains(e.target) && !mobileBtn?.contains(e.target)) {
        document.body.classList.remove('sidebar-open');
      }
    }
  });

  // Toggle de sub-menús
  const navToggles = document.querySelectorAll('.nav-toggle');
  navToggles.forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      const parent = toggle.closest('.nav-group');
      parent?.classList.toggle('is-open');
    });
  });

})();
