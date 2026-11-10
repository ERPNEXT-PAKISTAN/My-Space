frappe.pages['my-space-flowtrack'].on_page_load = function (wrapper) {

	// Keep the full Desk runtime for dialogs and review, with only this page visible in Approvals.
	if (window.self !== window.top && window.frameElement?.id === 'my-space-approvals-frame') {
		document.body.classList.add('my-space-embedded');
		if (!document.getElementById('my-space-embedded-style')) {
			const style = document.createElement('style');
			style.id = 'my-space-embedded-style';
			style.textContent = `body.my-space-embedded {background:#f6f8fc;--sidebar-width:0px;--sidebar-collapsed-width:0px;} .my-space-embedded .body-sidebar-container,.my-space-embedded .dock,.my-space-embedded .sidebar-edge,.my-space-embedded .navbar,.my-space-embedded .desk-sidebar,.my-space-embedded .layout-side-section,.my-space-embedded .page-head,.my-space-embedded .app-dock,.my-space-embedded .workspace-sidebar {display:none!important;} .my-space-embedded .main-section {padding:0!important;} .my-space-embedded .container,.my-space-embedded .page-container {width:100%!important;max-width:none!important;} .my-space-embedded .layout-main-section-wrapper {margin:0!important;padding:0!important;} .my-space-embedded .ft-app {margin:0;padding:12px;}`;
			document.head.appendChild(style);
		}
	}
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __('FlowTrack'), single_column: true });
	page.body.append(frappe.render_template('my_space_flowtrack', {}));
	const root = page.body.find('.ft-app').get(0);
	const $ = (s) => root.querySelector(s);
	const esc = frappe.utils.escape_html;
	const API = 'my_space.my_space.page.my_space_flowtrack.my_space_flowtrack.';
	const state = {modules: [], companies: [], module: 'sales', view:'recent', stage: null, start: 0, pageLength: 20, busy: false, recentMode: true};
	const moduleStyle = {
		sales:['#3659d9','#edf2ff','sales'],buying:['#b77919','#fff6e5','buying'],stock:['#078b76','#e7f7f2','stock'],accounts:['#7850cf','#f2edff','accounts'],manufacturing:['#587086','#edf2f6','manufacturing'],hr:['#c64d7a','#fff0f5','hr'],projects:['#0887a4','#e8f7fc','projects'],crm:['#6b5ac9','#f0edff','crm']
	};
	function icon(name) {
		const paths={flow:'M5 5h5v5H5zM14 14h5v5h-5zM14 5h5v5h-5zM7.5 10v6.5H14M10 7.5h4',plus:'M12 5v14M5 12h14',refresh:'M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 14-1l1 6M4 12l1 6a8 8 0 0 0 14-1',reset:'M4 10a8 8 0 1 1 1 8M4 4v6h6',search:'M21 21l-5-5M18 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',file:'M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6',review:'M8 12l3 3 5-6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',sales:'M4 17l6-6 4 4 6-10M14 5h6v6',buying:'M3 4h2l3 12h11l2-8H6M9 20h1M17 20h1',stock:'M3 7l9-4 9 4v11l-9 4-9-4zM3 7l9 4 9-4M12 11v11',accounts:'M4 6h16v14H4zM4 10h16M14 14h3M7 3v3',manufacturing:'M3 21V10l6 4V7l6 6V3h5v18zM6 18h1M11 18h1M16 18h1',hr:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4',projects:'M9 5H5v16h14V5h-4M9 3h6v4H9zM8 13l2 2 5-5',crm:'M4 21v-2a5 5 0 0 1 5-5h4M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M17 16h5M19.5 13.5v5'};
		return `<svg class="ft-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.flow}"/></svg>`;
	}
	root.querySelectorAll('[data-ft-icon]').forEach(el=>el.innerHTML=icon(el.dataset.ftIcon));
	let review;
	const reviewReady = new Promise((resolve, reject) => {
		frappe.require(['/assets/flow/css/flowtrack_review.css', '/assets/flow/js/flowtrack_review.js'], () => {
			try {
				review = new window.FlowTrackReview($('#ft-review'), {
					onRefresh: () => {state.start=0;return loadDocuments(state.recentMode);},
					onSelect: row => {
						$('#ft-review-entry').textContent='· '+row.name;
						state.selected = `${row.doctype}::${row.name}`;
						$('#ft-records').querySelectorAll('tr').forEach(tr => tr.classList.toggle('ft-selected', tr.dataset.key === state.selected));
					}
				});
				wrapper.flowtrack_review = review;
				resolve(review);
			} catch (error) { reject(error); }
		});
	});
	async function openReview(row, scroll=true) {
		try {
			await reviewReady;
			await review.review(row);
			if (scroll && window.innerWidth <= 1200) $('#ft-review').scrollIntoView?.({behavior:'smooth', block:'start'});
		} catch (error) { showError(error); }
	}
	$('#ft-review-refresh').onclick = async () => {
		await reviewReady;
			if (review.currentReview) await openReview(review.currentReview.row);
	};
	$('#ft-avatar').textContent = (frappe.session.user_fullname || frappe.session.user || 'U').split(/[ @]/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase();

	function showError(error) {
		const message = error?.message || error || __('Something went wrong. Please try again.');
		frappe.show_alert({message: esc(String(message).slice(0, 250)), indicator: 'red'});
	}
	function currentModule() { return state.modules.find(m => m.key === state.module); }
	function currentStage() { const module = currentModule(); return module?.stages.find(s => s.doctype === state.stage) || module?.stages.find(s => s.available && s.permitted) || module?.stages.find(s => s.available); }
	function renderNav() {
		const palette=moduleStyle[state.module]||moduleStyle.sales;
		root.style.setProperty('--ft-accent',palette[0]);root.style.setProperty('--ft-accent-bg',palette[1]);
		$('#ft-tabs').innerHTML = state.modules.map(m => {
			const [color,tint,glyph]=moduleStyle[m.key]||moduleStyle.sales;
			const count=m.stages.filter(s=>s.available&&s.permitted).length;
			return `<button type="button" class="ft-tab ${m.key === state.module ? 'active' : ''}" data-module="${esc(m.key)}" aria-pressed="${m.key===state.module}" style="--module-color:${color};--module-tint:${tint}"><span class="ft-module-icon">${icon(glyph)}</span><span>${esc(m.label)}</span><span class="ft-module-count" title="${esc(__('Available stages'))}">${count}</span></button>`;
		}).join('');
		$('#ft-tabs').querySelectorAll('[data-module]').forEach(btn => btn.onclick = () => selectModule(btn.dataset.module));

	}
	function renderStats() {
		const stages = state.modules.flatMap(m => m.stages).filter(s => s.available && s.permitted);
		const active = new Set(stages.map(s => s.doctype)).size;
		const drafts = stages.reduce((n,s) => n + (Number(s.draft) || 0), 0);
		$('#ft-stats').innerHTML = [
			['Available DocTypes', active, 'Distinct installed, readable types', '⇢'],
			['Draft documents', drafts, 'Across permitted stages', '◷'],
			['Live workflow stages', stages.length, 'Installed and readable stages', '✓'],
			['Enabled modules', state.modules.length, 'Available to your account', '▤']
		].map(s => `<span class="ft-summary-value" title="${esc(__(s[2]))}"><span class="ft-summary-tick" aria-hidden="true">✓</span><span>${esc(__(s[0]))}</span><strong>${s[1]}</strong></span>`).join('');
	}
	function renderFlow() {
		const module = currentModule();
		if (!module) return;
		$('#ft-flow-title').textContent = `${module.label} workflow`;
		$('#ft-flow').innerHTML = module.stages.map((s,index) => {
			const accessible = s.available && s.permitted;
			const label = !s.available ? __('Not installed') : !s.permitted ? __('No access') : s.count == null ? __('Count unavailable') : __('{0} records', [s.count]);
			const selected = state.stage === s.doctype;
			return `<button type="button" class="ft-step ${selected ? 'active' : ''}" data-doctype="${esc(s.doctype)}" aria-pressed="${selected}" ${accessible ? '' : 'disabled'}><span class="ft-step-heading"><span class="ft-step-marker ${accessible && Number(s.count)>0 ? 'has-records' : ''}" aria-hidden="true">${accessible && Number(s.count)>0 ? '✓' : index+1}</span><span class="ft-step-name">${esc(s.doctype)}</span>${selected ? `<span class="ft-step-selected">${__('Selected')}</span>` : ''}</span><span class="ft-step-count"><strong>${esc(label)}</strong>${accessible && s.draft != null ? `<span class="ft-step-drafts">${esc(__('{0} draft', [s.draft]))}</span>` : ''}</span></button>`;
		}).join('');
		$('#ft-flow').querySelectorAll('[data-doctype]').forEach(el => {
			el.onclick = () => {state.view='stage';state.stage = el.dataset.doctype;updateWorkViews();state.start = 0;renderFlow();loadDocuments();};
		});
		$('#ft-new').disabled = !currentStage()?.can_create;
	}
	async function loadDashboard() {
		try {
			const result = await frappe.call(API + 'get_dashboard');
			state.modules = result.message?.modules || []; state.companies = result.message?.companies || [];state.recentRows = result.message?.recent || [];
			$('#ft-company').innerHTML = '<option value="">'+esc(__('All companies'))+'</option>' + state.companies.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
			if (!state.modules.some(m => m.key === state.module)) state.module = state.modules[0]?.key;
			renderNav(); renderStats(); renderFlow(); await loadDocuments(true);
		} catch (error) { showError(error); }
	}
	function statusLabel(row) {
		if(row.status_label)return __(row.status_label);
		if(row.is_submittable===false)return __(row.status||'Saved');
		if (row.docstatus === 2) return __('Cancelled');
		if (row.docstatus === 0) return __('Draft');
		return row.status || __('Submitted');
	}
	function renderRows(rows, append=false) {
		const tbody = $('#ft-records');
		if (!append) tbody.innerHTML = '';
		rows.forEach(row => {
			const status = statusLabel(row);
			const cls = row.doctype==='ToDo'?(row.status==='Closed'?'submitted':row.status==='Cancelled'?'cancelled':'task-open'):row.doctype==='Employee Checkin'?'checkin':row.is_submittable===false?'record':row.docstatus===0?'draft':row.docstatus===1?'submitted':'';
			const party = row.doctype==='ToDo'?row.title||'ToDo':row.customer || row.supplier || row.employee_name || row.employee || row.project || row.subject || row.title || '—';
			const tr = document.createElement('tr');
			const date=row.entry_date||row.creation;
			const amount=row.amount!=null&&Number.isFinite(Number(row.amount))?`${row.currency?esc(row.currency)+' ':''}${Number(row.amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`:'';
			tr.innerHTML = `<td><button class="ft-doc" data-doctype="${esc(row.doctype)}" data-name="${esc(row.name)}">${esc(row.name)}</button><span class="ft-subcell">${esc(row.doctype)}</span><div class="ft-entry-dates">${date?`<span><span>${esc(__(row.entry_date_label||'Created'))}</span>${esc(frappe.datetime.str_to_user(String(date)))}</span>`:''}${row.modified?`<span><span>${__('Modified')}</span>${esc(frappe.datetime.str_to_user(String(row.modified)))}</span>`:''}</div></td><td class="ft-entry-title"><span>${esc(party)}</span>${row.reference_preview?`<small class="ft-task-reference">${esc(row.reference_preview.doctype)} · ${esc(row.reference_preview.name)}</small>`:''}${amount?`<strong class="ft-entry-amount" title="${esc(row.amount_label||__('Amount'))}">${amount}</strong>`:''}</td><td><span class="ft-status ${cls} ${row.docstatus===2?'cancelled':''}">${esc(status)}</span></td><td class="ft-entry-action"></td>`;
			tr.dataset.key = `${row.doctype}::${row.name}`;tr.classList.toggle('ft-selected',tr.dataset.key === state.selected);
			tr.querySelector('.ft-doc').onclick = () => openReview(row);
			const button=document.createElement('button');button.className='ft-btn ft-review-button';button.textContent=__('Review');button.onclick=()=>openReview(row);tr.querySelector('.ft-entry-action').appendChild(button);
			tbody.appendChild(tr);
		});
		$('#ft-empty').hidden = tbody.children.length > 0;$('#ft-record-count').textContent=__('{0} loaded',[tbody.children.length]);
		if (!append && rows.length && !state.selected) openReview(rows[0],false);
	}
	async function loadDocuments(recent=false) {
        if(['todos','assigned','checkins','drafts','submitted'].includes(state.view))return loadWork();
        state.workSequence=(state.workSequence||0)+1;
        state.view=recent?'recent':'stage';updateWorkViews();$('#ft-work-note').textContent='';
		state.recentMode = recent;
		const doctype = recent ? null : (state.stage || currentStage()?.doctype);
		state.stage = doctype || state.stage;$('#ft-records-title').textContent=recent?__('Recent documents'):doctype||__('Documents');
		$('#ft-records').innerHTML = '';
		$('#ft-empty').hidden = true;
		$('#ft-more').hidden = true;
		if (recent) {
			// Dashboard's recent records are already permission-filtered through get_list.
			try {
				const message = {recent: state.recentRows || []};
				const rows = message.recent;
				state.recentRows = rows;
				renderRows(rows);
			} catch (error) { showError(error); }
			return;
		}
		if (!doctype) { $('#ft-empty').hidden = false; return; }
		state.recentMode = false;
		$('#ft-flow-title').textContent = `${currentModule()?.label || ''} · ${doctype}`;
		try {
			const {message} = await frappe.call(API + 'get_documents', {doctype, search: $('#ft-search').value, start: state.start, page_length: state.pageLength, company: $('#ft-company').value, status: $('#ft-status').value, date_from: $('#ft-from').value, date_to: $('#ft-to').value});
			renderRows(message?.rows || []);
			$('#ft-more').hidden = !message?.has_more;
		} catch (error) { showError(error); }
	}
	const workLabels={recent:__('Recent documents'),todos:__('My ToDo'),assigned:__('Assigned to Me · Open'),checkins:__('Employee Checkin'),drafts:__('Draft · Not Final'),submitted:__('Submitted · Final')};
	function updateWorkViews(){
		root.querySelectorAll('[data-work-view]').forEach(button=>{const active=button.dataset.workView===state.view;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
		const select=$('#ft-status'),value=select.value;
		const personal=['todos','assigned','checkins'].includes(state.view);$('#ft-company').disabled=personal;$('#ft-company').title=personal?__('Company filtering is available in document views.'):'';if(personal)$('#ft-company').value='';
		const options=['todos','assigned'].includes(state.view)?['Open','Closed','Cancelled']:state.view==='checkins'||state.stage==='Employee Checkin'?['IN','OUT']:['Draft','Submitted','Cancelled'];
		select.innerHTML=`<option value="">${esc(__('All statuses'))}</option>`+options.map(v=>`<option value="${v}">${esc(__(v))}</option>`).join('');
		select.value=options.includes(value)?value:'';
	}
	async function loadWork(){
		const sequence=state.workSequence=(state.workSequence||0)+1;
		$('#ft-records-title').textContent=workLabels[state.view];if(state.start===0)$('#ft-records').innerHTML='';$('#ft-empty').hidden=true;$('#ft-more').hidden=true;
		try{
			const {message}=await frappe.call(API+'get_work',{view:state.view,start:state.start,page_length:state.pageLength,record_limit:100,search:$('#ft-search').value,company:$('#ft-company').value,status:$('#ft-status').value,date_from:$('#ft-from').value,date_to:$('#ft-to').value});
			if(sequence!==state.workSequence)return;
			renderRows(message?.rows||[],state.start>0);$('#ft-more').hidden=!message?.has_more;
			$('#ft-work-note').textContent=message?.truncated?__('Latest {0} records · refine filters for older entries',[message.record_limit]):__('{0} entries in this view',[message?.window_count||0]);
		}catch(error){showError(error);}
	}
	root.querySelectorAll('[data-work-view]').forEach(button=>button.onclick=()=>{
		if(review&&!review.ensureClean())return;state.selected=null;
		state.view=button.dataset.workView;state.stage=null;state.start=0;state.workSequence=(state.workSequence||0)+1;
		$('#ft-status').value='';updateWorkViews();updateFilterSummary();renderFlow();loadDocuments(state.view==='recent');
	});
	async function openQuickEntryPicker() {
		const choices = [];
		const seen = new Set();
		for (const module of state.modules) {
			for (const stage of module.stages) {
				if (stage.available && stage.can_create && !seen.has(stage.doctype)) {
					seen.add(stage.doctype);
					choices.push(stage.doctype);
				}
			}
		}
		if (!choices.length) {
			frappe.show_alert({message:__('No document types are available for creation.'), indicator:'orange'});
			return;
		}
		const picker = new frappe.ui.Dialog({
			title: __('Quick Entry'),
			fields: [{fieldname:'doctype', label:__('Document Type'), fieldtype:'Select', options:choices, reqd:1}],
			primary_action_label: __('Continue'),
			primary_action: values => {picker.hide(); openQuickEntry(values.doctype);}
		});
		picker.show();
	}
	function selectModule(key) {
		if (key === 'overview') {state.module = state.modules[0]?.key; state.stage = null; state.recentMode = true; renderNav(); renderFlow(); loadDocuments(true); return;}
		state.module = key; state.view='stage';updateWorkViews();state.stage = null; state.recentMode = false;
		renderNav(); renderFlow(); loadDocuments();
	}
	async function openQuickEntry(doctype) {
		if (!doctype) return;
		let config;
		try { config = (await frappe.call(API + 'get_entry_config', {doctype})).message; }
		catch (error) { showError(error); return; }
		if (!config?.fields?.length) {
			frappe.confirm(__('Quick Entry has no configured fields for {0}. Open the full form?', [doctype]), () => frappe.set_route(...config.full_form_route));
			return;
		}
		const fields = config.fields.map(f => ({fieldname:f.fieldname,label:__(f.label || f.fieldname),fieldtype:f.fieldtype,options:Array.isArray(f.options)?f.options.join('\n'):f.options,reqd:f.reqd,default:f.default}));
		let dialog;
		dialog = new frappe.ui.Dialog({title:__('New {0}', [doctype]), fields,
			primary_action_label:__('Save draft'), primary_action: async values => {
				if (state.busy) return; state.busy = true; dialog.get_primary_btn().prop('disabled', true);
				try {
					const result = await frappe.call({method:API+'create_document', args:{doctype, values}, type:'POST'});
					dialog.hide(); frappe.show_alert({message:__('Draft {0} created', [result.message.name]), indicator:'green'});
					frappe.set_route('Form', result.message.doctype, result.message.name); await loadDashboard();
				} catch (error) { showError(error); }
				finally {state.busy = false; dialog.get_primary_btn().prop('disabled', false);}
			}
		});
		dialog.set_secondary_action(__('Open Full Form'), () => {const values = dialog.get_values() || {}; dialog.hide(); frappe.route_options = values; frappe.set_route(...config.full_form_route);});
		dialog.show();
	}
	$('#ft-quick-entry').onclick = openQuickEntryPicker;
	$('#ft-new').onclick = () => openQuickEntry(currentStage()?.doctype);
	$('#ft-refresh').onclick = async () => {$('#ft-refresh').disabled = true; await loadDashboard(); $('#ft-refresh').disabled = false;};
	function updateFilterSummary(){
		const count=['ft-search','ft-company','ft-status','ft-from','ft-to'].filter(id=>$('#'+id).value).length;
		$('#ft-filter-count').textContent=count?__('{0} active',[count]):__('No filters applied');
		root.querySelector('.ft-filter-panel').classList.toggle('has-filters',count>0);
	}
	const applyFilters = frappe.utils.debounce(() => {updateFilterSummary();state.start = 0;if(['recent','stage'].includes(state.view)){state.stage=state.stage||currentStage()?.doctype;renderFlow();}loadDocuments();}, 300);
	$('#ft-search').addEventListener('input', applyFilters);
	['ft-company','ft-status','ft-from','ft-to'].forEach(id => $('#'+id).addEventListener('change', applyFilters));
	$('#ft-clear').onclick = () => {['ft-search','ft-company','ft-status','ft-from','ft-to'].forEach(id=>$('#'+id).value='');updateFilterSummary();state.start=0;loadDocuments(state.recentMode);};
	$('#ft-more').onclick = async () => {state.start += state.pageLength;if(['todos','assigned','checkins','drafts','submitted'].includes(state.view))return loadWork(); const doctype = state.stage || currentStage()?.doctype; try {const {message} = await frappe.call(API+'get_documents',{doctype, search:$('#ft-search').value,start:state.start,page_length:state.pageLength,company:$('#ft-company').value,status:$('#ft-status').value,date_from:$('#ft-from').value,date_to:$('#ft-to').value}); renderRows(message?.rows||[],true); $('#ft-more').hidden=!message?.has_more;} catch(error){showError(error);}};
	loadDashboard();
};
