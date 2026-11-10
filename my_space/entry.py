"""Focused My Space entry forms backed by native ERPNext draft creation."""
from hashlib import sha256
from math import isfinite
from pathlib import Path
from urllib.parse import quote

import frappe
from frappe import _
from frappe.model import get_permitted_fields
from frappe.utils import cint, flt, nowdate, strip_html

FORMS = {
    'sales-order': {'doctype': 'Sales Order', 'party': 'customer', 'date': 'transaction_date', 'due': 'delivery_date', 'price_list': 'selling_price_list', 'extra': ['po_no', 'po_date']},
    'purchase-order': {'doctype': 'Purchase Order', 'party': 'supplier', 'date': 'transaction_date', 'due': 'schedule_date', 'price_list': 'buying_price_list', 'extra': []},
    'sales-invoice': {'doctype': 'Sales Invoice', 'party': 'customer', 'date': 'posting_date', 'due': 'due_date', 'price_list': 'selling_price_list', 'extra': ['debit_to']},
    'purchase-invoice': {'doctype': 'Purchase Invoice', 'party': 'supplier', 'date': 'posting_date', 'due': 'due_date', 'price_list': 'buying_price_list', 'extra': ['bill_no', 'bill_date', 'credit_to']},
}
ITEM_FIELDS = ('item_code', 'qty', 'rate', 'uom', 'warehouse', 'cost_center', 'schedule_date', 'delivery_date')


def require_access(kind):
    spec = FORMS.get(kind)
    if not spec:
        frappe.throw(_('Unknown entry form.'), frappe.ValidationError)
    if frappe.session.user == 'Guest' or 'Desk User' not in frappe.get_roles() or not any(frappe.has_permission(spec['doctype'], action) for action in ('create', 'read', 'write')):
        frappe.throw(_('You do not have permission to create this document.'), frappe.PermissionError)
    return spec


def _fields(spec):
    meta = frappe.get_meta(spec['doctype'])
    permitted = set(get_permitted_fields(spec['doctype'], permission_type='write'))
    names = [spec['party'], 'company', spec['date'], spec['due'], *spec['extra'], 'currency', spec['price_list'], 'conversion_rate', 'set_warehouse', 'cost_center', 'taxes_and_charges', 'remarks']
    if 'Invoice' in spec['doctype']:
        names.append('update_stock')
    result = []
    for name in names:
        df = meta.get_field(name)
        if name in {'currency', 'conversion_rate', 'credit_to', 'debit_to'}:
            continue
        if df and name in permitted and not df.hidden and not df.read_only:
            result.append({'fieldname': name, 'label': _(df.label), 'fieldtype': df.fieldtype, 'options': df.options, 'required': name in (spec['party'], 'company', spec['date'], spec['due'])})
    return result


def _can_link(doctype, name):
    return bool(name and (frappe.has_permission(doctype, 'read', doc=name) or frappe.has_permission(doctype, 'select', doc=name)))


def assets():
    root = Path(__file__).parent / 'public'
    return {ext: f'/assets/my_space/{folder}/entry.{ext}?v={sha256((root/folder/f"entry.{ext}").read_bytes()).hexdigest()[:12]}' for ext, folder in [('css', 'css'), ('js', 'js')]}


def page_context(context, kind):
    if frappe.session.user == 'Guest':
        frappe.local.flags.redirect_location = '/login?redirect-to=' + quote('/my-space-' + kind, safe='')
        raise frappe.Redirect
    spec = require_access(kind)
    context.no_header = context.no_cache = True
    name = frappe.form_dict.get('name')
    if name:
        existing = frappe.get_doc(spec['doctype'], name)
        existing.check_permission('read')
    elif not frappe.has_permission(spec['doctype'], 'create'):
        frappe.throw(_('You do not have permission to create this document.'), frappe.PermissionError)
    context.title = (_('{0} {1}').format(_(spec['doctype']), name) if name else _('Create {0}').format(_(spec['doctype'])))
    context.entry_kind = kind
    context.entry_doctype = spec['doctype']
    context.entry_assets = assets()
    context.entry_boot = get_config(kind)
    if name:
        context.entry_boot['document'] = _document_result(kind, existing)
    context.csrf_token = frappe.sessions.get_csrf_token()
    from my_space.preferences import get_theme
    context.flow_theme = get_theme()
    return context


