/* A personal welcome tour. Profile data is rendered by the authenticated server. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const themeButton = $('#factory-theme-toggle');
  const setThemeButton = () => {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    themeButton.textContent = `${next === 'dark' ? 'Dark' : 'Light'} mode`;
    themeButton.setAttribute('aria-label', `Switch to ${next} theme`);
  };
  setThemeButton();
  themeButton.addEventListener('click', async () => {
    const previous = document.body.dataset.theme;
    const theme = previous === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = theme;
    setThemeButton();
    if (document.body.dataset.preview === 'true') return;
    themeButton.disabled = true;
    try {
      const response = await fetch('/api/method/my_space.preferences.set_theme', {
        method: 'POST', credentials: 'same-origin',
        headers: {'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': $('#welcome-csrf').value},
        body: JSON.stringify({theme})
      });
      if (!response.ok) throw new Error('Could not save your My Space theme. Please try again.');
      try { localStorage.setItem('my_space_theme', theme); } catch {}
    } catch (error) {
      document.body.dataset.theme = previous;
      setThemeButton();
      $('#welcome-status').textContent = error.message;
    } finally { themeButton.disabled = false; }
  });
  const tabs = [...document.querySelectorAll('#welcome-tabs [role="tab"]')];
  const marcus = $('#marcus-supervisor');
  const bubble = $('#marcus-dialogue');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const preferenceKey = 'factory-welcome:' + document.body.dataset.user;
  const motionButton = $('#reduce-animation');
  let lowMotion = reduced.matches;
  try { lowMotion = lowMotion || localStorage.getItem(preferenceKey + ':motion') === 'reduced'; } catch {}
  const applyMotion = () => { document.body.classList.toggle('reduce-motion',lowMotion); motionButton.setAttribute('aria-pressed',String(lowMotion)); };
  applyMotion();
  motionButton.addEventListener('click', () => { lowMotion = !lowMotion; applyMotion(); try { localStorage.setItem(preferenceKey + ':motion',lowMotion ? 'reduced' : 'full'); } catch {} });
  reduced.addEventListener('change', event => { if (event.matches) {lowMotion=true;applyMotion();} });
  let animation = 0, bubbleTimer, lastJoke = 0, joke = 0;
  const copy = {
    profile: ['Your pass is ready. Let’s put a name to that hard hat.', 'Identity verified. That pass looks good on you!'],
    team: ['Every good shift starts with a good team.', 'Your branch and department. The people behind the production.'],
    work: ['A quick look at your schedule, then you’re ready.', 'Your next stop: a productive day. Coffee is optional. Mostly.'],
    process: ['Your business processes, step by step.', 'Choose a module to view its reports.'],
    approvals: ['Your document center is ready.', 'Review each document before choosing an available action.']
  };
  function pose(name) {
    for (const cls of [...marcus.classList]) if (cls.startsWith('pose-')) marcus.classList.remove(cls);
    marcus.classList.add('pose-' + name);
  }
  function say(text) {
    bubble.textContent = text; bubble.classList.add('active');
    clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => bubble.classList.remove('active'), 4500);
  }
  function select(name, focus = false) {
    const index = tabs.findIndex(tab => tab.dataset.tab === name);
    if (index < 0) return;
    tabs.forEach(tab => {
      const active = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      $('#' + tab.getAttribute('aria-controls')).hidden = !active;
    });
    document.querySelectorAll('.welcome-layout > [data-side-tab]').forEach(side => {side.hidden = side.dataset.sideTab !== name;});
    $('.welcome-layout').dataset.processActive = String(name === 'process');
    const version = ++animation;
    $('.welcome-guide').dataset.stop = name;
    $('#guide-caption').textContent = copy[name][0];
    pose(lowMotion ? 'welcome' : 'walk');
    setTimeout(() => { if (version === animation) pose(name === 'work' ? 'watch' : 'welcome'); }, lowMotion ? 0 : 480);
    say(copy[name][1]);
    if (focus) $('#panel-' + name).focus({preventScroll:true});
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab.dataset.tab));
    tab.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = tabs.length - 1;
      if (target !== undefined) { event.preventDefault(); tabs[target].focus(); select(tabs[target].dataset.tab); }
    });
  });
  document.querySelectorAll('[data-claim-action]').forEach(button => button.addEventListener('click', async () => {
    const status = $('#approval-action-status');
    const buttons = [...document.querySelectorAll(`[data-claim-name="${CSS.escape(button.dataset.claimName)}"]`)];
    buttons.forEach(item => { item.disabled = true; });
    status.textContent = `${button.dataset.action} in progress…`;
    try {
      const response = await fetch('/api/method/my_space.www.welcomes.apply_expense_claim_action', {
        method: 'POST', credentials: 'same-origin',
        headers: {'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': $('#welcome-csrf').value, 'Accept': 'application/json'},
        body: JSON.stringify({claim_name: button.dataset.claimName, action: button.dataset.claimAction, approval_status: button.dataset.approvalStatus})
      });
      const payload = await response.json();
      if (!response.ok || payload.exc) throw new Error(payload._server_messages ? JSON.parse(payload._server_messages)[0] : 'Could not apply this workflow action.');
      status.textContent = payload.message || 'Workflow action completed.';
      window.location.reload();
    } catch (error) {
      status.textContent = error.message;
      buttons.forEach(item => { item.disabled = false; });
    }
  }));
  document.querySelectorAll('[data-next]').forEach(button => button.addEventListener('click', () => {
    select(button.dataset.next, true);
    $('#welcome-tabs').scrollIntoView({behavior:lowMotion ? 'auto' : 'smooth', block:'nearest'});
  }));
  function encouragement() {
    if (Date.now() - lastJoke < 10000) return;
    lastJoke = Date.now(); const version = ++animation;
    const quotes = ['The machines have a schedule. My coffee has priorities.', 'Helmet? Check. Great team? Check. Let’s go.', 'Your pass is ready. No need to search every pocket.'];
    say(quotes[joke++ % quotes.length]); pose('helmet');
    setTimeout(() => { if (version === animation) pose('welcome'); }, lowMotion ? 0 : 1300);
  }
  marcus.addEventListener('click', encouragement);
  marcus.addEventListener('keydown', event => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); encouragement(); } });
  const companyLogo = $('#company-logo');
  if (companyLogo) { const hideLogo=()=>{companyLogo.hidden=true;};companyLogo.addEventListener('error',hideLogo);if(companyLogo.complete && !companyLogo.naturalWidth) hideLogo(); }
  const photo = $('#welcome-photo');
  if (photo) { const fallback = () => { photo.hidden = true; }; photo.addEventListener('error', fallback); if (photo.complete && !photo.naturalWidth) fallback(); }
  try {
    const note = sessionStorage.getItem('factory_attendance_note');
    sessionStorage.removeItem('factory_attendance_note');
    if (note) { $('#welcome-attendance-note').textContent = note; $('#welcome-attendance-note').hidden = false; }
  } catch { /* Storage is optional. The actual latest check-in is server rendered. */ }
  let clock;
  try { clock = new Intl.DateTimeFormat('en-GB', {timeZone:document.body.dataset.timezone, hour:'2-digit',minute:'2-digit',hourCycle:'h23'}); }
  catch { clock = new Intl.DateTimeFormat('en-GB', {timeZone:'UTC',hour:'2-digit',minute:'2-digit'}); }
  const tick = () => { $('#welcome-clock').textContent = clock.format(new Date()); };
  tick(); setInterval(tick, 30000);
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('scene-paused', document.hidden));
  const checkinButton = $('#mark-employee-checkin');
  const checkoutButton = $('#mark-employee-checkout');
  const locationButton = $('#check-location');
  async function recordEvent(logType = 'IN', preview = false) {
    const status = $('#checkin-action-status');
    status.hidden = false;
    status.removeAttribute('data-state');
    if (document.body.dataset.preview === 'true') { status.textContent = 'Preview only. No attendance record was created.'; return; }
    const buttons = [checkinButton, checkoutButton, locationButton];
    buttons.forEach(button => {button.disabled = true; button.setAttribute('aria-busy','true');});
    status.textContent = 'Recording your employee check-in…';
    const abort = new AbortController(); let timeout;
    try {
      const coordinates = {log_type:logType, preview};
      if (checkinButton.dataset.requiresLocation === 'true' || preview) {
        status.textContent = 'Allow location access to record your employee check-in…';
        if (!window.isSecureContext || !navigator.geolocation) throw new Error('Location access requires HTTPS or localhost. Open the secure site to check in.');
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, error => {
          const messages = {1:'Location permission was denied. Allow location in your browser’s site settings, then retry.',2:'Your location could not be determined. Enable device location and retry.',3:'Location lookup timed out. Please retry.'};
          reject(new Error(messages[error.code] || 'Location unavailable. Please retry.'));
        }, {enableHighAccuracy:true, timeout:20000, maximumAge:0}));
        coordinates.latitude = position.coords.latitude;
        coordinates.longitude = position.coords.longitude;
        $('#location-readiness').textContent = `Location acquired · accuracy approximately ${Math.round(position.coords.accuracy || 0)} m. Checking shift rules…`;
      }
      status.textContent = 'Recording your employee check-in…';
      timeout = setTimeout(() => abort.abort(),15000);
      const response = await fetch('/api/method/my_space.www.welcomes.mark_employee_checkin', {
        method:'POST',credentials:'same-origin',signal:abort.signal,body:JSON.stringify(coordinates),headers:{'Content-Type':'application/json','X-Frappe-CSRF-Token':$('#welcome-csrf').value,'Accept':'application/json'}
      });
      const data = await response.json();
      if (!response.ok) {
        let detail = response.status === 429 ? 'Too many attempts. Please wait a minute.' : 'Check-in could not be recorded. Please contact your supervisor or try again.';
        try { const messages = JSON.parse(data._server_messages || '[]'); if (messages.length) detail = new DOMParser().parseFromString(JSON.parse(messages[0]).message, 'text/html').body.textContent; } catch { /* Use the generic message. */ }
        throw new Error(detail);
      }
      if (preview && data.message?.ready) { $('#location-readiness').textContent=data.message.message; status.textContent='Location check complete. No attendance record created.'; return; }
      if (!data.message?.timestamp) throw new Error('No check-in confirmation was received. Please retry.');
      status.textContent = `${data.message.message} ${data.message.timestamp}`;
      status.dataset.state = 'success';
      if (logType === 'IN') $('#latest-gate-checkin').textContent = data.message.timestamp;
      $('#attendance-state').textContent = `${logType === 'OUT' ? 'Checked out' : 'Checked in'} · ${data.message.timestamp}`;
      if ($('#workspace-attendance').textContent === 'No submitted attendance for today') $('#workspace-attendance').textContent = 'Pending HR processing';
      if (logType === 'IN' && $('#workspace-first-in').textContent !== 'Not recorded') {
        let warning = $('#punch-warning');
        if (!warning) {warning=document.createElement('p');warning.id='punch-warning';warning.className='punch-warning';warning.setAttribute('role','status');$('#session-login-time').parentElement.appendChild(warning);}
        warning.textContent='Another IN was recorded today. Review your timeline for repeated IN events.';
      }
      const todayTime = data.message.timestamp.split(' · ').pop();
      if (logType === 'OUT') $('#workspace-latest-out').textContent = todayTime;
      else if ($('#workspace-first-in').textContent === 'Not recorded') $('#workspace-first-in').textContent = todayTime;
      $('#location-readiness').textContent = checkinButton.dataset.requiresLocation === 'true' ? 'Location accepted by HRMS for this event.' : 'Location is not required by your HR settings.';
      $('.welcome-session-strip').classList.add('checkin-recorded');
      void loadTodayReport();
      pose('stamp'); say(logType === 'OUT' ? 'Check-out recorded. See you next shift!' : 'Check-in recorded. You’re ready for your shift.');
      const version = ++animation;
      setTimeout(() => { if (version === animation) pose('welcome'); }, lowMotion ? 0 : 700);
    } catch (error) {
      status.textContent = error.name === 'AbortError' ? 'Confirmation timed out. Reload to check the latest event before retrying; another submission creates a new event.' : (error instanceof TypeError ? 'Connection unavailable. Please retry.' : error.message);
      status.dataset.state = 'error';
      checkinButton.disabled = false;
      $('#location-readiness').textContent = status.textContent;
    } finally { clearTimeout(timeout); buttons.forEach(button => {button.disabled=false;button.removeAttribute('aria-busy');}); }
  }
  if (checkinButton) {
    checkinButton.addEventListener('click', () => recordEvent('IN'));
    checkoutButton.addEventListener('click', () => recordEvent('OUT'));
    locationButton.addEventListener('click', () => recordEvent('IN',true));
    if (navigator.permissions) navigator.permissions.query({name:'geolocation'}).then(permission => {
      const show = () => {$('#location-readiness').textContent = `Location permission: ${permission.state}. Use Check location readiness to test your current position.`;};
      show(); permission.addEventListener('change',show);
    }).catch(() => {});
  }
  let favorites=[];
  try {const stored=JSON.parse(localStorage.getItem(preferenceKey + ':pins') || '[]'); if (Array.isArray(stored)) favorites=stored;} catch {}
  const modules=[...document.querySelectorAll('.work-module')];
  function renderPins() { modules.forEach(card => {const pinned=favorites.includes(card.dataset.module);card.style.order=pinned ? '-1':'0';const button=card.querySelector('.pin-module');button.setAttribute('aria-pressed',String(pinned));button.textContent=pinned ? '★ Pinned':'☆ Pin';}); }
  modules.forEach(card => {
    card.querySelector('.pin-module').addEventListener('click',() => {const key=card.dataset.module;favorites=favorites.includes(key)?favorites.filter(value=>value!==key):[...favorites,key];try {localStorage.setItem(preferenceKey + ':pins',JSON.stringify(favorites));} catch {} renderPins();});
    card.querySelectorAll('a').forEach(link => link.addEventListener('focus',() => {pose(lowMotion ? 'welcome' : 'point');say('Your next stop: ' + card.querySelector('strong').textContent.replace('↗','').trim());}));
  });
  const moduleSearch = $('#workspace-module-search');
  const previousModuleOpen = new Map();
  moduleSearch?.addEventListener('input', () => {
    const term = moduleSearch.value.trim().toLocaleLowerCase();
    let visible = 0;
    modules.forEach(card => {
      const details = card.querySelector('.module-group');
      const name = card.querySelector('strong').textContent.toLocaleLowerCase();
      if (term && !previousModuleOpen.has(card)) previousModuleOpen.set(card, details.open);
      let matches = 0;
      card.querySelectorAll('.module-document-links a').forEach(link => {link.hidden = Boolean(term && !name.includes(term) && !link.textContent.toLocaleLowerCase().includes(term));if(!link.hidden)matches++;});
      card.hidden = Boolean(term && !matches && !name.includes(term));
      if (!card.hidden) visible++;
      if (term) details.open = !card.hidden;
      else if (previousModuleOpen.has(card)) {details.open = previousModuleOpen.get(card);previousModuleOpen.delete(card);}
    });
    $('#workspace-module-search-empty').hidden = visible > 0;
  });
  renderPins();
  let todayReportPending;
  async function loadTodayReport() {
    const report=$('#today-inout-report');
    if (!report || report.dataset.canLoad !== 'true') return;
    if (todayReportPending) return todayReportPending;
    const status=$('#today-inout-status'), rows=$('#today-inout-rows'), refresh=$('#refresh-today-inout');
    refresh.disabled=true;refresh.setAttribute('aria-busy','true');
    status.textContent='Loading today’s IN / OUT…';
    todayReportPending=(async()=>{
      if(document.body.dataset.preview==='true'){status.textContent='Preview only. Live employee events appear after signing in.';return;}
      const abort=new AbortController(), timer=setTimeout(()=>abort.abort(),15000);
      try {
        const response=await fetch('/api/method/my_space.www.welcomes.get_today_checkins',{method:'POST',credentials:'same-origin',signal:abort.signal,headers:{'X-Frappe-CSRF-Token':$('#welcome-csrf').value,'Accept':'application/json'}});
        if(!response.ok)throw new Error('Unable to load your IN / OUT report. Use Refresh to retry.');
        const payload=(await response.json()).message;
        if(!payload||!Array.isArray(payload.events))throw new Error('No check-in details received. Use Refresh to retry.');
        rows.replaceChildren();
        const ins=payload.events.filter(event=>event.log_type==='IN').length,outs=payload.events.filter(event=>event.log_type==='OUT').length;
        status.textContent=payload.date+' · '+(payload.events.length?`${ins} IN · ${outs} OUT${payload.truncated?' · Latest 500 events':''}`:'No events recorded today.');
        payload.events.forEach(event=>{
          const row=document.createElement('tr');
          [event.log_type,event.time,event.device_id||'Not specified'].forEach((value,index)=>{
            const cell=document.createElement('td');
            if(index===0){const badge=document.createElement('span');badge.className='inout-badge '+(value==='IN'?'inout-in':value==='OUT'?'inout-out':'');badge.textContent=String(value);cell.appendChild(badge);}
            else cell.textContent=String(value);
            row.appendChild(cell);
          });rows.appendChild(row);
        });
        if(!payload.events.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=3;cell.textContent='No check-ins or check-outs recorded today.';row.appendChild(cell);rows.appendChild(row);}
      }catch(error){rows.replaceChildren();status.textContent=error.name==='AbortError'?'Loading timed out. Use Refresh to retry.':error.message;}
      finally{clearTimeout(timer);}
    })().finally(()=>{todayReportPending=null;refresh.disabled=false;refresh.removeAttribute('aria-busy');});
    return todayReportPending;
  }
  $('#refresh-today-inout').addEventListener('click',loadTodayReport);
  new MutationObserver(()=>{if(!$('#panel-work').hidden)loadTodayReport();}).observe($('#panel-work'),{attributes:true,attributeFilter:['hidden']});
  const historyDialog = $('#today-checkins-dialog');
  $('#close-today-checkins').addEventListener('click', () => historyDialog.close());
  document.querySelectorAll('[data-today-checkins]').forEach(button => button.addEventListener('click', async () => {
    historyDialog.showModal();
    const status=$('#today-checkins-status'), rows=$('#today-checkins-rows');
    rows.replaceChildren();status.textContent='Loading today’s events…';
    if (document.body.dataset.preview === 'true') {status.textContent='Preview only. Live employee events appear here after signing in.';return;}
    const abort=new AbortController(), timer=setTimeout(()=>abort.abort(),15000);
    try {
      const response=await fetch('/api/method/my_space.www.welcomes.get_today_checkins',{method:'POST',credentials:'same-origin',signal:abort.signal,headers:{'X-Frappe-CSRF-Token':$('#welcome-csrf').value,'Accept':'application/json'}});
      if (!response.ok) throw new Error('Could not load your check-ins. Close and reopen to retry.');
      const payload=(await response.json()).message;
      if (!payload || !Array.isArray(payload.events)) throw new Error('No check-in details received. Please retry.');
      status.textContent=payload.date + ' · ' + (payload.events.length ? `${payload.events.length} events${payload.truncated ? ' (latest 500)' : ''}` : 'No events recorded today.');
      payload.events.forEach(event => {
        const tr=document.createElement('tr');
        const location=event.latitude != null && event.longitude != null && (Number(event.latitude) !== 0 || Number(event.longitude) !== 0) ? `${event.latitude}, ${event.longitude}` : 'Not recorded';
        [event.log_type,event.time,event.device_id || 'Not specified',location].forEach(value=>{const td=document.createElement('td');td.textContent=String(value);tr.appendChild(td);});rows.appendChild(tr);
      });
    } catch(error) {status.textContent=error.name === 'AbortError' ? 'Loading timed out. Close and reopen to retry.' : error.message;}
    finally {clearTimeout(timer);}
  }));
  $('#welcome-signout').addEventListener('click', async () => {
    if (document.body.dataset.preview === 'true') { $('#welcome-status').textContent = 'This is a sample welcome page.'; return; }
    const button = $('#welcome-signout'); button.disabled = true;
    const abort = new AbortController(); const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch('/api/method/logout', {method:'POST',credentials:'same-origin',signal:abort.signal,headers:{'X-Frappe-CSRF-Token':$('#welcome-csrf').value}});
      if (!response.ok) throw new Error('Sign out failed');
      location.replace('/login?redirect-to=%2Fwelcomes');
    } catch { $('#welcome-status').textContent = 'Could not sign out. Please check your connection and try again.'; button.disabled = false; }
    finally { clearTimeout(timeout); }
  });
  select(location.hash === '#process' ? 'process' : 'profile');
})();
