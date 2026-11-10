/* Focused document entry with visible native-permission link searches. */
(() => {
 'use strict';
 const $=s=>document.querySelector(s),config=JSON.parse($('#entry-config').textContent);
 const form=$('#entry-form'),rows=$('#entry-item-rows'),error=$('#entry-error'),save=$('#entry-save');
 const controls=new Map(),csrf=$('#entry-csrf').value;
 let saving=false,created=false,dirty=false,menu=null,lookupOwner=null,lookupToken=0,selected=-1,scanBusy=false;
 const scanQueue=[];
 let savedDocument=null;
 const field=n=>controls.get(n),value=n=>field(n)?.value||config.defaults[n]||'';
 const number=v=>Number(v)||0,money=v=>number(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
 function showError(message){error.textContent=message;error.hidden=false;}
 function serverError(body){try{const msg=JSON.parse(body._server_messages||'[]').map(v=>typeof v==='string'?JSON.parse(v):v).map(v=>v.message).filter(Boolean).join(' ');if(msg)return msg.replace(/<[^>]*>/g,'');}catch{}return body.exc_type||'Could not complete the request.';}
 async function call(method,args={}){const response=await fetch('/api/method/my_space.entry.'+method,{method:'POST',credentials:'same-origin',headers:{'X-Frappe-CSRF-Token':csrf,'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams({kind:config.kind,...Object.fromEntries(Object.entries(args).map(([k,v])=>[k,typeof v==='object'?JSON.stringify(v):v??'']))})});const body=await response.json();if(!response.ok||body.exc)throw new Error(serverError(body));return body.message;}
 function closeMenu(){lookupToken++;if(lookupOwner){lookupOwner.setAttribute('aria-expanded','false');lookupOwner.removeAttribute('aria-activedescendant');lookupOwner.removeAttribute('aria-controls');}menu?.remove();menu=null;lookupOwner=null;selected=-1;}
 function positionMenu(){if(!menu||!lookupOwner)return;const r=lookupOwner.getBoundingClientRect(),height=Math.min(menu.scrollHeight||240,260);const below=innerHeight-r.bottom;Object.assign(menu.style,{left:Math.max(8,Math.min(r.left,innerWidth-Math.max(r.width,250)-8))+'px',top:(below>Math.min(height,160)?r.bottom+5:Math.max(8,r.top-height-5))+'px',width:Math.min(Math.max(r.width,250),innerWidth-16)+'px'});}
 function wireLink(input,name,onchange){
  input.autocomplete='off';input.classList.add('entry-link-input');input.setAttribute('role','combobox');input.setAttribute('aria-expanded','false');input.setAttribute('aria-autocomplete','list');
  let timer;
  async function load(text){
   if(input.disabled||saving||created)return;
   closeMenu();lookupOwner=input;input.setAttribute('aria-expanded','true');const token=++lookupToken;
   menu=document.createElement('div');menu.className='entry-lookup';menu.id='entry-active-lookup';menu.setAttribute('role','listbox');input.setAttribute('aria-controls',menu.id);
   const loading=document.createElement('p');loading.textContent='Loading choices…';menu.append(loading);document.body.append(menu);positionMenu();
   try{const results=await call('search_link',{fieldname:name,text,company:value('company')});if(token!==lookupToken||!input.isConnected)return;menu.replaceChildren();selected=-1;
    if(!results.length){const empty=document.createElement('p');empty.textContent='No matching records.';menu.append(empty);}
    results.forEach((result,index)=>{const button=document.createElement('button');button.type='button';button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.id='entry-option-'+index;const strong=document.createElement('strong');strong.textContent=result.value;button.append(strong);if(result.description||result.label!==result.value){const small=document.createElement('small');small.textContent=result.label!==result.value?result.label:result.description;button.append(small);}button.onmousedown=e=>e.preventDefault();button.onclick=()=>{input.value=result.value;dirty=true;syncActions();closeMenu();input.dispatchEvent(new Event('change',{bubbles:true}));};menu.append(button);});positionMenu();
   }catch(e){if(token===lookupToken){menu.replaceChildren();const note=document.createElement('p');note.textContent=e.message;menu.append(note);positionMenu();}}
  }
  input.addEventListener('focus',()=>load(''));
  input.addEventListener('click',()=>{if(lookupOwner!==input||!menu)load('');});
  input.addEventListener('input',()=>{clearTimeout(timer);lookupToken++;timer=setTimeout(()=>{if(document.activeElement===input)load(input.value);},180);});
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeMenu();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(lookupOwner!==input||!menu){load('');return;}const opts=[...menu.querySelectorAll('button')];if(!opts.length)return;selected=(selected+(e.key==='ArrowDown'?1:-1)+opts.length)%opts.length;opts.forEach((b,i)=>b.setAttribute('aria-selected',String(i===selected)));input.setAttribute('aria-activedescendant',opts[selected].id);opts[selected].scrollIntoView?.({block:'nearest'});}if(e.key==='Enter'&&lookupOwner===input&&menu){e.preventDefault();const opts=menu.querySelectorAll('button');if(opts[selected>=0?selected:0])opts[selected>=0?selected:0].click();}});
  if(onchange)input.addEventListener('change',onchange);
 }
 document.addEventListener('mousedown',e=>{if(menu&&!menu.contains(e.target)&&e.target!==lookupOwner)closeMenu();});
 document.addEventListener('focusin',e=>{if(menu&&e.target!==lookupOwner&&!menu.contains(e.target))closeMenu();});
 window.addEventListener('scroll',positionMenu,true);window.addEventListener('resize',positionMenu);
 function createField(spec,parent){const label=document.createElement('label'),caption=document.createElement('span');caption.textContent=spec.label+(spec.required?' *':'');label.append(caption);let input;
  if(spec.fieldtype.includes('Text')){input=document.createElement('textarea');input.rows=2;label.className='entry-wide';}else{input=document.createElement('input');input.type=spec.fieldtype==='Check'?'checkbox':spec.fieldtype==='Date'?'date':['Float','Int','Currency','Percent'].includes(spec.fieldtype)?'number':'text';if(input.type==='number')input.step='any';}
  input.name=spec.fieldname;input.required=spec.required;input.setAttribute('aria-label',spec.label);if(input.type==='checkbox'){label.className='entry-check';label.prepend(input);}else label.append(input);parent.append(label);controls.set(spec.fieldname,input);
  if(spec.fieldtype==='Link')wireLink(input,spec.fieldname,spec.fieldname==='company'?companyChanged:null);
  if(input.type==='checkbox')input.checked=Boolean(number(config.defaults[spec.fieldname]));else input.value=config.defaults[spec.fieldname]||'';
 }
 const main=new Set([config.party,'company',config.date,config.due,'po_no','po_date','bill_no','bill_date','taxes_and_charges']),inventory=new Set(['set_warehouse','update_stock']);
 config.fields.filter(f=>!['currency','conversion_rate','credit_to','debit_to'].includes(f.fieldname)).forEach(spec=>createField(spec,$(main.has(spec.fieldname)?'#entry-main-fields':inventory.has(spec.fieldname)?'#entry-inventory-fields':'#entry-detail-fields')));
 const stock=field('update_stock');if(stock){stock.addEventListener('change',()=>{$('#entry-stock-note').hidden=!stock.checked;});stock.dispatchEvent(new Event('change'));}
 async function companyChanged(){try{const fresh=await call('get_config',{company:value('company')});config.defaults=fresh.defaults;for(const name of [config.price_list,'cost_center','set_warehouse','taxes_and_charges'])if(field(name))field(name).value=fresh.defaults[name]||'';for(const row of rows.children)if(row.querySelector('[name=item_code]').value)await itemChanged(row);totals();}catch(e){showError(e.message);}}
 function totals(){let total=0,count=0;for(const row of rows.children){const qty=number(row.querySelector('[name=qty]').value),rate=number(row.querySelector('[name=rate]').value);row.querySelector('.entry-line-amount').textContent=money(qty*rate);total+=qty*rate;if(row.querySelector('[name=item_code]').value)count++;}$('#entry-item-count').textContent=count+' item'+(count===1?'':'s');$('#entry-subtotal').textContent=(value('currency')?value('currency')+' ':'')+money(total);}
 function applyDefaults(row,data){for(const name of ['uom','rate'])if(data[name]!==undefined&&data[name]!==null&&data[name]!=='')row.querySelector('[name='+name+']').value=data[name];row.querySelector('[name=item_code]').title=data.item_name||row.querySelector('[name=item_code]').value;totals();}
 async function itemChanged(row,preserveUom=false){const get=n=>row.querySelector('[name='+n+']');if(!get('item_code').value||!value('company'))return;const item=get('item_code').value,token=(row._lookupToken||0)+1;row._lookupToken=token;row.dataset.loading='true';
  try{const data=await call('item_defaults',{item_code:item,company:value('company'),party:value(config.party),currency:value('currency'),price_list:value(config.price_list),qty:get('qty').value,date:value(config.date),uom:preserveUom?get('uom').value:''});if(row._lookupToken===token&&get('item_code').value===item)applyDefaults(row,data);}catch(e){showError(e.message);}finally{if(row._lookupToken===token)delete row.dataset.loading;}}
 function addRow(){if(rows.children.length>=50){showError('A maximum of 50 items can be entered.');return null;}const row=document.createElement('tr');
  for(const [name,label,type] of [['item_code','Item Code','text'],['qty','Qty','number'],['uom','UoM','text'],['rate','Rate','number']]){const cell=document.createElement('td'),input=document.createElement('input');input.name=name;input.type=type;input.setAttribute('aria-label',label);if(name==='item_code'||name==='qty')input.required=true;if(type==='number'){input.step='any';input.min='0';input.classList.add('entry-number');}if(name==='qty')input.value='1';if(name==='rate')input.placeholder='Auto';if(name==='qty'){
    const wrap=document.createElement('div');wrap.className='entry-quantity';wrap.append(input);
    const change=delta=>{const current=number(input.value),next=Math.round((current+delta)*1e6)/1e6;if(next<=0)return;input.value=String(next);input.dispatchEvent(new Event('input',{bubbles:true}));};
    for(const [text,label,delta] of [['+','Increase quantity',1],['−','Decrease quantity',-1]]){const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',label);button.className=delta>0?'entry-qty-up':'entry-qty-down';button.onclick=()=>change(delta);wrap.append(button);}
    input.addEventListener('keydown',event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();change(event.key==='ArrowUp'?1:-1);}});
    input.addEventListener('input',()=>input.setCustomValidity(number(input.value)>0?'':'Quantity must be greater than zero.'));
    cell.append(wrap);
   }else cell.append(input);row.append(cell);if(name==='item_code'||name==='uom')wireLink(input,name,()=>itemChanged(row,name==='uom'));input.addEventListener('input',totals);}
  const amount=document.createElement('td');amount.className='entry-line-amount';amount.setAttribute('aria-label','Amount');amount.textContent='0.00';row.append(amount);const cell=document.createElement('td'),remove=document.createElement('button');remove.type='button';remove.className='entry-remove';remove.textContent='×';remove.setAttribute('aria-label','Remove item');remove.onclick=()=>{if(rows.children.length>1)row.remove();else row.querySelectorAll('input').forEach(i=>{i.value=i.name==='qty'?'1':'';});dirty=true;totals();syncActions();};cell.append(remove);row.append(cell);rows.append(row);return row;
 }
 $('#entry-add-item').onclick=()=>{addRow()?.querySelector('[name=item_code]').focus();dirty=true;totals();syncActions();};addRow();totals();
 async function processScans(){
  if(scanBusy)return;scanBusy=true;
  try{
   while(scanQueue.length){
    const request=scanQueue.shift();$('#entry-scan-status').textContent='Finding '+request.barcode+'…';
    try{const item=await call('scan_barcode',request);let row=[...rows.children].find(r=>r.querySelector('[name=item_code]').value===item.item_code&&r.querySelector('[name=uom]').value===(item.uom||''));
     if(row)row.querySelector('[name=qty]').value=number(row.querySelector('[name=qty]').value)+1;
     else{row=[...rows.children].find(r=>!r.querySelector('[name=item_code]').value)||addRow();if(!row)continue;row.querySelector('[name=item_code]').value=item.item_code;row.querySelector('[name=qty]').value='1';applyDefaults(row,item);}
     dirty=true;totals();syncActions();$('#entry-scan-status').textContent='Last scanned: '+request.barcode+' · Added '+item.item_code;
    }catch(e){showError(e.message);$('#entry-scan-status').textContent='Not added: '+request.barcode;}
   }
  }finally{scanBusy=false;syncActions();}
 }
 function scan(){
  const input=$('#entry-barcode'),barcode=input.value.trim();if(!barcode)return;
  if(!value('company')){showError('Select a company before scanning an item.');return;}
  input.value=''; // Capture first, then clear immediately so the next scan is never erased.
  scanQueue.push({barcode,company:value('company'),party:value(config.party),currency:value('currency'),price_list:value(config.price_list),date:value(config.date)});
  input.focus();return processScans();
 }
 $('#entry-scan').onclick=scan;
 $('#entry-barcode').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();scan();}});
 $('#entry-barcode').addEventListener('keyup',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();}});
 form.addEventListener('input',markDirty);form.addEventListener('change',markDirty);window.addEventListener('beforeunload',e=>{if(dirty&&!created){e.preventDefault();e.returnValue='';}});
 $('#entry-theme').onclick=()=>{const theme=document.body.dataset.theme==='dark'?'light':'dark';document.body.dataset.theme=theme;$('#entry-theme').textContent=theme==='dark'?'Light mode':'Dark mode';};
 function markDirty(){if(created||saving)return;dirty=true;syncActions();}
 function syncActions(){
  const status=savedDocument?['Draft','Submitted','Cancelled'][savedDocument.docstatus]:'New';
  $('#entry-document-number').textContent=savedDocument?.name||'Not saved';
  $('#entry-document-state').textContent=status;
  $('#entry-document-state').dataset.status=String(savedDocument?.docstatus??'new');
  $('#entry-dirty-state').textContent=saving?'Working…':dirty?'Unsaved changes':savedDocument?'All changes saved':'Unsaved document';
  for(const button of [save,$('#entry-save-bottom')]){button.disabled=saving||created;button.hidden=created;button.textContent=saving?'Saving…':'Save';}
  const submit=$('#entry-submit');
  submit.hidden=!savedDocument||savedDocument.docstatus!==0||!savedDocument.submit_actions?.length;
  submit.disabled=saving||dirty||scanBusy||scanQueue.length>0;
  submit.textContent=savedDocument?.submit_actions?.[0]||'Submit';
  submit.title=dirty?'Save your changes before submitting.':'';
  $('#entry-reload').hidden=!savedDocument;$('#entry-reload').disabled=saving;
 }
 function fillDocument(result){
  savedDocument=result;config.defaults.currency=result.currency||config.defaults.currency;
  for(const [name,input] of controls){const v=result.fields[name];if(input.type==='checkbox')input.checked=Boolean(number(v));else input.value=v??'';}
  rows.replaceChildren();
  for(const item of result.items){const row=addRow();row.dataset.name=item.name;for(const name of ['item_code','qty','uom','rate'])row.querySelector('[name='+name+']').value=item[name]??'';}
  created=result.docstatus!==0||!result.can_edit;dirty=false;
  $('#entry-fields').disabled=created;
  $('#entry-title').textContent=result.doctype+' · '+result.name;
  document.title=result.doctype+' '+result.name+' | My Space';
  $('#entry-full-form').href=result.url;$('#entry-saved-link').href=result.url;
  if(stock)$('#entry-stock-note').hidden=!stock.checked;
  totals();syncActions();
  const url=new URL(location.href);url.searchParams.set('name',result.name);history.replaceState(null,'',url);
 }
 function entryData(){
  const data={};for(const [name,input] of controls)data[name]=input.type==='checkbox'?(input.checked?1:0):input.value;
  data.items=[...rows.children].map(row=>({...Object.fromEntries([...row.querySelectorAll('input')].filter(i=>i.value!=='').map(i=>[i.name,i.value])),...(row.dataset.name?{name:row.dataset.name}:{})}));
  return data;
 }
 async function saveDraft(){
  if(saving||created||!form.reportValidity())return;
  if(scanBusy||scanQueue.length){showError('Wait for the barcode scans to finish before saving.');return;}
  if([...rows.children].some(row=>row.dataset.loading)){showError('Wait for item defaults to finish loading before saving.');return;}
  closeMenu();saving=true;error.hidden=true;$('#entry-fields').disabled=true;syncActions();
  try{
   const data=entryData();
   const result=savedDocument?await call('save_draft',{name:savedDocument.name,modified:savedDocument.modified,data}):await call('create_draft',{data});
   fillDocument(result);
   $('#entry-success-title').textContent='Draft saved';
   $('#entry-success-message').textContent=result.doctype+' '+result.name+' saved. You can continue editing this draft.'+(result.grand_total!=null?' Total: '+(result.currency||'')+' '+money(result.grand_total):'');
   $('#entry-success').hidden=false;
  }catch(e){showError(e.message);}
  finally{saving=false;$('#entry-fields').disabled=created;syncActions();}
 }
 async function submitDocument(){
  if(saving||!savedDocument||savedDocument.docstatus!==0)return;
  if(dirty){showError('Save your changes before submitting.');return;}
  if(scanBusy||scanQueue.length||[...rows.children].some(row=>row.dataset.loading)){showError('Wait for items to finish loading before submitting.');return;}
  const action=savedDocument.submit_actions?.[0];if(!action)return;
  if(!window.confirm(action+' '+savedDocument.name+'? ERPNext will validate and post this document.'))return;
  closeMenu();saving=true;error.hidden=true;$('#entry-fields').disabled=true;syncActions();
  try{
   const result=await call('submit_document',{name:savedDocument.name,modified:savedDocument.modified,action});
   fillDocument(result);$('#entry-success-title').textContent=result.docstatus===1?'Document submitted':'Document updated';
   $('#entry-success-message').textContent=result.doctype+' '+result.name+(result.docstatus===1?' was submitted successfully.':' was updated.');$('#entry-success').hidden=false;
  }catch(e){showError(e.message);}
  finally{saving=false;$('#entry-fields').disabled=created;syncActions();}
 }
 // Only explicit Save clicks persist data. Enter in item/link/barcode fields never saves a document.
 form.addEventListener('submit',event=>event.preventDefault());
 form.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.tagName==='INPUT')event.preventDefault();});
 save.addEventListener('click',saveDraft);$('#entry-save-bottom').addEventListener('click',saveDraft);
 $('#entry-submit').addEventListener('click',submitDocument);
 $('#entry-reload').onclick=async()=>{
  if(saving||!savedDocument||dirty&&!window.confirm('Discard unsaved changes and reload this document?'))return;
  saving=true;closeMenu();$('#entry-fields').disabled=true;syncActions();
  try{fillDocument(await call('load_document',{name:savedDocument.name}));error.hidden=true;$('#entry-success').hidden=true;}catch(e){showError(e.message);}
  finally{saving=false;$('#entry-fields').disabled=created;syncActions();}
 };
 $('#entry-another').onclick=()=>{if(dirty&&!window.confirm('Discard unsaved changes and create another document?'))return;dirty=false;location.href=location.pathname;};
 if(config.document)fillDocument(config.document);else syncActions();
})();