@frappe.whitelist()
def get_config(kind, company=None):
    spec = require_access(kind)
    fields = _fields(spec)
    company = company or frappe.defaults.get_user_default('Company') or frappe.db.get_single_value('Global Defaults', 'default_company')
    if not _can_link('Company', company):
        company = ''
    currency = frappe.get_cached_value('Company', company, 'default_currency') if company else ''
    settings = 'Selling Settings' if spec['party'] == 'customer' else 'Buying Settings'
    price_list = frappe.db.get_single_value(settings, spec['price_list'])
    defaults = {'company': company, 'currency': currency, spec['price_list']: price_list, spec['date']: nowdate(), spec['due']: nowdate(), 'update_stock': 0}
    if company:
        defaults['cost_center'] = frappe.get_cached_value('Company', company, 'cost_center')
        defaults['set_warehouse'] = frappe.defaults.get_user_default('Warehouse') or ''
        tax_type = 'Sales Taxes and Charges Template' if spec['party'] == 'customer' else 'Purchase Taxes and Charges Template'
        default_tax = frappe.db.get_value(tax_type, {'company': company, 'is_default': 1, 'disabled': 0}, 'name')
        if default_tax and _can_link(tax_type, default_tax):
            defaults['taxes_and_charges'] = default_tax
    allowed = {f['fieldname'] for f in fields}
    return {'kind': kind, 'doctype': spec['doctype'], 'party': spec['party'], 'date': spec['date'], 'due': spec['due'], 'price_list': spec['price_list'], 'invoice': 'Invoice' in spec['doctype'], 'fields': fields, 'defaults': {k: v for k, v in defaults.items() if k in allowed or k == 'currency'}, 'list_url': '/desk/' + kind, 'new_url': '/desk/' + kind + '/new-' + kind}


@frappe.whitelist()
def search_link(kind, fieldname, text='', company=''):
    spec = require_access(kind)
    fields = {f['fieldname']: f for f in _fields(spec)}
    item_meta = frappe.get_meta(spec['doctype'] + ' Item')
    item_permitted = get_permitted_fields(item_meta.name, parenttype=spec['doctype'], permission_type='write')
    if fieldname in ITEM_FIELDS and fieldname in item_permitted:
        df = item_meta.get_field(fieldname)
        field = {'fieldtype': df.fieldtype, 'options': df.options} if df and not df.hidden else None
    else:
        field = fields.get(fieldname)
    if not field or field['fieldtype'] != 'Link':
        frappe.throw(_('This lookup is not available.'), frappe.PermissionError)
    target = field['options']
    filters = {}
    if target in ('Customer', 'Supplier', 'Item', 'Currency'):
        key = 'enabled' if target == 'Currency' else 'disabled'
        filters[key] = 1 if key == 'enabled' else 0
    if target in ('Sales Taxes and Charges Template', 'Purchase Taxes and Charges Template'):
        filters['disabled'] = 0
    if target == 'Warehouse':
        filters.update(is_group=0, disabled=0)
    if target == 'Account':
        filters.update(is_group=0, disabled=0, account_type='Receivable' if fieldname == 'debit_to' else 'Payable')
    if target == 'Cost Center':
        filters['is_group'] = 0
    if target == 'Price List':
        filters.update(enabled=1, **{'selling' if spec['party'] == 'customer' else 'buying': 1})
    if company and frappe.get_meta(target).has_field('company'):
        filters['company'] = company
    from frappe.desk.search import search_link as native_search
    rows = native_search(target, (text or '')[:140], filters=filters, page_length=20, reference_doctype=spec['doctype'])
    return [{'value': row['value'], 'label': row.get('label') or row['value'], 'description': strip_html(row.get('description') or '')[:180]} for row in rows]


@frappe.whitelist()
def item_defaults(kind, item_code, company, party='', currency='', price_list='', qty=1, date=None, uom=None):
    spec = require_access(kind)
    if not _can_link('Item', item_code) or not _can_link('Company', company):
        frappe.throw(_('Item or company is not available to your account.'), frappe.PermissionError)
    from erpnext.stock.get_item_details import get_item_details
    args = {'doctype': spec['doctype'], 'item_code': item_code, 'company': company, spec['party']: party, 'currency': currency, 'price_list': price_list, 'qty': flt(qty) or 1, 'transaction_date': date or nowdate(), 'posting_date': date or nowdate(), 'uom': uom or None}
    values = get_item_details(args)
    permitted = set(get_permitted_fields(spec['doctype'] + ' Item', parenttype=spec['doctype']))
    return {k: values.get(k) for k in ('item_name', 'uom', 'warehouse', 'rate', 'price_list_rate') if k in permitted}


