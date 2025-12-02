// orquestador-tabs.js — Orquestador robusto con overlay no destructivo, anti-race
// Versión unificada (SIN /enc). Siempre llama a los endpoints comunes.
// Añade fecha/turno/local/caja como query params y hace refetch al entrar a cada tab.
(() => {
  const state = {
    // Selectores (podés sobreescribir en init)
    selTurno: '#turnoSelect',
    selLocal: '#userLocal',
    selCaja:  '#cajaSelect',
    selFecha: '#fechaGlobal',
    tabSelector: '.tab-btn',

    // Callbacks opcionales (overlay interno de respaldo)
    showLoading: () => {},         // (tabKey, on:boolean)
    showError:   (tabKey, msg) => { console.warn(`[OrqTabs:${tabKey}]`, msg); },

    // Config
    debounceMs: 250,
    fetchOnTabShow: 'always',      // 'always' | 'stale'

    // Estado dinámico
    local: '', caja: '', fecha: '', turno: 'UNI',
    activeTab: '',
    tabs: {},     // key -> { endpoints: string[], render: fn, watch?: string[], stale, controllers[], cache: Map, lastToken: string }
    panes: {},    // key -> HTMLElement

    // Tracking de errores para detección de problemas persistentes
    errorCount: 0,
    lastErrorTime: null,
    consecutiveErrors: 0,
  };

  // ===== Utils =====
  const keyParams = () => `${state.local}|${state.caja}|${state.fecha}|${state.turno}`;
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const debounce = (fn, ms) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

  // Helper para leer el valor de un elemento (select usa .value, span usa .textContent)
  // MODIFICADO: Ahora considera localStorage para persistencia de selecciones
  const getElementValue = (el) => {
    if (!el) return '';

    // Para fechaGlobal, cajaSelect y turnoSelect, intentar restaurar desde localStorage primero
    const id = el.id;
    if (id === 'fechaGlobal' || id === 'cajaSelect' || id === 'turnoSelect') {
      const savedValue = localStorage.getItem(id);
      if (savedValue && el.value !== savedValue) {
        // Restaurar el valor guardado al elemento antes de leerlo
        if (el.tagName === 'SELECT') {
          // Verificar que la opción existe antes de seleccionarla
          const optionExists = Array.from(el.options).some(opt => opt.value === savedValue);
          if (optionExists) {
            el.value = savedValue;
          }
        } else if (el.tagName === 'INPUT') {
          el.value = savedValue;
        }
      }
    }

    if (el.tagName === 'SELECT' || el.tagName === 'INPUT') {
      return (el.value || '').trim();
    }
    return (el.textContent || '').trim();
  };

  // Overlay de carga no destructivo (no toca el HTML del pane)
  function setOverlay(tabKey, on) {
    const pane = state.panes[tabKey] || document.getElementById(tabKey);
    if (!pane) return;
    let ov = pane.querySelector(':scope > .orqtabs-overlay');
    if (on) {
      if (!ov) {
        ov = document.createElement('div');
        ov.className = 'orqtabs-overlay';
        ov.innerHTML = '<div class="orqtabs-spinner">Cargando…</div>';
        ov.style.cssText = `
          position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
          background: rgba(255,255,255,.6); backdrop-filter: blur(1px); z-index: 5;
        `;
        if (!document.getElementById('orqtabs-style')) {
          const spStyle = document.createElement('style');
          spStyle.id = 'orqtabs-style';
          spStyle.textContent = `
            .tab-pane { position: relative; }
            .orqtabs-spinner { padding:10px 14px; border-radius:8px; background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.12); font-weight:600; }
          `;
          document.head.appendChild(spStyle);
        }
        const comp = getComputedStyle(pane).position;
        if (!comp || comp === 'static') pane.style.position = 'relative';
        pane.appendChild(ov);
      }
      ov.style.display = 'flex';
    } else if (ov) {
      ov.style.display = 'none';
    }
  }

  // Cortafuegos: usar SOLO el pipeline del orquestador para cambios de filtros
  function installFirewallFor(el, handler) {
    if (!el) return;
    const guard = (ev) => {
      // PRIMERO: Guardar en localStorage para persistencia (antes de stopPropagation)
      const id = el?.id;
      if (id === 'fechaGlobal' || id === 'cajaSelect' || id === 'turnoSelect') {
        const newValue = el.value;
        if (newValue) {
          localStorage.setItem(id, newValue);
          console.log('[OrqTabs-Firewall] Guardado en localStorage:', id, '=', newValue);
        }
      }

      ev.stopImmediatePropagation?.();
      ev.stopPropagation?.();
      handler(); // pipeline del orquestador
    };
    // CAPTURING → evita duplicados
    el.addEventListener('change', guard, true);
    el.addEventListener('input',  guard, true);
  }

  function invalidateAll() {
    Object.values(state.tabs).forEach(t => {
      t.stale = true;
      if (t.controllers?.length) for (const c of t.controllers) { try { c.abort(); } catch {} }
      t.controllers = [];
    });
  }

  const shouldUseCacheOnTabShow = () => state.fetchOnTabShow !== 'always';

  // Watchers por pestaña (opcional)
  function installWatchersForTab(tabKey, tabCfg) {
    if (Array.isArray(tabCfg.watch) && tabCfg.watch.length) {
      tabCfg._watchHandlers = tabCfg._watchHandlers || [];
      tabCfg.watch.forEach(sel => {
        const handler = debounce(() => reloadTab(tabKey), 200);
        tabCfg._watchHandlers.push({ sel, handler });
        document.querySelectorAll(sel).forEach(el => {
          el.addEventListener('change', handler);
          el.addEventListener('input', handler);
        });
      });
    }
    // Atributo declarativo
    document.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t?.getAttribute?.('data-orq-reload') === tabKey) reloadTab(tabKey);
    });
    document.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t?.getAttribute?.('data-orq-reload') === tabKey) reloadTab(tabKey);
    });
  }

  // ===== Core fetch =====
  async function fetchTab(tabKey, opts = {}) {
    const tab = state.tabs[tabKey];
    if (!tab) return;

    const force = !!opts.force;

    // Abortar en vuelo
    if (tab.controllers?.length) for (const c of tab.controllers) { try { c.abort(); } catch {} }
    tab.controllers = [];

    // Endpoints + aseguramos /estado_caja
    const eps = Array.isArray(tab.endpoints) && tab.endpoints.length ? tab.endpoints.slice() : [];
    if (!eps.length) return;
    if (!eps.includes('/estado_caja')) eps.push('/estado_caja');

    const cacheKey = keyParams();
    const token = uid();
    tab.lastToken = token;

    if (!force && shouldUseCacheOnTabShow()) {
      const cached = tab.cache.get(cacheKey);
      if (cached) {
        if (tab.lastToken !== token) return; // anti-race
        try { tab.render(cached.main, { fromCache: true, datasets: cached.map, endpoints: eps, key: cacheKey }); } catch {}
        tab.stale = false;
        return;
      }
    }

    const controllers = eps.map(() => new AbortController());
    tab.controllers = controllers;

    const urls = eps.map((ep) => {
      const u = new URL(ep, window.location.origin);
      if (state.local) u.searchParams.set('local', state.local);
      if (state.caja)  u.searchParams.set('caja',  state.caja);
      if (state.fecha) u.searchParams.set('fecha', state.fecha);
      if (state.turno) u.searchParams.set('turno', state.turno);
      return u;
    });

    const snapshot = { local: state.local, caja: state.caja, fecha: state.fecha, turno: state.turno, tabKey, token };

    // Loading ON
    setOverlay(tabKey, true);
    try { state.showLoading(tabKey, true); } catch {}

    try {
      const promises = urls.map((u, i) =>
        fetch(u.toString(), {
          signal: tab.controllers[i].signal,
          headers: { 'X-Orquestador-Tab': tabKey, 'X-Orq-Endpoint': eps[i] }
        }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      );

      const settled = await Promise.allSettled(promises);

      const stillValid =
        tab.lastToken === token &&
        snapshot.local === state.local &&
        snapshot.caja  === state.caja &&
        snapshot.fecha === state.fecha &&
        snapshot.turno === state.turno;
      if (!stillValid) return;

      const datasets = {};
      let erroredEndpoints = [];
      settled.forEach((res, i) => {
        const ep = eps[i];
        if (res.status === 'fulfilled') {
          datasets[ep] = res.value;
        } else {
          erroredEndpoints.push({ ep, reason: res.reason?.message || 'error' });
          try { state.showError(tabKey, `${ep}: ${res.reason?.message || 'error'}`); } catch {}
        }
      });

      // Si hay errores críticos (más del 50% de endpoints fallaron), alertar al usuario
      if (erroredEndpoints.length > 0 && erroredEndpoints.length >= eps.length / 2) {
        state.consecutiveErrors++;
        state.lastErrorTime = Date.now();

        const errorMsg = `⚠️ ADVERTENCIA: Error cargando datos de "${tabKey}".\n\n` +
          `${erroredEndpoints.length} de ${eps.length} endpoints fallaron:\n` +
          erroredEndpoints.map(e => `- ${e.ep}: ${e.reason}`).join('\n') +
          `\n\nLos datos mostrados pueden estar incompletos o desactualizados.`;

        console.error('[OrqTabs] Error crítico:', errorMsg);
        alert(errorMsg);

        // Si hay 3+ errores consecutivos en menos de 2 minutos, alertar problema persistente
        if (state.consecutiveErrors >= 3 && (Date.now() - state.lastErrorTime) < 120000) {
          alert(
            `🚨 PROBLEMA PERSISTENTE DETECTADO\n\n` +
            `Han ocurrido ${state.consecutiveErrors} errores consecutivos al cargar datos.\n\n` +
            `Esto puede indicar:\n` +
            `- Problemas de conexión a internet\n` +
            `- Problemas con el servidor\n` +
            `- Sesión expirada\n\n` +
            `Por favor:\n` +
            `1. Verifique su conexión a internet\n` +
            `2. Intente recargar la página (F5)\n` +
            `3. Si persiste, contacte al administrador`
          );
        }
      } else {
        // Éxito (al menos parcial), resetear contador
        state.consecutiveErrors = 0;
      }

      const main = datasets[eps[0]] ?? null;
      tab.cache.set(cacheKey, { main, map: datasets });

      try {
        tab.render(main, { fromCache: false, datasets, endpoints: eps, key: cacheKey });
      } catch (e) {
        const renderError = `❌ Error al renderizar pestaña "${tabKey}": ${e?.message || 'Error desconocido'}`;
        console.error('[OrqTabs]', renderError, e);
        try { state.showError(tabKey, renderError); } catch {}
        alert(renderError + '\n\nPor favor, recargue la página e intente nuevamente.');
      }

      tab.stale = false;

    } catch (e) {
      if (e.name !== 'AbortError') {
        const netError = `❌ Error de red en pestaña "${tabKey}": ${e.message || 'Error desconocido'}`;
        console.error('[OrqTabs]', netError, e);
        try { state.showError(tabKey, netError); } catch {}
        state.consecutiveErrors++;
      }
    } finally {
      setOverlay(tabKey, false);
      try { state.showLoading(tabKey, false); } catch {}
      tab.controllers = [];
    }
  }

  function refreshActive(force = false) {
    const k = state.activeTab;
    if (!k) return;
    if (force || state.fetchOnTabShow === 'always') return fetchTab(k, { force: true });
    const tab = state.tabs[k];
    if (tab?.stale) fetchTab(k, { force: false });
  }

  function reloadTab(tabKey) {
    const tab = state.tabs[tabKey];
    if (!tab) return;
    tab.stale = true;
    fetchTab(tabKey, { force: true });
  }

  // ===== API Pública =====
  const OrqTabs = {
    init(cfg) {
      Object.assign(state, cfg || {});

      // Normalizar tabs/panes y watchers
      for (const [k, v] of Object.entries(state.tabs)) {
        const t = {
          ...v,
          endpoints: Array.isArray(v.endpoints) && v.endpoints.length ? v.endpoints.slice() : [],
          stale: true,
          controllers: [],
          cache: new Map(),
          lastToken: ''
        };
        state.tabs[k] = t;
        state.panes[k] = document.getElementById(k);
        installWatchersForTab(k, t);
      }

      // Anti doble-disparo de shown.bs.tab
      const lastShownTS = new WeakMap();
      const onShown = (el) => {
        const now = Date.now();
        const prev = lastShownTS.get(el) || 0;
        if (now - prev < 120) return; // ignora duplicados muy cercanos
        lastShownTS.set(el, now);

        const newKey = el?.dataset?.tab || el?.getAttribute('data-tab') || '';
        if (!newKey) return;
        state.activeTab = newKey;
        refreshActive(true); // siempre refetch al entrar
      };

      // Listener: "shown.bs.tab" (tu adapter lo emite al click)
      document.querySelectorAll(state.tabSelector).forEach(el => {
        el.addEventListener('shown.bs.tab', () => onShown(el));
      });

      // Valores iniciales
      state.local = getElementValue(document.querySelector(state.selLocal));
      state.caja  = document.querySelector(state.selCaja )?.value || '';
      state.fecha = document.querySelector(state.selFecha)?.value || '';
      state.turno = document.querySelector(state.selTurno)?.value || 'UNI';

      // Cortafuegos para filtros globales (CAPTURING) + pipeline
      const onFiltersChange = debounce(() => {
        state.local = getElementValue(document.querySelector(state.selLocal));
        state.caja  = document.querySelector(state.selCaja )?.value || '';
        state.fecha = document.querySelector(state.selFecha)?.value || '';
        state.turno = document.querySelector(state.selTurno)?.value || 'UNI';
        invalidateAll();
        refreshActive(true); // refetch de la pestaña activa
      }, state.debounceMs);

      installFirewallFor(document.querySelector(state.selLocal), onFiltersChange); // <- AGREGADO para auditor
      installFirewallFor(document.querySelector(state.selCaja),  onFiltersChange);
      installFirewallFor(document.querySelector(state.selFecha), onFiltersChange);
      installFirewallFor(document.querySelector(state.selTurno), onFiltersChange);

      // Determinar tab activo inicial (el adapter disparará shown.bs.tab)
      const activeBtn =
        document.querySelector(`${state.tabSelector}.active`) ||
        document.querySelector(state.tabSelector);
      state.activeTab = activeBtn?.dataset?.tab || activeBtn?.getAttribute('data-tab') || Object.keys(state.tabs)[0];
      // No hacemos refresh aquí para evitar doble fetch; se hará al primer "shown.bs.tab".
    },

    // Invalidar un tab específico (p. ej. luego de guardar algo)
    invalidate(tabKey) { if (tabKey && state.tabs[tabKey]) state.tabs[tabKey].stale = true; },

    // Forzar pipeline cuando cambiás filtros por JS
    notifyFiltersChanged() {
      state.local = getElementValue(document.querySelector(state.selLocal));
      state.caja  = document.querySelector(state.selCaja )?.value || '';
      state.fecha = document.querySelector(state.selFecha)?.value || '';
      state.turno = document.querySelector(state.selTurno)?.value || 'UNI';
      invalidateAll();
      refreshActive(true);
    },

    // Forzar refetch del activo
    reloadActive() { refreshActive(true); },

    // Forzar refetch de un tab puntual
    reload(tabKey) { reloadTab(tabKey); }
  };

  window.OrqTabs = OrqTabs;
})();
