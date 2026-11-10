/* Native My Space Business Flow; no embedded Desk page. */
(() => {
  const panel=document.getElementById('panel-process');
  const $=id=>document.getElementById('msp-'+id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={catalog:[],module:null,doctype:null,start:0,sequence:0,busy:false,columns:new Set()};
  let initializing;
  async function api(method,args={}) {
    const response=await fetch('/api/method/my_space.process.'+method,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Frappe-CSRF-Token':document.getElementById('welcome-csrf').value},body:JSON.stringify(args)});
    const data=await response.json();
    if(!response.ok||data.exc)throw Error(response.status===403?'Your account does not have permission to view these documents.':'Unable to load Business Flow. Please retry.');
    return data.message;
  }
  function renderModules() {
    $('modules').innerHTML=state.catalog.map(m=>`<button type="button" data-module="${esc(m.key)}" aria-pressed="${m.key===state.module}">${esc(m.label)}</button>`).join('');
    $('modules').querySelectorAll('button').forEach(b=>b.onclick=()=>chooseModule(b.dataset.module));
  }
  function renderLanes() {
    const module=state.catalog.find(m=>m.key===state.module);
    $('lanes').innerHTML=module.lanes.map(l=>`<section class="msp-lane"><h3>${esc(l.title)}</h3><div class="msp-steps">${l.steps.map(s=>`<button type="button" data-doctype="${esc(s.doctype)}" aria-pressed="${s.doctype===state.doctype}"><span aria-hidden="true">${esc(s.icon)}</span> ${esc(s.label)}</button>`).join('<span class="msp-arrow" aria-hidden="true">→</span>')}</div></section>`).join('');
    $('lanes').querySelectorAll('button').forEach(b=>b.onclick=()=>chooseStep(b.dataset.doctype));
  }
  async function chooseModule(key) {
    state.module=key;state.doctype=state.catalog.find(m=>m.key===key).lanes[0].steps[0].doctype;
    state.start=0;$('search').value='';$('stage').value='';renderModules();renderLanes();await load();
  }
  async function chooseStep(doctype) {
    state.doctype=doctype;state.start=0;$('search').value='';$('stage').value='';renderLanes();await load();
  }
  function format(value,column,row) {
    if(column.fieldtype==='References')return value?.length?`<div class="msp-references">${value.map(ref=>`<span><small>${esc(ref.label||ref.doctype)}</small><strong>${esc(ref.name)}</strong></span>`).join('')}</div>`:'—';
    if(value==null||value==='')return '—';
    if(column.fieldtype==='Currency'){try{return esc(new Intl.NumberFormat(undefined,{...(row.currency?{style:'currency',currency:row.currency}:{}),minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)));}catch{return esc(Number(value).toLocaleString(undefined,{maximumFractionDigits:2}));}}
    if(column.fieldtype==='Date'||column.fieldtype==='Datetime'){const date=new Date(String(value).replace(' ','T'));return esc(Number.isNaN(date.getTime())?value:column.fieldtype==='Date'?date.toLocaleDateString():date.toLocaleString());}
    if(column.fieldtype==='Check')return Number(value)?'Yes':'No';
    return esc(value);
  }
  function visibleColumns() {return state.data.columns.filter(c=>state.columns.has(c.fieldname));}
  function updateColumnCount() {
    $('column-count').textContent=`${visibleColumns().length}/${state.data.columns.length}`;
  }
  function saveColumns() {
    try{localStorage.setItem('my-space-process:columns:v2:'+state.doctype,JSON.stringify([...state.columns]));}catch{}
    updateColumnCount();renderRows();
  }
  function renderRows() {
    const data=state.data,columns=visibleColumns();
    if(!data.rows.length){$('records').innerHTML='<p class="welcome-empty">No documents match your filters and permissions.</p>';return;}
    $('records').innerHTML=`<table class="msp-table"><thead><tr><th>Document</th>${columns.map(c=>`<th>${esc(c.label)}</th>`).join('')}<th>Status</th></tr></thead><tbody>${data.rows.map((r,i)=>`<tr><td data-label="Document"><strong>${esc(r.name)}</strong></td>${columns.map(c=>`<td data-label="${esc(c.label)}">${format(r[c.fieldname],c,r)}</td>`).join('')}<td data-label="Status"><div class="msp-statuses">${data.submittable?`<span class="msp-entry-${Number(r.docstatus)}"><small>Entry status</small><b>${['Draft','Submitted','Cancelled'][Number(r.docstatus)]||'Draft'}</b></span>`:''}${r.status?`<span><small>Document status</small><b>${esc(r.status)}</b></span>`:''}${!data.submittable&&!r.status?'—':''}</div></td></tr>`).join('')}</tbody></table>`;
  }
  async function load() {
    if(!state.doctype||!ranges.valid())return;
    const sequence=++state.sequence;state.busy=true;
    $('status').textContent='Loading documents…';$('refresh').disabled=true;$('prev').disabled=true;$('next').disabled=true;
    try {
      const data=await api('get_documents',{doctype:state.doctype,start:state.start,search:$('search').value,stage:$('stage').value,date_from:$('from').value,date_to:$('to').value});
      if(sequence!==state.sequence)return;
      state.data=data;state.columns=new Set(data.columns.map(c=>c.fieldname));
      try {const saved=JSON.parse(localStorage.getItem('my-space-process:columns:v2:'+state.doctype));if(Array.isArray(saved))state.columns=new Set(saved);}catch{}
      $('title').textContent=state.doctype;$('stage').disabled=!data.submittable;
      $('columns').innerHTML=data.columns.map(c=>`<label><input type="checkbox" value="${esc(c.fieldname)}" ${state.columns.has(c.fieldname)?'checked':''}><span>${esc(c.label)}</span></label>`).join('');
      $('columns').querySelectorAll('input').forEach(input=>input.onchange=()=>{input.checked?state.columns.add(input.value):state.columns.delete(input.value);saveColumns();});
      updateColumnCount();renderRows();$('status').textContent=`${data.rows.length} document${data.rows.length===1?'':'s'} shown · ${$('from').value} – ${$('to').value} · Only records available to your account`;
      $('page').textContent='Page '+(Math.floor(state.start/20)+1);$('prev').disabled=state.start===0;$('next').disabled=!data.has_more;
    }catch(error){if(sequence===state.sequence){$('status').textContent=error.message;$('records').replaceChildren();}}
    finally{if(sequence===state.sequence){state.busy=false;$('refresh').disabled=false;}}
  }
  async function init() {
    if(panel.hidden||state.catalog.length||initializing)return;
    initializing=(async()=>{
      $('status').textContent='Loading Business Flow…';
      state.catalog=await api('get_catalog');
      if(!state.catalog.length){$('status').textContent='No process modules are available for your account.';return;}
      await chooseModule(state.catalog[0].key);
    })().catch(error=>{$('status').textContent=error.message;}).finally(()=>{initializing=null;});
  }
  $('columns-all').onclick=()=>{
    if(!state.data)return;
    state.columns=new Set(state.data.columns.map(c=>c.fieldname));
    $('columns').querySelectorAll('input').forEach(input=>input.checked=true);
    saveColumns();
  };
  $('columns-done').onclick=()=>{$('column-picker').open=false;$('column-picker').querySelector('summary').focus();};
  document.addEventListener('click',event=>{if(!$('column-picker').contains(event.target))$('column-picker').open=false;});
  $('column-picker').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();$('column-picker').open=false;$('column-picker').querySelector('summary').focus();}});
  const ranges=window.MySpaceDateRange({period:$('period'),from:$('from'),to:$('to'),onChange:()=>{state.start=0;load();}});
  $('refresh').onclick=()=>state.catalog.length?load():init();
  $('stage').onchange=()=>{state.start=0;load();};
  let timer;$('search').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{state.start=0;load();},350);};
  $('prev').onclick=()=>{if(!state.busy){state.start=Math.max(0,state.start-20);load();}};
  $('next').onclick=()=>{if(!state.busy){state.start+=20;load();}};
  new MutationObserver(init).observe(panel,{attributes:true,attributeFilter:['hidden']});init();
})();