def _apply_entry_data(spec, data, doc=None):
    data = frappe.parse_json(data) if isinstance(data, str) else data
    if not isinstance(data, dict):
        frappe.throw(_('Invalid document data.'))
    fields = {f['fieldname']: f for f in _fields(spec)}
    if set(data) - set(fields) - {'items'}:
        frappe.throw(_('One or more fields are not editable in this form.'), frappe.PermissionError)
    for name in (spec['party'], 'company', spec['date'], spec['due']):
        if not data.get(name):
            frappe.throw(_('{0} is required.').format(fields.get(name, {}).get('label') or name))
    items = data.get('items')
    if not isinstance(items, list) or not 1 <= len(items) <= 50:
        frappe.throw(_('Add between 1 and 50 items.'))
    existing = {row.name: row for row in doc.items} if doc else {}
    seen = set()
    clean_items = []
    permitted = set(get_permitted_fields(spec['doctype'] + ' Item', parenttype=spec['doctype'], permission_type='write'))
    for row in items:
        if not isinstance(row, dict) or not row.get('item_code'):
            frappe.throw(_('Every row needs an Item Code.'))
        if set(row) - set(ITEM_FIELDS) - {'name'}:
            frappe.throw(_('One or more item fields are not editable.'), frappe.PermissionError)
        row_name = row.get('name')
        if row_name and (row_name not in existing or row_name in seen):
            frappe.throw(_('This item row does not belong to this document.'), frappe.PermissionError)
        seen.add(row_name) if row_name else None
        qty = flt(row.get('qty'))
        rate = flt(row.get('rate')) if row.get('rate') not in (None, '') else None
        if not isfinite(qty) or qty <= 0 or rate is not None and (not isfinite(rate) or rate < 0):
            frappe.throw(_('Quantities must be positive and rates must be zero or greater.'))
        clean = {k: row[k] for k in ITEM_FIELDS if k in permitted and row.get(k) not in (None, '')}
        clean['qty'] = qty
        if rate is not None:
            clean['rate'] = rate
        if spec['due'] in ('schedule_date', 'delivery_date'):
            clean[spec['due']] = data[spec['due']]
        if data.get('set_warehouse'):
            clean['warehouse'] = data['set_warehouse']
        if row_name:
            child = existing[row_name]
            if child.item_code != row['item_code']:
                linked = any(child.get(df.fieldname) for df in frappe.get_meta(child.doctype).fields if df.fieldtype == 'Link' and df.options in FORMS_DOCTYPES | {'Delivery Note', 'Purchase Receipt'})
                if linked:
                    frappe.throw(_('Remove the linked item row and add a new row to change its Item Code.'))
                # Start a fresh row for a different item so old item defaults are not retained.
                clean_items.append(clean)
            else:
                child.update(clean)
                clean_items.append(child)
        else:
            clean_items.append(clean)
    is_new = doc is None
    doc = doc or frappe.new_doc(spec['doctype'])
    old_company = doc.get('company')
    old_tax_template = doc.get('taxes_and_charges')
    doc.update({k: v for k, v in data.items() if k in fields})
    if 'Invoice' in spec['doctype'] and 'update_stock' in fields:
        doc.update_stock = cint(data.get('update_stock'))
        if doc.update_stock not in (0, 1):
            frappe.throw(_('Update Stock must be checked or unchecked.'))
    if is_new or old_company != doc.company:
        doc.currency = frappe.get_cached_value('Company', doc.company, 'default_currency')
    tax_template = doc.get('taxes_and_charges')
    if tax_template:
        tax_type = frappe.get_meta(spec['doctype']).get_field('taxes_and_charges').options
        if not _can_link(tax_type, tax_template):
            frappe.throw(_('This tax template is not available to your account.'), frappe.PermissionError)
        template = frappe.get_cached_doc(tax_type, tax_template)
        if template.disabled or template.company != doc.company:
            frappe.throw(_('Choose an enabled tax template for the selected company.'))
    if not is_new and old_tax_template != tax_template:
        doc.set('taxes', [])
        if tax_template:
            doc.append_taxes_from_master()
        else:
            doc.flags.dont_auto_add_taxes = True
    doc.set('items', clean_items)
    doc.set_missing_values()
    return doc


FORMS_DOCTYPES = {spec['doctype'] for spec in FORMS.values()}


