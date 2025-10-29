(() => {
  const form = document.getElementById('createUserForm');
  const msg  = document.getElementById('formMsg');
  const btnReset = document.getElementById('btnReset');

  function setMsg(text, ok=false){
    msg.textContent = text || '';
    msg.className = 'msg ' + (ok ? 'ok' : 'err');
  }

  btnReset?.addEventListener('click', () => {
    form.reset();
    setMsg('');
  });

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setMsg('');

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const role     = document.getElementById('role').value;
    const status   = document.getElementById('status').value;
    const local    = document.getElementById('local').value.trim();
    const society  = document.getElementById('society').value.trim();

    const pages = Array.from(document.querySelectorAll('.page-chk:checked')).map(x => x.value);

    if (!username || !password || !role || !local || !society) {
      return setMsg('Completá todos los campos obligatorios.');
    }
    if (password.length < 4) return setMsg('La contraseña debe tener al menos 4 caracteres.');

    try{
      const r = await fetch('/api/users', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username, password, role, status, local, society, pages })
      });
      const data = await r.json().catch(()=>({}));
      if (!r.ok || !data.success) {
        return setMsg(data.msg || `Error HTTP ${r.status}`);
      }
      setMsg('✅ Usuario creado correctamente', true);
      form.reset();
    }catch(e){
      setMsg('Error de red. Intentá de nuevo.');
    }
  });
})();
