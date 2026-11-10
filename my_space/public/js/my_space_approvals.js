window.mountMySpaceApprovals = function (root) {
	const $ = (s) => root.querySelector(s) || document.getElementById('my-space-review-slot')?.querySelector(s);
    const all = selector => [...root.querySelectorAll(selector), ...document.getElementById('my-space-review-slot')?.querySelectorAll(selector) || []];
    const reviewSection = $('.msa-review-panel');
    const parking = $('.msa-review-parking');
    const parkReview = () => parking.appendChild(reviewSection);
    function attachReview(row) {
        if (!state.reviewExpanded) return false;
        const entry = [...$('#msa-records').children].find(card => card.dataset.key === `${row.doctype}::${row.name}`);
        if (!entry) return false;
        entry.querySelector('.msa-entry-review').appendChild(reviewSection);
        return true;
    }
    function updateReviewButtons() {
        $('#msa-records').querySelectorAll('.msa-document-card').forEach(card => {
            const open = state.reviewExpanded && card.dataset.key === state.selected;
            card.classList.toggle('msa-selected',open);
            const button=card.querySelector('.msa-review-button');
            button.setAttribute('aria-expanded',String(open));
            button.textContent=open?__('Hide review'):__('Review');
        });
    }
    function toggleReview(row) {
        if (state.reviewExpanded && state.selected === `${row.doctype}::${row.name}`) {
            if (!review.ensureClean()) return;
            state.reviewExpanded=false;state.selected=null;parkReview();updateReviewButtons();
            return;
        }
        return openReview(row);
    }
	const esc = frappe.utils.escape_html;
	const API = 'my_space.my_space.page.my_space_flowtrack.my_space_flowtrack.';
	const state = {modules: [], companies: [], module: 'sales', view:'recent', stage: null, start: 0, pageLength: 20, busy: false, recentMode: true, reviewExpanded:false};
	function icon(name) {
		const paths={flow:'M5 5h5v5H5zM14 14h5v5h-5zM14 5h5v5h-5zM7.5 10v6.5H14M10 7.5h4',plus:'M12 5v14M5 12h14',refresh:'M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 14-1l1 6M4 12l1 6a8 8 0 0 0 14-1',reset:'M4 10a8 8 0 1 1 1 8M4 4v6h6',search:'M21 21l-5-5M18 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',file:'M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6',review:'M8 12l3 3 5-6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',sales:'M4 17l6-6 4 4 6-10M14 5h6v6',buying:'M3 4h2l3 12h11l2-8H6M9 20h1M17 20h1',stock:'M3 7l9-4 9 4v11l-9 4-9-4zM3 7l9 4 9-4M12 11v11',accounts:'M4 6h16v14H4zM4 10h16M14 14h3M7 3v3',manufacturing:'M3 21V10l6 4V7l6 6V3h5v18zM6 18h1M11 18h1M16 18h1',hr:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4',projects:'M9 5H5v16h14V5h-4M9 3h6v4H9zM8 13l2 2 5-5',crm:'M4 21v-2a5 5 0 0 1 5-5h4M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M17 16h5M19.5 13.5v5'};
		return `<svg class="msa-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.flow}"/></svg>`;
	}
	document.querySelectorAll('.msa-app [data-msa-icon]').forEach(el=>el.innerHTML=icon(el.dataset.msaIcon));
	let review;
	const reviewReady = Promise.resolve().then(() => {
        review = new window.MySpaceReview($('#msa-review'), {
            onRefresh: () => {state.start=0;return loadDashboard(false);},
            onSelect: row => {
                $('#msa-review-entry').textContent='· '+row.name;
                state.selected = `${row.doctype}::${row.name}`;
                updateReviewButtons();
            }
        });
        return review;
    });
	async function openReview(row, scroll=true) {
		try {
			await reviewReady;
            if (!review.ensureClean()) return;
            state.reviewExpanded=true;state.selected=`${row.doctype}::${row.name}`;
            if (!attachReview(row)) {state.reviewExpanded=false;return;}
            updateReviewButtons();
			await review.review(row);
			if (scroll && window.innerWidth <= 1200) $('#msa-review').scrollIntoView?.({behavior:'smooth', block:'start'});
		} catch (error) { showError(error); }
	}
	$('#msa-review-refresh').onclick = async () => {
		await reviewReady;
			if (review.currentReview) await openReview(review.currentReview.row);
	};


	function showError(error) {
		const message = error?.message || error || __('Something went wrong. Please try again.');
		$('#msa-error').textContent=String(message).slice(0,250);$('#msa-error').hidden=false;frappe.show_alert({message: esc(String(message).slice(0,250)), indicator:'red'});
	}
	function currentModule() { return state.modules.find(m => m.key === state.module); }
	function currentStage() { const module = currentModule(); return module?.stages.find(s => s.doctype === state.stage) || module?.stages.find(s => s.available && s.permitted) || module?.stages.find(s => s.available); }
	function renderNav() {

		$('#msa-tabs').innerHTML = state.modules.map(m => {
			const glyph=m.key;
			const count=m.stages.filter(s=>s.available&&s.permitted).length;
			return `<button type="button" class="msa-tab ${m.key === state.module ? 'active' : ''}" data-module="${esc(m.key)}" aria-pressed="${m.key===state.module}"><span class="msa-module-icon">${icon(glyph)}</span><span>${esc(m.label)}</span><span class="msa-module-count" title="${esc(__('Available stages'))}">${count}</span></button>`;
		}).join('');
		$('#msa-tabs').querySelectorAll('[data-module]').forEach(btn => btn.onclick = () => selectModule(btn.dataset.module));

	}
	function renderStats() {
		const stages = state.modules.flatMap(m => m.stages).filter(s => s.available && s.permitted);
		const active = new Set(stages.map(s => s.doctype)).size;
		const drafts = stages.reduce((n,s) => n + (Number(s.draft) || 0), 0);
		$('#msa-stats').innerHTML = [
			['Available DocTypes', active, 'Distinct installed, readable types', '⇢'],
			['Draft documents', drafts, 'Across permitted stages', '◷'],
			['Live workflow stages', stages.length, 'Installed and readable stages', '✓'],
			['Enabled modules', state.modules.length, 'Available to your account', '▤']
		].map(s => `<span class="msa-summary-value" title="${esc(__(s[2]))}"><span class="msa-summary-tick" aria-hidden="true">✓</span><span>${esc(__(s[0]))}</span><strong>${s[1]}</strong></span>`).join('');
	}
	function renderFlow() {
		const module = currentModule();
		if (!module) return;
		$('#msa-flow-title').textContent = `${module.label} workflow`;
		$('#msa-flow').innerHTML = module.stages.map((s,index) => {
			const accessible = s.available && s.permitted;
			const label = !s.available ? __('Not installed') : !s.permitted ? __('No access') : s.count == null ? __('Count unavailable') : __('{0} records', [s.count]);
			const selected = state.stage === s.doctype;
			return `<button type="button" class="msa-step ${selected ? 'active' : ''}" data-doctype="${esc(s.doctype)}" aria-pressed="${selected}" ${accessible ? '' : 'disabled'}><span class="msa-step-heading"><span class="msa-step-marker ${accessible && Number(s.count)>0 ? 'has-records' : ''}" aria-hidden="true">${accessible && Number(s.count)>0 ? '✓' : index+1}</span><span class="msa-step-name">${esc(s.doctype)}</span>${selected ? `<span class="msa-step-selected">${__('Selected')}</span>` : ''}</span><span class="msa-step-count"><strong>${esc(label)}</strong>${accessible && s.draft != null ? `<span class="msa-step-drafts">${esc(__('{0} draft', [s.draft]))}</span>` : ''}</span></button>`;
		}).join('');
		$('#msa-flow').querySelectorAll('[data-doctype]').forEach(el => {
			el.onclick = () => {state.view='stage';state.stage = el.dataset.doctype;updateWorkViews();state.start = 0;renderFlow();loadDocuments();};
		});
		$('#msa-new').disabled = !currentStage()?.can_create;
	}
	async function loadDashboard(reset=true) {
		try {
			if(!dateRanges.valid())return;
			$('#msa-error').hidden=true;const selectedCompany=$('#msa-company').value;const result = await frappe.call(API + 'get_dashboard',{date_from:$('#msa-from').value,date_to:$('#msa-to').value});
			state.modules = result.message?.modules || []; state.companies = result.message?.companies || [];state.recentRows = result.message?.recent || [];
			$('#msa-company').innerHTML = '<option value="">'+esc(__('All companies'))+'</option>' + state.companies.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
			$('#msa-company').value=selectedCompany;
			if (!state.modules.some(m => m.key === state.module)) state.module = state.modules[0]?.key;
			renderNav(); renderStats(); renderFlow(); await loadDocuments(reset ? true : state.recentMode);
		} catch (error) { showError(error); }
	}
	function statusLabel(row) {
		if(row.status_label)return __(row.status_label);
		if(row.is_submittable===false)return __(row.status||'Saved');
		if (row.docstatus === 2) return __('Cancelled');
		if (row.docstatus === 0) return __('Draft');
		return row.status || __('Submitted');
	}
    function statusTone(value) {
        const text=String(value||'').toLowerCase();
        if (/cancel|reject|fail/.test(text)) return 'danger';
        if (/not |pending|draft|to bill|to deliver|to receive|open|unpaid|partly|overdue/.test(text)) return 'warning';
        if (/approved|complete|closed|paid|delivered/.test(text)) return 'success';
        if (/submitted|recorded|^in$|^out$/.test(text)) return 'info';
        return 'muted';
    }
	function renderRows(rows, append=false) {
		const tbody = $('#msa-records');
		if (!append) {parkReview();tbody.innerHTML = '';}
		rows.forEach(row => {
			const status = row.document_status_label || (row.is_submittable===false?'Recorded':({0:'Draft',1:'Submitted',2:'Cancelled'}[row.docstatus]||'Unknown'));
            const entryStatus = row.entry_status_label || row.status || row.approval_status || row.workflow_state || row.log_type || 'Not set';
			const cls = row.doctype==='ToDo'?(row.status==='Closed'?'submitted':row.status==='Cancelled'?'cancelled':'task-open'):row.doctype==='Employee Checkin'?'checkin':row.is_submittable===false?'record':row.docstatus===0?'draft':row.docstatus===1?'submitted':'';
			const party = row.doctype==='ToDo'?row.title||'ToDo':row.customer || row.supplier || row.employee_name || row.employee || row.project || row.subject || row.title || '—';
			const tr = document.createElement('article');
			const date=row.entry_date||row.creation;
			const amount=row.amount!=null&&Number.isFinite(Number(row.amount))?`${row.currency?esc(row.currency)+' ':''}${Number(row.amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`:'';
            tr.className='msa-document-card';
            tr.innerHTML = `<div class="msa-document-main"><button class="msa-doc" data-doctype="${esc(row.doctype)}" data-name="${esc(row.name)}">${esc(row.name)}</button><span class="msa-subcell">${esc(row.doctype)} · ${esc(party)}</span>${row.reference_preview?`<small>${esc(row.reference_preview.doctype)} · ${esc(row.reference_preview.name)}</small>`:''}<small>${date?esc(frappe.datetime.str_to_user(String(date))):''}${row.modified?' · Updated '+esc(frappe.datetime.str_to_user(String(row.modified))):''}</small><div class="msa-entry-statuses"><span class="msa-entry-status msa-tone-${statusTone(entryStatus)}"><small>Entry status</small><b>${esc(__(entryStatus))}</b></span><span class="msa-status ${cls} msa-tone-${statusTone(status)}"><small>Document status</small><b>${esc(__(status))}</b></span></div></div><div class="msa-document-meta">${amount?`<strong>${amount}</strong>`:''}<span class="msa-entry-action"></span></div><div class="msa-entry-review"></div>`;

			tr.dataset.key = `${row.doctype}::${row.name}`;tr.classList.toggle('msa-selected',tr.dataset.key === state.selected);
			tr.querySelector('.msa-doc').onclick = () => openReview(row);
			const button=document.createElement('button');button.className='msa-btn msa-review-button';button.textContent=__('Review');button.setAttribute('aria-expanded','false');button.onclick=()=>toggleReview(row);tr.querySelector('.msa-entry-action').appendChild(button);
			tbody.appendChild(tr);
		});
		$('#msa-empty').hidden = tbody.children.length > 0;$('#msa-record-count').textContent=__('{0} loaded',[tbody.children.length]);
		if (state.reviewExpanded && review?.currentReview) attachReview(review.currentReview.row);
        updateReviewButtons();

	}
	async function loadDocuments(recent=false) {
        if(['todos','assigned','checkins','drafts','submitted'].includes(state.view))return loadWork();
        state.workSequence=(state.workSequence||0)+1;
        state.view=recent?'recent':'stage';updateWorkViews();$('#msa-work-note').textContent='';
		state.recentMode = recent;
		const doctype = recent ? null : (state.stage || currentStage()?.doctype);
		state.stage = doctype || state.stage;$('#msa-records-title').textContent=recent?__('Recent documents'):doctype||__('Documents');
		parkReview();$('#msa-records').innerHTML = '';
		$('#msa-empty').hidden = true;
		$('#msa-more').hidden = true;
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
		if (!doctype) { $('#msa-empty').hidden = false; return; }
		state.recentMode = false;
		$('#msa-flow-title').textContent = `${currentModule()?.label || ''} · ${doctype}`;
		try {
			const {message} = await frappe.call(API + 'get_documents', {doctype, search: $('#msa-search').value, start: state.start, page_length: state.pageLength, company: $('#msa-company').value, status: $('#msa-status').value, date_from: $('#msa-from').value, date_to: $('#msa-to').value});
			renderRows(message?.rows || []);
			$('#msa-more').hidden = !message?.has_more;
		} catch (error) { showError(error); }
	}
	const workLabels={recent:__('Recent documents'),todos:__('My ToDo'),assigned:__('Assigned to Me · Open'),checkins:__('Employee Checkin'),drafts:__('Draft · Not Final'),submitted:__('Submitted · Final')};
	function updateWorkViews(){
		all('[data-work-view]').forEach(button=>{const active=button.dataset.workView===state.view;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
		const select=$('#msa-status'),value=select.value;
		const personal=['todos','assigned','checkins'].includes(state.view);$('#msa-company').disabled=personal;$('#msa-company').title=personal?__('Company filtering is available in document views.'):'';if(personal)$('#msa-company').value='';
		const options=['todos','assigned'].includes(state.view)?['Open','Closed','Cancelled']:state.view==='checkins'||state.stage==='Employee Checkin'?['IN','OUT']:['Draft','Submitted','Cancelled'];
		select.innerHTML=`<option value="">${esc(__('All statuses'))}</option>`+options.map(v=>`<option value="${v}">${esc(__(v))}</option>`).join('');
		select.value=options.includes(value)?value:'';
	}
	async function loadWork(){
		const sequence=state.workSequence=(state.workSequence||0)+1;
		$('#msa-records-title').textContent=workLabels[state.view];if(state.start===0){parkReview();$('#msa-records').innerHTML='';}$('#msa-empty').hidden=true;$('#msa-more').hidden=true;
		try{
			const {message}=await frappe.call(API+'get_work',{view:state.view,start:state.start,page_length:state.pageLength,record_limit:50,search:$('#msa-search').value,company:$('#msa-company').value,status:$('#msa-status').value,date_from:$('#msa-from').value,date_to:$('#msa-to').value});
			if(sequence!==state.workSequence)return;
			renderRows(message?.rows||[],state.start>0);$('#msa-more').hidden=!message?.has_more;
			$('#msa-work-note').textContent=message?.truncated?__('Latest {0} records · refine filters for older entries',[message.record_limit]):__('{0} entries in this view',[message?.window_count||0]);
		}catch(error){showError(error);}
	}
	all('[data-work-view]').forEach(button=>button.onclick=()=>{
		if(review&&!review.ensureClean())return;state.selected=null;state.reviewExpanded=false;
		state.view=button.dataset.workView;state.stage=null;state.start=0;state.workSequence=(state.workSequence||0)+1;
		$('#msa-status').value='';updateWorkViews();updateFilterSummary();renderFlow();loadDocuments(state.view==='recent');
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
					await loadDashboard(); await openReview({doctype:result.message.doctype,name:result.message.name});
				} catch (error) { showError(error); }
				finally {state.busy = false; dialog.get_primary_btn().prop('disabled', false);}
			}
		});
		dialog.set_secondary_action_label(__('Open Full Form'));
		dialog.set_secondary_action(() => {const values = dialog.get_values() || {}; dialog.hide(); frappe.route_options = values; frappe.set_route(...config.full_form_route);});
		dialog.show();
	}
	$('#msa-quick-entry').onclick = openQuickEntryPicker;
	$('#msa-new').onclick = () => openQuickEntry(currentStage()?.doctype);
	$('#msa-refresh').onclick = async () => {$('#msa-refresh').disabled = true; await loadDashboard(); $('#msa-refresh').disabled = false;};
	function updateFilterSummary(){
		const count=['msa-search','msa-company','msa-status','msa-from','msa-to'].filter(id=>$('#'+id).value).length;
		$('#msa-filter-count').textContent=count?__('{0} active',[count]):__('No filters applied');
		$('.msa-filter-panel').classList.toggle('has-filters',count>0);
	}
	const applyFilters = frappe.utils.debounce(() => {updateFilterSummary();state.start = 0;if(['recent','stage'].includes(state.view)){state.stage=state.stage||currentStage()?.doctype;renderFlow();}loadDocuments();}, 300);
	$('#msa-search').addEventListener('input', applyFilters);
	['msa-company','msa-status'].forEach(id => $('#'+id).addEventListener('change', applyFilters));
	const dateRanges=window.MySpaceDateRange({period:$('#msa-period'),from:$('#msa-from'),to:$('#msa-to'),onChange:()=>{updateFilterSummary();state.start=0;loadDashboard(false);}});
	$('#msa-clear').onclick = () => {['msa-search','msa-company','msa-status'].forEach(id=>$('#'+id).value='');dateRanges.reset();updateFilterSummary();state.start=0;loadDashboard(false);};
	$('#msa-more').onclick = async () => {state.start += state.pageLength;if(['todos','assigned','checkins','drafts','submitted'].includes(state.view))return loadWork(); const doctype = state.stage || currentStage()?.doctype; try {const {message} = await frappe.call(API+'get_documents',{doctype, search:$('#msa-search').value,start:state.start,page_length:state.pageLength,company:$('#msa-company').value,status:$('#msa-status').value,date_from:$('#msa-from').value,date_to:$('#msa-to').value}); renderRows(message?.rows||[],true); $('#msa-more').hidden=!message?.has_more;} catch(error){showError(error);}};
	updateFilterSummary();loadDashboard();
};
