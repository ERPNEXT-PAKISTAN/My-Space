/* Flow-owned Review panel. No runtime dependency on My Work. */
window.MySpaceReview = class MySpaceReview {
    constructor(root, {onRefresh, onSelect}={}) {
        this.root=$(root).addClass('msr-root');this.onRefresh=onRefresh;this.onSelect=onSelect;
        this.empty();
        this.root.on('click','[data-review-tab]',e=>this.reviewTab(e.currentTarget.dataset.reviewTab));
        this.root.on('keydown','[role="tablist"]',e=>{
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
            const tabs=$(e.currentTarget).find('[role="tab"]').toArray();let i=tabs.indexOf(document.activeElement);if(i<0)return;e.preventDefault();
            i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[i].click();tabs[i].focus();
        });
    }
    empty(){
        this.currentReview=null;
        this.root.html(`<section class="msr-drawer" role="region" aria-label="${__('Document review')}"><div class="msr-empty"><h3>${__('Review')}</h3><p>${__('Select a document to review its details and available actions here.')}</p></div></section>`);
    }
    async api(method,args={}){return (await frappe.call({method:`my_space.review.api.${method}`,args})).message;}
    async load(){await this.onRefresh?.();}
    async refreshReview(d,row){const comment=this.root.find('.msr-remarks').val()||'';this.claimDirty=false;this.taskDescriptionDirty=false;await this.load();await this.review(row);this.root.find('.msr-remarks').val(comment).trigger('input');}
    icon(name) {
        const paths={user:'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2zM16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',money:'M3 6h18v12H3zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M5 9h1M18 15h1',calendar:'M4 5h16v17H4zM8 2v6M16 2v6M4 10h16M8 14h1M12 14h1M8 18h1M12 18h1',print:'M6 9V2h12v7M6 18H3V9h18v9h-3M6 14h12v8H6zM17 11h1',home:'M3 10l9-7 9 7M5 9v12h5v-7h4v7h5V9',clipboard:'M9 5H5v16h14V5h-4M9 3h6v4H9zM8 13l3 3 5-6',grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',check:'M5 12l4 4L19 6',send:'M22 2L9 15M22 2l-7 20-6-7-7-6z',clock:'M12 7v5l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',file:'M14 2H5v20h14V7zM14 2v6h5M8 12h8M8 16h6',x:'M6 6l12 12M6 18L18 6','check-circle':'M8 12l3 3 5-6M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',menu:'M4 6h16M4 12h16M4 18h16',refresh:'M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 14-1l1 6M4 12l1 6a8 8 0 0 0 14-1',plus:'M12 5v14M5 12h14','chevron-down':'M6 9l6 6 6-6','chevron-left':'M15 6l-6 6 6 6','chevron-right':'M9 6l6 6-6 6',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',shield:'M12 2l8 4v6c0 6-8 10-8 10S4 18 4 12V6zM8 12l3 3 5-6',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',box:'M3 7l9-5 9 5v10l-9 5-9-5zM3 7l9 5 9-5M12 12v10',building:'M4 22V4l8-2v20M12 8h8v14M2 22h20M7 7h2M7 11h2M7 15h2M15 12h2M15 16h2',link:'M10 13l4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4M16 8l2-2a4 4 0 0 1 6 6l-4 4',paperclip:'M21 11l-9 9a6 6 0 0 1-9-9L13 1a4 4 0 0 1 6 6L9 17a2 2 0 0 1-3-3l9-9',external:'M14 3h7v7M10 14L21 3M21 14v7H3V3h7',arrow:'M19 12H5M12 5l-7 7 7 7'};
        return `<svg class="msr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.box}"/></svg>`;
    }
    esc(value){return frappe.utils.escape_html(String(value??''));}
    date(value){return value?this.esc(frappe.datetime.str_to_user(String(value).split(' ')[0])):'—';}
    person(user){return (frappe.user_info?.(user)||{}).fullname||user||__('Not available');}
    initials(user){return this.person(user).split('@')[0].split(/[\s._-]+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();}
    amount(row){return this.money(row.amount,row.currency);}
    linkedEntry(d){
        const entry=d.linked_document;if(!entry)return '';
        const fields=(entry.summary_fields||[]).filter(f=>!this.isRemarksField(f));
        return `<section class="msr-linked-entry"><div class="msr-section-heading"><h3>${__('Assigned document')}</h3>${d.business_status||d.state?`<span class="msr-linked-task-state">${__('Assignment')}: ${this.statusPill(d.business_status||d.state)}</span>`:''}<a href="${this.esc(frappe.utils.get_form_link(entry.doctype,entry.name))}">${this.esc(entry.doctype)} ${this.esc(entry.name)} ${this.icon('external')}</a></div><table class="msr-linked-facts"><tbody>${fields.map(f=>`<tr><th>${this.esc(__(f.label))}</th><td>${f.fieldtype==='Date Range'?(f.value?.length?f.value.map(value=>this.shortDate(value)).filter((value,i,array)=>i===0||value!==array[0]).join(' – '):'—'):this.tableValue(f.value,{fieldtype:f.fieldtype,options:f.options||'currency',fieldname:f.fieldname},entry.currency)}</td></tr>`).join('')}</tbody></table>${this.expenseTables(entry)}${this.reviewRemarks(entry)}</section>`;
    }
    async review(row){
        if(!row)return;if(!this.ensureClean())return false;this.claimDirty=false;this.taskDescriptionDirty=false;const token=this.reviewSequence=(this.reviewSequence||0)+1;const drawer=this.root.find('.msr-drawer');
        const refreshButton=this.root.closest('.msa-review-panel').find('#msa-review-refresh').detach();
        this.root.closest('.msa-review-panel').find('.msa-inline-review-heading').append(refreshButton);
        drawer.prop('hidden',false).html(`<header><h2 id="msr-review-title">${__('Loading request…')}</h2></header><div class="msr-drawer-body"><div class="msr-loading"></div></div>`);
        try{
            const {data:d}=await this.api('review',{doctype:row.doctype,name:row.name});if(token!==this.reviewSequence)return;
            const history=this.timeline(d);this.currentReview={doc:d,row};this.onSelect?.(row);
            drawer.html(`<div class="msr-review-toolrow">${this.documentToolbar(d)}${this.reviewHeaderStatus(d,row)}<div class="msr-header-tools">${d.can_print?`<a class="msr-icon-button" href="/printview?doctype=${encodeURIComponent(d.doctype)}&name=${encodeURIComponent(d.name)}&trigger_print=1" target="_blank" rel="noopener" aria-label="${__('Print document')}" title="${__('Print document')}">${this.icon('print')}</a>`:''}<a class="msr-icon-button" href="${frappe.utils.get_form_link(d.doctype,d.name)}" aria-label="${__('Open document')}" title="${__('Open document')}">${this.icon('external')}</a></div></div>
            <div class="msr-review-tabs" role="tablist" aria-label="${__('Review sections')}">${[['details',__('Details')],['attachments',__('Attachments ({0})',[d.attachments.length])],['history',__('Approval History')],['activity',__('Activity')]].map(([key,label])=>`<button id="msr-review-tab-${key}" role="tab" aria-selected="${key==='details'}" aria-controls="msr-review-panel-${key}" tabindex="${key==='details'?0:-1}" data-review-tab="${key}" class="${key==='details'?'is-active':''}">${label}</button>`).join('')}</div><div class="msr-drawer-body">
            <section id="msr-review-panel-details" role="tabpanel" aria-labelledby="msr-review-tab-details" class="msr-review-panel" data-panel="details">${this.reviewDetails(d,row)}</section>
            <section id="msr-review-panel-attachments" role="tabpanel" aria-labelledby="msr-review-tab-attachments" class="msr-review-panel" data-panel="attachments" hidden><div class="msr-section-heading"><h3>${__('Attachments')}</h3>${d.tools?.can_attach?`<button class="btn btn-default btn-sm msr-upload">${this.icon('plus')}${__('Upload attachment')}</button>`:''}</div>${d.attachments.length?d.attachments.map(f=>`<div class="msr-attachment"><span class="msr-file-icon">${this.icon('paperclip')}</span><span><a href="${frappe.utils.get_form_link('File',f.name)}"><strong>${this.esc(f.label)}</strong></a><small>${f.private?__('Private attachment'):__('Attachment')}</small></span>${f.can_delete&&d.tools?.can_attach?`<button class="msr-icon-button msr-remove-attachment" data-file="${this.esc(f.name)}" aria-label="${__('Remove attachment')}">${this.icon('x')}</button>`:''}</div>`).join(''):`<div class="msr-empty">${this.icon('paperclip')}<p>${__('No accessible attachments')}</p></div>`}<p class="msr-note">${this.esc(d.attachments_note)}</p></section>
            <section id="msr-review-panel-history" role="tabpanel" aria-labelledby="msr-review-tab-history" class="msr-review-panel" data-panel="history" hidden><h3>${__('Approval History')}</h3>${history}</section>
            <section id="msr-review-panel-activity" role="tabpanel" aria-labelledby="msr-review-tab-activity" class="msr-review-panel" data-panel="activity" hidden><h3>${__('Activity')}</h3><div class="msr-activity"><strong>${__('Last document update')}</strong><small>${this.esc(frappe.datetime.str_to_user(d.modified))}</small></div><div class="msr-comment-history">${this.activityList(d)}</div>${history}</section></div>
            <footer><div class="msr-comment-composer"><label class="msr-remarks-label"><span class="msr-comment-title">${d.doctype==='ToDo'?__('Assignment comment (optional)'):__('Remarks / Comment (optional)')}</span><textarea class="form-control msr-remarks" maxlength="10000" rows="2" placeholder="${__('Write a comment…')}" aria-label="${__('Document comment')}"></textarea></label><div class="msr-comment-controls"><button class="btn msr-primary msr-add-comment" disabled>${__('Add Comment')}</button><small>${__('Comments do not change document status.')}</small></div></div><div class="msr-action-buttons">${d.flow_mode&&d.doctype!=='Expense Claim'?`<a class="btn btn-default msr-open-native" href="${frappe.utils.get_form_link(d.doctype,d.name)}">${d.tools?.can_edit?__('Edit document'):__('Open document')}</a>`:''}${d.actions.map((a,i)=>`<button class="btn msr-action ${this.actionClass(a)}" data-action-index="${i}">${this.icon(/reject|decline|cancel/i.test(a)?'x':/return|correction/i.test(a)?'arrow':'check')}${this.esc(a)}</button>`).join('')}${d.can_complete?`<button class="btn msr-primary msr-complete">${this.icon('check')}${__('Complete Task')}</button>`:''}${!d.actions.length&&!d.can_complete?`<span class="msr-note">${__('No document actions available at this stage.')}</span>`:''}</div></footer>`);
            drawer.find('.msr-action-buttons').addClass('msr-top-actions').prependTo(drawer).prepend(this.approvalEditor(d)).append(refreshButton);
            drawer.find('.msr-action').on('click',e=>this.confirmAction(d,d.actions[Number(e.currentTarget.dataset.actionIndex)],row));drawer.find('.msr-complete').on('click',()=>this.confirmAction(d,null,row));this.bindDocumentTools(d,row);if(d.tools?.date_editor){const datesButton=$('<button class="btn btn-default msr-edit-dates"></button>').text(__('Edit Dates'));drawer.find('.msr-action-buttons').prepend(datesButton);datesButton.on('click',()=>this.editInvoiceDates(d,row));}await this.bindTaskDescription(d,row);drawer.find('.msr-remarks').on('input',()=>drawer.find('.msr-add-comment').prop('disabled',!drawer.find('.msr-remarks').val().trim()));drawer.find('.msr-add-comment').on('click',()=>this.postComment(d));
        }catch(error){if(token===this.reviewSequence)drawer.find('.msr-drawer-body').html(`<div class="msr-empty"><h3>${__('Unable to load this request')}</h3><p>${__('Select the document again or refresh to try again.')}</p></div>`);}
    }
    async postComment(doc){
        const drawer=this.root.find('.msr-drawer');
        const input=drawer.find('.msr-remarks');
        const content=String(input.val()||'').trim();if(!content)return;
        const button=drawer.find('.msr-add-comment');button.prop('disabled',true);input.prop('disabled',true);
        try{
            const result=await this.api('add_comment',{doctype:doc.doctype,name:doc.name,content});
            doc.activity=[result.data,...(doc.activity||[])];
            if(this.currentReview?.doc===doc){
                input.val('');drawer.find('.msr-comment-history').html(this.activityList(doc));this.reviewTab('activity');
            }
            frappe.show_alert({message:__('Comment added'),indicator:'green'});
        }catch(error){button.prop('disabled',false);}
        finally{input.prop('disabled',false);if(this.currentReview?.doc===doc)button.prop('disabled',!String(input.val()||'').trim());}
    }
    commentText(content){
        const template=document.createElement('template');
        template.innerHTML=String(content||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(?:p|div|li)>/gi,'\n');
        return template.content.textContent.trim();
    }
    taskDescription(d){
        const field=d.task_description;if(!field)return '';
        return `<section class="msr-task-description-section"><div class="msr-section-heading"><h3>${__('Assignment Description')}</h3>${field.editable?`<div><button class="btn msr-primary msr-save-task-description" disabled>${__('Save Description')}</button> <button class="btn btn-default msr-reset-task-description">${__('Reset')}</button></div>`:''}</div>${field.editable?'<div class="msr-task-description-editor"></div>':`<p class="msr-task-description-readonly">${this.esc(this.commentText(field.value))}</p>`}</section>`;
    }
    async bindTaskDescription(doc,row){
        if(!doc.task_description?.editable)return;
        const drawer=this.root.find('.msr-drawer');const parent=drawer.find('.msr-task-description-editor');
        let initializing=true,baseline,read,write;
        const update=()=>{
            if(initializing||this.currentReview?.doc!==doc)return;
            const value=read();this.taskDescriptionDirty=value!==baseline;
            drawer.find('.msr-save-task-description').prop('disabled',!this.taskDescriptionDirty);
            drawer.find('.msr-action,.msr-complete').prop('disabled',this.taskDescriptionDirty||this.claimDirty);
        };
        if(frappe.ui.form?.make_control){
            const editor=frappe.ui.form.make_control({parent:parent[0],df:{fieldname:'description',label:__('Description'),fieldtype:'Text Editor',reqd:1,change:update},render_input:true,only_input:true});
            read=()=>editor.get_value()||'';write=value=>editor.set_value(value);
            await write(doc.task_description.value||'');
        }else{
            const input=$('<textarea class="form-control msr-task-description" aria-label="Assignment Description" rows="4"></textarea>').appendTo(parent);
            read=()=>'<p>'+this.esc(input.val()).replaceAll('\n','<br>')+'</p>';
            write=value=>input.val(this.commentText(value));input.on('input',update);
            write(doc.task_description.value||'');
        }
        if(this.currentReview?.doc!==doc)return;
        baseline=read();initializing=false;
        drawer.find('.msr-reset-task-description').on('click',async()=>{await write(baseline);update();});
        drawer.find('.msr-save-task-description').on('click',async()=>{
            const button=drawer.find('.msr-save-task-description').prop('disabled',true);
            try{await this.api('update_task_description',{name:doc.name,modified:doc.modified,description:read()});this.taskDescriptionDirty=false;frappe.show_alert({message:__('Assignment description saved'),indicator:'green'});await this.refreshReview(doc,row);}
            catch(error){button.prop('disabled',false);}
        });
    }
    reviewHeaderStatus(d,row){
        const fields=d.summary_fields||d.fields||[];
        if(fields.some(f=>/(^|_)(status|state)$/.test(f.fieldname||'')||f.label==='Status'))return '';
        const value=this.headline(d,row);
        return value?`<span class="msr-state-badge msr-tone-${this.headlineTone(d)}">${this.esc(value)}</span>`:'';
    }
    isRemarksField(field){
        return /^(?:custom_)?remarks?$/i.test(field.fieldname||'')||['remarks','purpose'].includes(String(field.label||'').trim().toLowerCase());
    }
    reviewRemarks(d){
        const fields=[...(d.summary_fields||d.fields||[]),...(d.remark_fields||[]),...(d.additional_fields||[])].filter(f=>this.isRemarksField(f)&&String(f.value||'').trim());
        const values=[...new Set(fields.map(f=>String(f.value)))];
        return values.length?`<section class="msr-document-remarks" aria-label="${__('Document remarks')}"><h3>${__('Remarks')}</h3>${values.map(value=>`<p>${this.esc(value)}</p>`).join('')}</section>`:'';
    }
    reviewDetails(d,row){
        const tables=(d.tables||[]).filter(t=>!`${t.label||''} ${t.fieldname||''}`.toLowerCase().replaceAll('_',' ').includes('coil production'));
        let primary=tables.filter(t=>t.compact_items||['items','accounts'].includes(t.fieldname)||t.label==='Expense Details');
        if(!primary.length)primary=tables;
        const secondary=tables.filter(t=>!primary.includes(t));
        const workflow=d.flow_mode==='workflow'||!d.flow_mode;
        const approval=d.tools?.fields?.find(f=>f.fieldname==='approval_status');
        const editableApproval=approval?.editable;
        const conflict=d.status_info?.has_conflict?`<aside class="msr-status-alert" role="alert"><strong>${__('Recorded statuses conflict')}</strong><p>${__('Review the status details below before taking action.')}</p></aside>`:'';
        const statusDetails=d.status_info||workflow||approval&&!editableApproval;
        const mainFields=(d.summary_fields||d.fields||[]).filter(f=>!this.isRemarksField(f)&&!(d.doctype==='ToDo'&&d.task_description&&f.fieldname==='description'));
        const top=`<div class="msr-review-top msr-review-top-reference"><div class="msr-detail-card"><h3 class="msr-facts-heading">${__('Document details')}</h3><dl>${this.summaryFields({...d,summary_fields:mainFields})}</dl></div></div>`;
        return `${d.linked_document?this.linkedEntry(d):top}${this.taskDescription(d)}${conflict}${this.expenseTables({...d,tables:primary})}${d.settlement?`<section class="msr-review-settlement"><h3>${__('Against Account / Party')}</h3>${this.settlementHTML(d.settlement,d.currency)}</section>`:''}${this.advancePanel(d)}${this.workflowCard(d,row)}${this.claimContext(d)}${this.financialOverview(d)}${secondary.length?`<details class="msr-review-secondary"><summary>${__('Additional entry details')}</summary>${this.expenseTables({...d,tables:secondary})}</details>`:''}${this.reviewRemarks(d)}${d.linked_document?`<details class="msr-review-secondary"><summary>${__('Assignment details')}</summary>${top}</details>`:''}${this.additionalFields({...d,additional_fields:(d.additional_fields||[]).filter(f=>!this.isRemarksField(f)&&!(d.doctype==='ToDo'&&d.task_description&&f.fieldname==='description'))})}${statusDetails?`<details class="msr-review-secondary msr-status-details"><summary>${__('Status details')}</summary>${workflow?this.decisionBanner(d):''}${this.statusOverview(d)}</details>`:''}${d.status_summary?.explanation?`<p class="msr-review-flow-note">${this.esc(__(d.status_summary.explanation))}</p>`:''}`;
    }
    documentToolbar(d){
        const t=d.tools;if(!t)return '';
        return `<div class="msr-document-tools" role="toolbar" aria-label="${__('Document tools')}"><button class="msr-tool-assign" ${t.can_assign?'':'disabled'}>${this.icon('users')}${__('Assign')} ${t.assignments?.length?`(${t.assignments.length})`:''}</button><button class="msr-tool-share" ${t.can_share?'':'disabled'}>${this.icon('link')}${__('Share')}</button><button class="msr-tool-tags" ${t.can_tag?'':'disabled'}>${this.icon('file')}${__('Tags')}</button><button class="msr-tool-attachments">${this.icon('paperclip')}${__('Attachments')} (${d.attachments.length})</button></div>${t.tags?.length?`<div class="msr-tag-strip">${t.tags.map(tag=>`<span>${this.esc(tag)}</span>`).join('')}</div>`:''}`;
    }
    approvalEditor(d){
        const field=d.tools?.fields?.find(f=>f.fieldname==='approval_status');if(!field)return '';
        const options=String(field.options||'').split('\n').filter(Boolean);
        const note=field.workflow_managed?__('Use the available workflow actions to change approval.'):field.editable?__('Save the approval decision before submitting. Saving approval does not submit the document.'):__('Approval is read only at this stage.');
        return `<section class="msr-approval-editor" aria-label="${__('Approval Status')}" title="${this.esc(note)}"><label class="msr-approval-label"><span>${__('Approval')}</span><select class="form-control msr-native-approval msr-status-control msr-tone-${this.statusTone(field.value)}" aria-label="${__('Select native Approval Status')}" ${field.editable?'':'disabled'}>${options.map(value=>`<option value="${this.esc(value)}" ${value===field.value?'selected':''} ${field.editable&&value==='Cancelled'?'disabled':''}>${this.esc(__(value))}</option>`).join('')}</select></label>${field.editable?`<button type="button" class="btn msr-primary msr-save-approval" disabled>${__('Save')}</button><button type="button" class="btn btn-default msr-reset-approval">${__('Reset')}</button>`:''}</section>`;
    }
    claimContext(d){
        const fields=d.tools?.fields?.filter(f=>['task','project','cost_center'].includes(f.fieldname))||[];
        if(!fields.length)return '';
        return `<section class="msr-claim-context"><div class="msr-section-heading"><h3>${__('Claim fields')}</h3>${d.tools.fields.some(f=>f.editable&&f.fieldname!=='approval_status')?`<button class="btn btn-default btn-sm msr-edit-fields">${__('Edit fields')}</button>`:''}</div><dl>${fields.map(f=>`<div><dt>${this.esc(__(f.label))}</dt><dd>${f.fieldname==='status'?this.statusPill(f.value):this.esc(f.value)||'—'}</dd></div>`).join('')}</dl><p class="msr-note">${__('Status is calculated by HRMS from document, approval and payment records.')}</p></section>`;
    }
    advancePanel(d){
        const t=d.tools;if(!t||d.doctype!=='Expense Claim')return '';
        return `<section class="msr-advance-panel"><div class="msr-section-heading"><h3>${__('Linked Employee Advances')}</h3>${t.can_edit_advances?`<button class="btn btn-default btn-sm msr-add-advance">${this.icon('plus')}${__('Add advance')}</button>`:''}</div>${t.advances.length?`<div class="msr-table-scroll"><table class="msr-table"><thead><tr><th>${__('Employee Advance')}</th><th>${__('Allocated')}</th><th>${__('Available / Unclaimed')}</th><th></th></tr></thead><tbody>${t.advances.map(a=>`<tr><td>${a.employee_advance?`<a href="${frappe.utils.get_form_link('Employee Advance',a.employee_advance)}">${this.esc(a.employee_advance)}</a>`:__('Restricted advance')}</td><td>${this.money(a.allocated_amount,d.currency)}</td><td>${this.money(a.unclaimed_amount,d.currency)}</td><td>${a.can_remove?`<button class="btn btn-default btn-sm msr-remove-advance" data-advance-row="${this.esc(a.row_name)}">${__('Remove link')}</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:`<p class="msr-note">${__('No advance links are visible.')}</p>`}<p class="msr-note">${t.can_edit_advances?__('Remove link unlinks the advance from this draft only. It does not delete the Employee Advance or its payments.'):__('Advance links on submitted or cancelled claims require the native correction/amendment process.')}</p></section>`;
    }
    activityList(d){
        return (d.activity||[]).map(a=>`<div class="msr-activity"><strong>${this.esc(this.commentText(a.content))}</strong><small>${this.esc(a.comment_by||this.person(a.owner))} · ${this.esc(frappe.datetime.str_to_user(a.creation))}</small></div>`).join('');
    }
    ensureClean(){
        if(this.taskDescriptionDirty){frappe.msgprint(__('Save or reset the assignment description before taking another action.'));return false;}
        if(!this.claimDirty)return true;
        frappe.msgprint(__('Save or reset the selected Approval Status before taking another action.'));return false;
    }
    editInvoiceDates(d,row){
        if(!this.ensureClean())return;
        const editor=d.tools.date_editor;
        const fields=editor.fields.map(f=>({fieldname:f.fieldname,fieldtype:'Date',label:f.label,default:f.value,reqd:f.fieldname!=='bill_date'}));
        fields.push({fieldtype:'HTML',options:`<p class="text-muted">${__('Saving dates does not submit the invoice. Keep the original Posting Date for an old entry unless you intend to change its accounting date. Due Date must match the latest installment. Native payment-term and accounting validations still apply.')}</p>`});
        editor.schedule.forEach((r,i)=>fields.push({fieldname:`installment_${i}`,fieldtype:'Date',label:__('Installment {0} Due Date',[r.idx]),default:r.due_date,reqd:1}));
        const dialog=new frappe.ui.Dialog({title:__('Edit Invoice Dates'),fields,primary_action_label:__('Save Dates'),primary_action:async values=>{
            const dates=Object.fromEntries(editor.fields.map(f=>[f.fieldname,values[f.fieldname]||null]));
            const schedule=editor.schedule.map((r,i)=>({name:r.name,due_date:values[`installment_${i}`]}));
            await this.tool('update_invoice_dates',{doctype:d.doctype,name:d.name,modified:d.modified,dates:JSON.stringify(dates),schedule:JSON.stringify(schedule)},dialog.get_primary_btn());
            dialog.hide();await this.refreshReview(d,row);frappe.show_alert({message:__('Dates saved. Review the invoice before submitting.'),indicator:'green'});
        }});
        dialog.show();
        editor.schedule.forEach((r,i)=>dialog.fields_dict[`installment_${i}`].df.change=()=>{const due=editor.schedule.map((_,j)=>dialog.get_value(`installment_${j}`)).filter(Boolean).sort().pop();if(due)dialog.set_value('due_date',due);});
    }
    async tool(method,args,btn){return (await frappe.call({method:`my_space.review.claim_tools.${method}`,args,btn})).message;}
    bindDocumentTools(d,row){
        const drawer=this.root.find('.msr-drawer'),t=d.tools;if(!t)return;
        const status=t.fields?.find(f=>f.fieldname==='approval_status');
        drawer.find('.msr-native-approval').on('change',e=>{this.claimDirty=e.target.value!==status.value;drawer.find('.msr-save-approval').prop('disabled',!this.claimDirty);drawer.find('.msr-action,.msr-complete').prop('disabled',this.claimDirty);});
        drawer.find('.msr-reset-approval').on('click',()=>{drawer.find('.msr-native-approval').val(status.value);this.claimDirty=false;drawer.find('.msr-save-approval').prop('disabled',true);drawer.find('.msr-action,.msr-complete').prop('disabled',false);});
        drawer.find('.msr-save-approval').on('click',()=>{
            const value=drawer.find('.msr-native-approval').val();
            frappe.confirm(__('Save Approval Status as {0} on {1}?',[this.esc(__(value)),this.esc(d.name)]),async()=>{await this.tool('update_claim',{name:d.name,modified:d.modified,fields:JSON.stringify({approval_status:value})},drawer.find('.msr-save-approval'));frappe.show_alert({message:__('Approval Status saved'),indicator:'green'});await this.refreshReview(d,row);});
        });
        drawer.find('.msr-tool-assign').on('click',()=>{if(this.ensureClean())this.assignDialog(d,row);});
        drawer.find('.msr-tool-share').on('click',()=>{if(this.ensureClean())this.shareDialog(d,row);});
        drawer.find('.msr-tool-tags').on('click',()=>{if(this.ensureClean())this.tagsDialog(d,row);});
        drawer.find('.msr-tool-attachments').on('click',()=>this.reviewTab('attachments'));
        drawer.find('.msr-upload').on('click',()=>{if(this.ensureClean())this.upload(d,row);});
        drawer.find('.msr-edit-fields').on('click',()=>{if(this.ensureClean())this.editFields(d,row);});
        drawer.find('.msr-add-advance').on('click',()=>{if(this.ensureClean())this.addAdvance(d,row);});
        drawer.find('.msr-remove-advance').on('click',e=>{
            if(!this.ensureClean())return;
            const rowName=e.currentTarget.dataset.advanceRow;
            frappe.confirm(__('Remove this advance link from the draft claim? The Employee Advance and its payments will be preserved.'),async()=>{await this.tool('remove_advance',{name:d.name,modified:d.modified,row_name:rowName},$(e.currentTarget));await this.refreshReview(d,row);});
        });
        drawer.find('.msr-remove-attachment').on('click',e=>{
            if(!this.ensureClean())return;
            const file=e.currentTarget.dataset.file;
            frappe.confirm(__('Remove this attachment from the document?'),async()=>{await this.tool('remove_attachment',{doctype:d.doctype,name:d.name,modified:d.modified,file_name:file},$(e.currentTarget));await this.refreshReview(d,row);this.reviewTab('attachments');});
        });
    }
    editFields(d,row){
        const fields=d.tools.fields.filter(f=>f.editable&&f.fieldname!=='approval_status');
        const dialog=new frappe.ui.Dialog({title:__('Edit Expense Claim fields'),fields:fields.map(f=>({fieldname:f.fieldname,label:__(f.label),fieldtype:f.fieldtype,options:f.options,default:f.value})),primary_action_label:__('Save changes'),primary_action:async values=>{
            const changed={};for(const f of fields)if(String(values[f.fieldname]||'')!==String(f.value||''))changed[f.fieldname]=values[f.fieldname]||null;
            if(!Object.keys(changed).length){dialog.hide();return;}
            await this.tool('update_claim',{name:d.name,modified:d.modified,fields:JSON.stringify(changed)},dialog.get_primary_btn());dialog.hide();await this.refreshReview(d,row);
        }});dialog.show();
    }
    assignDialog(d,row){
        const current=(d.tools.assignments||[]).map(a=>`${this.person(a.allocated_to)}${a.date?' · '+a.date:''}`).join(', ');
        const dialog=new frappe.ui.Dialog({title:__('Assign {0}',[d.name]),fields:[{fieldtype:'HTML',options:`<p class="text-muted">${__('Current assignments')}: ${this.esc(current)||'—'}</p>`},{fieldname:'users',fieldtype:'MultiSelectPills',label:__('Assign To'),reqd:1,get_data:txt=>frappe.db.get_link_options('User',txt,{enabled:1,user_type:'System User'})},{fieldname:'description',fieldtype:'Small Text',label:__('Description'),default:`${d.doctype} ${d.name}`},{fieldname:'date',fieldtype:'Date',label:__('Due Date')},{fieldname:'priority',fieldtype:'Select',label:__('Priority'),options:['Low','Medium','High'],default:'Medium'}],primary_action_label:__('Assign'),primary_action:async values=>{await this.tool('assign',{doctype:d.doctype,name:d.name,modified:d.modified,...values,users:JSON.stringify(values.users)},dialog.get_primary_btn());dialog.hide();await this.refreshReview(d,row);}});dialog.show();
    }
    shareDialog(d,row){
        const shares=(d.tools.shares||[]).map(s=>`<div class="msr-dialog-share"><span>${this.esc(s.user||__('Everyone'))}</span><small>${s.write?__('Read + Write'):__('Read')}${s.submit?' + '+__('Submit'):''}</small>${s.user?`<button class="btn btn-default btn-xs" data-remove-share="${this.esc(s.user)}">${__('Remove share')}</button>`:''}</div>`).join('');
        const dialog=new frappe.ui.Dialog({title:__('Share {0}',[d.name]),fields:[{fieldtype:'HTML',options:shares||`<p>${__('No explicit shares')}</p>`},{fieldname:'user',fieldtype:'Link',options:'User',label:__('User'),reqd:1,get_query:()=>({filters:{enabled:1}})},{fieldname:'write',fieldtype:'Check',label:__('Allow write'),default:0},{fieldname:'submit',fieldtype:'Check',label:__('Allow submit'),default:0},{fieldtype:'HTML',options:`<p class="text-muted">${__('Read access is included. Frappe checks your permission to grant additional rights.')}</p>`}],primary_action_label:__('Share document'),primary_action:async values=>{await this.tool('share',{doctype:d.doctype,name:d.name,modified:d.modified,...values},dialog.get_primary_btn());dialog.hide();await this.refreshReview(d,row);}});dialog.show();
        dialog.$wrapper.on('click','[data-remove-share]',e=>frappe.confirm(__('Remove this user’s explicit document share?'),async()=>{await this.tool('share',{doctype:d.doctype,name:d.name,modified:d.modified,user:e.currentTarget.dataset.removeShare,remove:1});dialog.hide();await this.refreshReview(d,row);}));
    }
    tagsDialog(d,row){
        const tags=d.tools.tags||[];
        const dialog=new frappe.ui.Dialog({title:__('Document tags'),fields:[{fieldtype:'HTML',options:`<div class="msr-dialog-tags">${tags.map(tag=>`<span>${this.esc(tag)} <button class="btn btn-default btn-xs" data-remove-tag="${this.esc(tag)}" aria-label="${__('Remove tag')}">×</button></span>`).join('')||__('No tags')}</div>`},{fieldname:'tag',fieldtype:'Data',label:__('New tag'),reqd:1}],primary_action_label:__('Add tag'),primary_action:async values=>{await this.tool('tag',{doctype:d.doctype,name:d.name,modified:d.modified,tag:values.tag},dialog.get_primary_btn());dialog.hide();await this.refreshReview(d,row);}});dialog.show();
        dialog.$wrapper.on('click','[data-remove-tag]',async e=>{await this.tool('tag',{doctype:d.doctype,name:d.name,modified:d.modified,tag:e.currentTarget.dataset.removeTag,remove:1});dialog.hide();await this.refreshReview(d,row);});
    }
    addAdvance(d,row){
        const dialog=new frappe.ui.Dialog({title:__('Link Employee Advance'),fields:[{fieldname:'employee_advance',fieldtype:'Link',options:'Employee Advance',label:__('Employee Advance'),reqd:1,get_query:()=>({filters:{docstatus:1,...(d.tools.employee?{employee:d.tools.employee}:{}),...(d.currency?{currency:d.currency}:{})}})},{fieldname:'allocated_amount',fieldtype:'Currency',label:__('Allocated amount'),reqd:1},{fieldtype:'HTML',options:`<p class="text-muted">${__('Only the draft claim link is added. Employee, company, currency and available balance are checked by the server.')}</p>`}],primary_action_label:__('Add advance link'),primary_action:async values=>{await this.tool('add_advance',{name:d.name,modified:d.modified,...values},dialog.get_primary_btn());dialog.hide();await this.refreshReview(d,row);}});dialog.show();
    }
    upload(d,row){
        const open=()=>new frappe.ui.FileUploader({doctype:d.doctype,docname:d.name,folder:'Home/Attachments',make_attachments_public:false,on_success:async()=>{await this.refreshReview(d,row);this.reviewTab('attachments');}});
        if(frappe.ui.FileUploader)open();else frappe.require('file_uploader.bundle.js',open);
    }
    statusTone(value){
        const text=String(value||'').toLowerCase();
        if(/conflict|reject|declin|absent|not payable|overdue/.test(text))return 'danger';
        if(/cancel|not available|not visible|no separate|not required/.test(text))return 'muted';
        if(/draft|pending|await|return|not approved|not posted|unpaid|partly|to deliver|to bill|open/.test(text))return 'warning';
        if(/^(approved|paid|present|completed|closed|settled against advance|fully delivered|fully billed)$/.test(text))return 'success';
        return 'info';
    }
    stageLabel(value){return value==='Draft'?'Draft · Not Final':value==='Submitted'?'Submitted · Final':value;}
    statusPill(value,tone=null){value=this.stageLabel(value);return `<span class="msr-status-pill msr-tone-${tone||this.statusTone(value)}">${this.esc(__(value||'Not available'))}</span>`;}
    headline(d,row={}){
        const summary=d.status_summary;
        return summary?(summary.key==='no_separate_approval'?summary.document_label:summary.label):(d.status_info?.display_status||d.state||row.status||'');
    }
    headlineTone(d){return d.status_summary?(d.status_summary.key==='no_separate_approval'?d.status_summary.document_variant:d.status_summary.variant):this.statusTone(d.status_info?.display_status||d.state);}
    decisionBanner(d){
        const s=d.status_summary;if(!s)return '';
        return `<section class="msr-decision-banner msr-tone-${s.variant}" aria-label="${__('Approval explained')}"><div><strong>${__('Approval')}</strong>${this.statusPill(s.label,s.variant)}${this.statusPill(s.document_label,s.document_variant)}</div><p>${this.esc(__(s.explanation))}</p></section>`;
    }
    statusOverview(d){
        const info=d.status_info;
        if(!info)return d.flow_mode?`<section class="msr-status-overview" aria-label="${__('Recorded document statuses')}"><div><span>${__('Document')}</span><strong>${this.statusPill(d.state||'Recorded')}</strong></div>${d.business_status?`<div><span>${__('Status')}</span><strong>${this.statusPill(d.business_status)}</strong></div>`:''}<div><span>${__('Flow')}</span><strong>${d.flow_mode==='record'?__('Saved record'):d.flow_mode==='standard'?__('Standard'):__('Workflow')}</strong></div></section>`:'';
        const fields=[[__('Document stage'),info.document_status],[__('Workflow State'),info.workflow_state],[__('Approval Status'),info.approval_status],[__('Claim Status'),info.claim_status]];
        return `<section class="msr-status-overview" aria-label="${__('Recorded document statuses')}">${fields.map(([label,value])=>`<div><span>${label}</span><strong>${this.statusPill(value)}</strong></div>`).join('')}<p>${__('Payment')}: <strong>${this.statusPill(info.payment_status)}</strong></p></section>${info.has_conflict?`<aside class="msr-status-alert" role="alert"><strong>${__('Recorded statuses conflict')}</strong>${info.conflicts.map(message=>`<p>${this.esc(__(message))}</p>`).join('')}<p>${__('Standard approval actions are blocked. Review the original fields; an authorized cancellation may be available below.')}</p></aside>`:''}${d.workflow_notices?.length?`<details class="msr-workflow-notices"><summary>${__('Workflow configuration notes')}</summary>${d.workflow_notices.map(message=>`<p>${this.esc(message)}</p>`).join('')}</details>`:''}`;
    }
    financialOverview(d){
        const info=d.status_info;
        if(!info)return '';
        const amounts=[[__('Claimed'),info.claimed],[__('Sanctioned'),info.sanctioned],[__('Advance applied'),info.advance_applied],[__('Reimbursed'),info.reimbursed],[__('Net payable'),info.net_payable],[__('Outstanding'),info.outstanding]].filter(([,value])=>value!=null);
        return `<section class="msr-financial-overview"><h3>${__('Claim and payment amounts')}</h3><div>${amounts.map(([label,value])=>`<div><span>${label}</span><strong>${this.money(value,d.currency)}</strong></div>`).join('')}</div><p>${this.statusPill(info.payment_status)}</p></section>`;
    }
    settlementHTML(source,currency){
        if(!source)return '<span class="msr-muted">—</span>';
        return `<span class="msr-settlement-badge msr-settlement-${this.esc(source.kind)}">${this.esc(__(source.label))}</span>${source.configured_route?`<small>${__('Configured route')}: ${this.esc(__(source.configured_route))}</small>`:''}${(source.accounts||[]).map(a=>`<small class="msr-against-account"><strong>${this.esc(__(a.label))}:</strong> ${this.esc(a.value)}</small>`).join('')}${source.party?`<small class="msr-against-party"><strong>${this.esc(__(source.party_label||'Party'))}:</strong> ${this.esc(source.party)}</small>`:''}${source.mode_of_payment?`<small>${__('Mode')}: <strong>${this.esc(source.mode_of_payment)}</strong></small>`:''}${source.payable_account?`<small class="msr-against-account">${__('Payable Account')}: <strong>${this.esc(source.payable_account)}</strong></small>`:''}${source.advance_amount!=null&&Number(source.advance_amount)>0?`<small>${__('Advance applied')}: ${this.money(source.advance_amount,currency)}</small>`:''}${(source.advances||[]).map(a=>`<a class="msr-advance-link" href="${frappe.utils.get_form_link(a.doctype,a.name)}">${this.esc(a.name)}</a>`).join('')}${source.net_payable!=null?`<small>${__('Net payable')}: ${this.money(source.net_payable,currency)}</small>`:''}`;
    }
    money(value,currency){
        if(value==null||value==='')return '—';
        const number=Number(value);if(!Number.isFinite(number))return this.esc(value);
        return `${currency==='PKR'?'Rs':this.esc(currency||'')} ${this.esc(number.toLocaleString('en-US',{maximumFractionDigits:2}))}`.trim();
    }
    shortDate(value){
        if(!value)return '';
        const date=new Date(String(value).slice(0,10)+'T00:00:00');
        return Number.isNaN(date.getTime())?this.esc(value):this.esc(date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}));
    }
    summaryFields(d){
        return (d.summary_fields||d.fields).map(f=>{
            const value=/(^|_)(status|state)$/.test(f.fieldname||'')?this.statusPill(f.value):f.fieldtype==='Currency'?this.money(f.value,f.options&&f.options!=='currency'?null:d.currency):f.fieldtype==='Check'?(Number(f.value)?__('Yes'):__('No')):f.fieldtype==='Date'?this.shortDate(f.value):f.fieldtype==='Date Range'?(f.value?.length?(f.value[0]===f.value[1]?this.shortDate(f.value[0]):`${this.shortDate(f.value[0])} – ${this.shortDate(f.value[1])}`):'—'):this.esc(f.value)||'—';
            const icon=f.icon||(/employee|name/i.test(f.fieldname||'')?'user':/department|company/i.test(f.fieldname||'')?'building':/status|state/i.test(f.fieldname||'')?'check-circle':f.fieldtype==='Currency'?'money':/date/i.test(f.fieldtype)?'calendar':'file');
            return `<div><dt>${this.esc(__(f.label))}</dt><dd><span class="msr-field-icon">${this.icon(icon)}</span><span class="msr-field-value ${f.fieldtype==='Currency'?'msr-field-money':''} ${['mode_of_payment','payable_account'].includes(f.fieldname)?'msr-account-emphasis':''}">${value}</span></dd></div>`;
        }).join('')||`<p class="msr-note">${__('Open the document to see all permitted details.')}</p>`;
    }
    workflowCard(d,row){
        if(d.flow_mode==='standard'||d.flow_mode==='record'){
            const record=d.flow_mode==='record';
            const status=Number(d.docstatus);
            const history=d.history||[];
            const events=d.document_events||[];
            const submission=events.find(e=>e.action==='Submitted')||history.find(h=>h.comment_type==='Submitted');
            const cancellation=events.find(e=>e.action==='Cancelled')||history.find(h=>h.comment_type==='Cancelled');
            const actor=e=>e?(e.actor_name||e.comment_by||this.person(e.actor||e.owner)):'';
            const date=value=>value?this.esc(frappe.datetime.str_to_user(value)):'';
            if(record)return `<aside class="msr-workflow-card"><h3>${__('Record')}</h3><p class="msr-record-note"><strong>${__('Saved record')}</strong><small>${this.esc(this.person(d.owner))} · ${date(d.modified||d.creation)}</small></p></aside>`;
            const submitted=status===1||status===2;
            return `<aside class="msr-workflow-card"><h3>${__('Document Flow')}</h3><ol class="msr-workflow-steps msr-standard-flow" aria-label="${__('Draft to Submitted')}"><li class="${submitted?'is-recorded':'is-current'}" ${!submitted?'aria-current="step"':''}><span>${submitted?this.icon('check'):''}</span><div><strong>${__('Draft')}</strong><small>${this.esc(this.person(d.owner))}</small><small>${date(d.creation)}</small></div></li><li class="${submitted?'is-current':'is-next'}" ${submitted?'aria-current="step"':''}><span>${submitted?this.icon('check'):''}</span><div><strong>${__('Submitted')}</strong>${submission?`<small>${this.esc(actor(submission))}</small><small>${date(submission.creation)}</small>`:`<small>${submitted?__('Submission complete'):__('Next step')}</small>`}</div></li></ol>${status===2?`<p class="msr-cancelled-note">${__('Cancelled')}${cancellation?` · ${this.esc(actor(cancellation))} · ${date(cancellation.creation)}`:''}</p>`:''}</aside>`;
        }
        const submitted=(d.document_events||[]).find(e=>e.action==='Submitted')||d.history.find(h=>h.comment_type==='Submitted');
        const actor=submitted?(submitted.actor_name||submitted.comment_by||this.person(submitted.actor||submitted.owner)):this.person(d.owner);
        const first=submitted?__('Submitted by {0}',[this.esc(actor)]):__('Created by {0}',[this.esc(actor)]);
        const time=submitted?submitted.creation:d.creation;
        const roles=d.next_roles||[];
        const pending=/pending|await|waiting/i.test(d.state||'');
        const current=pending&&roles.length?__('Pending with {0}',[this.esc(roles.join(', '))]):this.esc(d.state||row.status||__('Current state'));
        const states=d.next_states||[];
        return `<aside class="msr-workflow-card"><h3>${__('Workflow')}</h3><ol class="msr-workflow-steps"><li class="is-recorded"><span>${this.icon('check')}</span><div><strong>${first}</strong><small>${this.esc(frappe.datetime.str_to_user(time))}</small></div></li><li class="is-current"><span></span><div><strong class="msr-current-status msr-tone-${this.statusTone(d.state)}">${current}${d.actions.length?` <b>(${__('You')})</b>`:''}</strong>${!d.actions.length&&roles.length?`<small>${this.esc(roles.join(', '))}</small>`:''}</div></li>${states.length?`<li class="is-next"><span></span><div><strong>${this.esc(states.join(' / '))}</strong><small>${states.length===1?__('(Next configured state)'):__('(Possible next states)')}</small></div></li>`:''}</ol></aside>`;
    }
    additionalFields(d){
        if(!d.additional_fields?.length)return '';
        return `<details class="msr-extra-fields"><summary>${__('More document details')} (${d.additional_fields.length})</summary><dl>${this.summaryFields({fields:d.additional_fields,currency:d.currency})}</dl></details>`;
    }
    tableValue(value,meta,currency){
        if(value==null||value==='')return '—';
        if(/(^|_)(status|state)$/.test(meta?.fieldname||''))return this.statusPill(value);
        if(meta?.fieldtype==='Currency')return this.money(value,meta.options==='currency'?currency:null);
        if(meta?.fieldtype==='Check')return Number(value)?__('Yes'):__('No');
        if(meta?.fieldtype==='Date')return this.shortDate(value);
        return this.esc(value);
    }
    expenseTables(d){
        return d.tables.map(t=>{
            const metadata=t.column_meta||{};
            const amountColumn=c=>/(^|_)(amount|total)$/.test(c);
            const columns=t.compact_items?`<colgroup>${t.columns.map(c=>`<col class="msr-col-${this.esc(c)}">`).join('')}</colgroup>`:'';
            const numeric=c=>['Currency','Float','Int','Percent','Duration'].includes(metadata[c]?.fieldtype)||c==='amount';
            const rows=t.rows.map((r,i)=>`<tr>${t.compact_items?'':`<td>${i+1}</td>`}${t.columns.map(c=>`<td class="${numeric(c)?'msr-number-cell':''} ${amountColumn(c)?'msr-amount-cell':''}">${metadata[c]?this.tableValue(r[c],{...metadata[c],fieldname:c},d.currency):c==='amount'?this.money(r[c],d.currency):this.esc(r[c])}</td>`).join('')}</tr>${t.row_details?.[i]?.length?`<tr class="msr-row-more"><td colspan="${t.columns.length+1}"><details><summary>${__('Row {0} details',[i+1])}</summary><dl>${this.summaryFields({fields:t.row_details[i],currency:d.currency})}</dl></details></td></tr>`:''}`).join('');
            return `<div class="msr-expense-card ${t.column_meta?'msr-business-table':''} ${t.compact_items?'msr-compact-items':''}"><h3>${this.esc(__(t.label))} ${t.column_meta?`<small>(${t.rows.length})</small>`:''}</h3><div class="msr-table-scroll"><table class="msr-table msr-expense-table" aria-label="${this.esc(__(t.label))}">${columns}<thead><tr>${t.compact_items?'':'<th>#</th>'}${t.columns.map(c=>`<th class="${numeric(c)?'msr-number-cell':''} ${amountColumn(c)?'msr-amount-cell':''}">${this.esc(__(metadata[c]?.label||frappe.unscrub(c)))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody>${t.total!=null?`<tfoot><tr>${t.compact_items?`<td colspan="${Math.max(1,t.columns.length-1)}">${__('Total')}</td><td class="msr-number-cell">${this.money(t.total,d.currency)}</td>`:t.column_meta?`<td colspan="${t.columns.length+1}" class="msr-number-cell">${__('Total Amount')}: ${this.money(t.total,d.currency)}</td>`:`<td colspan="${t.columns.length}">${__('Total')}</td><td class="msr-number-cell">${this.money(t.total,d.currency)}</td>`}</tr></tfoot>`:''}</table></div></div>`;
        }).join('');
    }
    actionClass(action){return /reject|decline|cancel/i.test(action)?'msr-action-danger':/return|correction/i.test(action)?'msr-action-neutral':/approve|accept/i.test(action)?'msr-action-success':'msr-primary';}
    timeline(d){return `<ol class="msr-timeline"><li><strong>${__('Document created')}</strong><small>${this.esc(this.person(d.owner))} · ${this.esc(frappe.datetime.str_to_user(d.creation))}</small></li>${d.history.map(h=>`<li><strong>${this.esc(h.content.replace(/<[^>]*>/g,''))}</strong><small>${this.esc(h.comment_by||this.person(h.owner))} · ${this.esc(frappe.datetime.str_to_user(h.creation))}</small></li>`).join('')}</ol>`;}
    reviewTab(tab){this.root.find('[data-review-tab]').each((_,el)=>{$(el).toggleClass('is-active',el.dataset.reviewTab===tab).attr('aria-selected',String(el.dataset.reviewTab===tab)).attr('tabindex',el.dataset.reviewTab===tab?0:-1);});this.root.find('[data-panel]').each((_,el)=>$(el).prop('hidden',el.dataset.panel!==tab));}
    confirmAction(doc,action,row){if(!this.ensureClean())return;const pendingComment=this.root.find('.msr-remarks').val()||'';frappe.confirm(action==='Cancel'&&doc.doctype==='Expense Claim'?__('Cancel this submitted claim? Frappe will enforce linked-document checks and reverse its posted accounting/advance effects.'):action?__('Apply {0} to {1}?',[this.esc(action),this.esc(doc.name)]):__('Complete this assignment?'),async()=>{this.root.find('.msr-drawer .msr-action-buttons button,.msr-drawer footer button').prop('disabled',true);try{const result=await this.api(action?'act':'complete_task',action?{doctype:doc.doctype,name:doc.name,action,modified:doc.modified}:{name:doc.name,modified:doc.modified});frappe.show_alert({message:result.data.queued?__('Action queued by Frappe'):__('Work updated'),indicator:'green'});await this.load();await this.review(row);this.root.find('.msr-remarks').val(pendingComment).trigger('input');}catch(error){this.root.find('.msr-drawer .msr-action-buttons button,.msr-drawer footer button').prop('disabled',false);}});}

};