def _submission_options(doc):
    if cint(doc.docstatus) != 0 or not doc.has_permission('submit'):
        return []
    from frappe.model.workflow import get_workflow_name, get_transitions, has_approval_access
    name = get_workflow_name(doc.doctype)
    if not name:
        return ['Submit']
    workflow = frappe.get_cached_doc('Workflow', name)
    if not doc.get(workflow.workflow_state_field):
        return []
    states = {row.state: cint(row.doc_status) for row in workflow.states}
    return list(dict.fromkeys(row.action for row in get_transitions(doc, workflow) if states.get(row.next_state) == 1 and has_approval_access(frappe.session.user, doc, row)))


def _document_result(kind, doc):
    doc.check_permission('read')
    if len(doc.items) > 50:
        frappe.throw(_('This document has more than 50 items. Open the full ERPNext form to edit it.'))
    readable = set(get_permitted_fields(doc.doctype))
    child_readable = set(get_permitted_fields(doc.doctype + ' Item', parenttype=doc.doctype))
    fields = {f['fieldname']: doc.get(f['fieldname']) for f in _fields(FORMS[kind]) if f['fieldname'] in readable}
    items = [dict(name=row.name, **{key: row.get(key) for key in ('item_code', 'qty', 'rate', 'uom') if key in child_readable}) for row in doc.items]
    result = dict(name=doc.name, doctype=doc.doctype, docstatus=cint(doc.docstatus), modified=str(doc.modified),
                url='/desk/' + kind + '/' + quote(doc.name, safe=''), fields=fields, items=items,
                can_edit=cint(doc.docstatus) == 0 and doc.has_permission('write'),
                submit_actions=_submission_options(doc), update_stock=cint(doc.get('update_stock')) if 'update_stock' in readable else None,
                currency=doc.currency if 'currency' in readable else '', grand_total=doc.grand_total if 'grand_total' in readable else None)
    return frappe.parse_json(frappe.as_json(result))


def _locked_document(kind, name, modified):
    spec = require_access(kind)
    doc = frappe.get_doc(spec['doctype'], name)
    doc.check_permission('read')
    frappe.db.get_value(spec['doctype'], name, 'modified', for_update=True)
    doc.reload()
    doc.check_permission('read')
    if not modified or str(doc.modified) != str(modified):
        frappe.throw(_('This document changed in another window. Reload it before saving or submitting.'), frappe.TimestampMismatchError)
    if cint(doc.docstatus) != 0:
        frappe.throw(_('Only Draft documents can be edited or submitted from this form.'))
    return doc


@frappe.whitelist(methods=['POST'])
def create_draft(kind, data):
    spec = require_access(kind)
    if not frappe.has_permission(spec['doctype'], 'create'):
        frappe.throw(_('You do not have permission to create this document.'), frappe.PermissionError)
    doc = _apply_entry_data(spec, data)
    doc.insert()
    return _document_result(kind, doc)


@frappe.whitelist()
def load_document(kind, name):
    spec = require_access(kind)
    doc = frappe.get_doc(spec['doctype'], name)
    return _document_result(kind, doc)


@frappe.whitelist(methods=['POST'])
def save_draft(kind, name, modified, data):
    doc = _locked_document(kind, name, modified)
    doc.check_permission('write')
    _apply_entry_data(FORMS[kind], data, doc)
    doc.save()
    return _document_result(kind, doc)


@frappe.whitelist(methods=['POST'])
def submit_document(kind, name, modified, action='Submit'):
    doc = _locked_document(kind, name, modified)
    doc.check_permission('submit')
    if action not in _submission_options(doc):
        frappe.throw(_('Submission is not allowed at this workflow stage.'), frappe.PermissionError)
    from frappe.model.workflow import get_workflow_name, apply_workflow
    if get_workflow_name(doc.doctype):
        apply_workflow(doc.as_json(), action)
        doc.reload()
    else:
        doc.submit()
    return _document_result(kind, doc)


@frappe.whitelist()
def scan_barcode(kind, barcode, company, party='', currency='', price_list='', date=None):
    require_access(kind)
    code = str(barcode or '').strip()
    if not code or len(code) > 140:
        frappe.throw(_('Scan or enter a valid barcode.'))
    match = frappe.db.get_value('Item Barcode', {'barcode': code, 'parenttype': 'Item'}, ['parent', 'uom'], as_dict=True)
    if not match or not _can_link('Item', match.parent) or frappe.get_cached_value('Item', match.parent, 'disabled'):
        frappe.throw(_('No available item matches this barcode.'))
    values = item_defaults(kind, match.parent, company, party, currency, price_list, 1, date, match.uom)
    return dict(values, item_code=match.parent, uom=match.uom or values.get('uom'), barcode=code)
