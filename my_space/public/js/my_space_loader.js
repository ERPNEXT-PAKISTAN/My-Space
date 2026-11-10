/* Own website interface: no Desk route, iframe, sidebar, or Desk boot. */
(() => {
  const panel = document.getElementById('panel-approvals');
  const root = panel.querySelector('.msa-app');
  const layout = document.querySelector('.welcome-layout');
  const reviewSlot = document.getElementById('my-space-review-slot');
  const controls = root.querySelector('.msa-controls');
  reviewSlot.appendChild(controls);
  reviewSlot.setAttribute('aria-label','Approval controls');
  const status = document.getElementById('my-space-load-status');
  let pending;
  function script(src) {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = src;
      element.onload = resolve;
      element.onerror = () => { element.remove(); reject(new Error('Unable to load the document center.')); };
      document.body.appendChild(element);
    });
  }
  async function mount(force = false) {
    if (pending) return pending;
    if ((!force && panel.hidden) || root.dataset.mounted) return;
    status.hidden = false;
    status.textContent = 'Loading your document center…';
    root.hidden = true;
    pending = (async () => {
      const response = await fetch('/api/method/my_space.approvals.get_boot', {
        method:'POST',credentials:'same-origin',headers:{'X-Frappe-CSRF-Token':document.getElementById('welcome-csrf').value,'Accept':'application/json'}
      });
      const payload = await response.json();
      if (!response.ok || !payload.message) throw new Error(response.status === 403 ? 'Document Center requires a Desk user account with document permissions.' : 'Unable to load the document center. Please try again.');
      const boot = payload.message;
      window.frappe = window.frappe || {};
      Object.assign(window.frappe, {boot, sys_defaults:boot.sysdefaults, session:boot.session, user_roles:boot.user_roles, csrf_token:document.getElementById('welcome-csrf').value, ready_events:[]});
      frappe.ready = fn => frappe.ready_events.push(fn);
      if (!frappe.ui?.Dialog) await script(window.mySpaceAssets.runtime_js);
      frappe.session = boot.session;
      frappe.user_roles = boot.user_roles;
      frappe.defaults.get_user_permissions = () => boot.user_permissions || {};
      frappe.user_info = user => ({fullname:user === boot.session.user ? boot.session.user_fullname : user});
      frappe.user.has_role = roles => (Array.isArray(roles) ? roles : [roles]).some(role => boot.user_roles.includes(role));
      frappe.unscrub = frappe.model.unscrub;
      // Full ERP forms open separately, leaving Approvals and its review state in place.
      frappe.set_route = (...route) => {
        if (Array.isArray(route[0])) route = route[0];
        const slug = value => String(value).toLowerCase().replace(/ /g,'-');
        let url;
        if (route[0] === 'Form') url = `/desk/${encodeURIComponent(slug(route[1]))}/${encodeURIComponent(route[2] || 'new-'+slug(route[1]))}`;
        else if (route[0] === 'List') url = `/desk/${encodeURIComponent(slug(route[1]))}`;
        else url = '/desk/'+route.map(encodeURIComponent).join('/');
        if (frappe.route_options && Object.keys(frappe.route_options).length) url += '?'+new URLSearchParams(frappe.route_options);
        frappe.route_options = {};
        window.open(url,'_blank','noopener');
        return Promise.resolve();
      };
      frappe.ui.form.make_quick_entry = doctype => frappe.set_route('Form',doctype);
      if (!window.MySpaceReview) await script(window.mySpaceAssets.review_js);
      if (!window.mountMySpaceApprovals) await script(window.mySpaceAssets.approvals_js);
      root.hidden = false;
      window.mountMySpaceApprovals(root);
      root.dataset.mounted = 'true';
      status.hidden = true;
      layout.addEventListener('click', event => {
        if (!event.target.closest('.msa-app')) return;
        const link = event.target.closest('a[href^="/desk/"],a[href^="/app/"],a[href^="/printview"]');
        if (link) {link.target='_blank';link.rel='noopener';}
      });
    })().catch(error => {
      root.hidden = true;
      status.textContent = error.message+' ';
      const retry = document.createElement('button');
      retry.type='button';retry.textContent='Retry';
      retry.onclick = mount;
      status.appendChild(retry);
    }).finally(() => { pending = null; });
    return pending;
  }
  window.ensureMySpaceRuntime = () => mount(true);
  function updateTabLayout() {
    const active = !panel.hidden;
    reviewSlot.hidden = !active;
    layout.dataset.reviewActive = String(active);
    mount();
  }
  new MutationObserver(updateTabLayout).observe(panel,{attributes:true,attributeFilter:['hidden']});
  updateTabLayout();
})();
