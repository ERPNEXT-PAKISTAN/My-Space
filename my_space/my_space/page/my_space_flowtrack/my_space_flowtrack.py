"""Permission-aware data endpoints for the FlowTrack Desk page."""

import frappe
from frappe.utils import cint, cstr, strip_html, getdate, add_days
from frappe.model import get_permitted_fields
from my_space.review.list_values import AMOUNTS, monetary_value
from my_space.date_limits import date_range, date_filters

MODULES = {
    "sales": {"label": "Sales", "stages": ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Payment Entry"]},
    "buying": {"label": "Buying", "stages": ["Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Payment Entry"]},
    "stock": {"label": "Stock & Delivery", "stages": ["Material Request", "Stock Entry", "Delivery Note", "Purchase Receipt", "Pick List"]},
    "accounts": {"label": "Accounts", "stages": ["Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry"]},
    "manufacturing": {"label": "Manufacturing", "stages": ["BOM", "Work Order", "Job Card", "Stock Entry"]},
    "hr": {"label": "HR & Payroll", "stages": ["Employee", "Employee Checkin", "Attendance", "Leave Application", "Expense Claim", "Employee Advance", "Salary Slip", "Payroll Entry"]},
    "projects": {"label": "Projects", "stages": ["Project", "Task", "Timesheet"]},
    "crm": {"label": "CRM", "stages": ["Lead", "Opportunity", "Quotation"]},
}

QUICK_CREATE = {
    "Quotation": ["quotation_to", "party_name", "transaction_date"],
    "Sales Order": ["customer", "transaction_date", "delivery_date"],
    "Delivery Note": ["customer", "posting_date"],
    "Sales Invoice": ["customer", "posting_date", "due_date"],
    "Material Request": ["material_request_type", "transaction_date", "schedule_date"],
    "Purchase Order": ["supplier", "transaction_date", "schedule_date"],
    "Purchase Receipt": ["supplier", "posting_date"],
    "Purchase Invoice": ["supplier", "posting_date", "due_date"],
    "Stock Entry": ["stock_entry_type", "posting_date"],
    "Payment Entry": ["payment_type", "party_type", "party", "posting_date", "paid_amount"],
    "Journal Entry": ["voucher_type", "posting_date"],
    "Work Order": ["production_item", "qty", "planned_start_date"],
    "Leave Application": ["employee", "leave_type", "from_date", "to_date"],
    "Project": ["project_name", "expected_start_date", "expected_end_date"],
    "Task": ["subject", "project", "status", "exp_start_date", "exp_end_date"],
    "Lead": ["lead_name", "company_name", "email_id", "mobile_no"],
    "Opportunity": ["opportunity_from", "party_name", "opportunity_type", "transaction_date"]
}


def _available(doctype):
    return bool(frappe.db.exists("DocType", doctype) and not frappe.get_meta(doctype).issingle)


def _allowed(doctype, ptype="read"):
    return _available(doctype) and frappe.has_permission(doctype, ptype)


def _stage_data(doctype, date_from=None, date_to=None):
    if not _available(doctype):
        return {"doctype": doctype, "available": False, "count": None}
    can_read = frappe.has_permission(doctype, "read")
    can_create = frappe.has_permission(doctype, "create")
    if not can_read:
        return {"doctype": doctype, "available": True, "permitted": False, "count": None, "can_create": can_create}
    meta = frappe.get_meta(doctype)
    filters = date_filters(meta, date_from, date_to)
    try:
        fields = [{"COUNT": "name", "as": "count"}] + (["docstatus"] if meta.is_submittable else [])
        rows = frappe.get_list(doctype, fields=fields, filters=filters, group_by="docstatus" if meta.is_submittable else None, page_length=3)
        count = sum(cint(row['count']) for row in rows)
        draft = sum(cint(row['count']) for row in rows if row.get('docstatus') == 0) if meta.is_submittable else 0
        submitted = sum(cint(row['count']) for row in rows if row.get('docstatus') == 1) if meta.is_submittable else count
    except Exception:
        count, draft, submitted = None, None, None
    return {"doctype": doctype, "available": True, "permitted": True, "count": count,
            "draft": draft, "in_progress": submitted, "can_create": can_create}


def _record_fields(meta):
    """Bounded list projection including only readable, visible business fields."""
    permitted = set(get_permitted_fields(meta.name))
    candidates = ["customer", "supplier", "employee", "employee_name", "project", "subject", "title", "status", "approval_status", "workflow_state", "transaction_date", "posting_date", "attendance_date", "from_date", "time", "currency", "company", "party_account_currency", "paid_from_account_currency", "paid_to_account_currency", "payment_type", "paid_amount", "received_amount", "log_type", "shift", "attendance", "total_claimed_amount"]
    if meta.name == "ToDo":
        candidates += ["description", "reference_type", "reference_name", "assigned_by", "allocated_to", "date", "priority"]
    candidates += AMOUNTS.get(meta.name, ["grand_total", "total_amount", "total", "amount", "net_total"])
    fields = ["name", "creation", "modified", "docstatus"]
    for name in candidates:
        df = meta.get_field(name)
        if name not in fields and name in permitted and df and not df.hidden:
            fields.append(name)
    return fields


def _record_values(row, meta, fields):
    row["doctype"] = meta.name
    date = next((name for name in ("transaction_date", "posting_date", "attendance_date", "from_date", "time") if name in fields and row.get(name)), None)
    row["entry_date"] = row.get(date) if date else row.get("creation")
    row["entry_date_label"] = "Date" if date else "Created"
    row["is_submittable"] = bool(meta.is_submittable)
    row["document_status_label"] = {0: "Draft", 1: "Submitted", 2: "Cancelled"}.get(cint(row.get("docstatus")), "Unknown") if meta.is_submittable else "Recorded"
    row["entry_status_label"] = row.get("status") or row.get("approval_status") or row.get("workflow_state") or row.get("log_type") or "Not set"
    row["status_label"] = row.get("status") or "Saved" if not meta.is_submittable else {0:"Draft",1:"Submitted",2:"Cancelled"}.get(cint(row.get("docstatus")), "Unknown")
    if meta.name == "Employee Checkin":
        row["status_label"] = row.get("log_type") or "Recorded"
    if meta.name == "ToDo":
        row["title"] = strip_html(cstr(row.get("description")))[:180] or "ToDo"
        row.pop("description", None)
    if meta.name == "Expense Claim" and "total_claimed_amount" in fields:
        row["amount"],row["amount_label"] = row.get("total_claimed_amount"),"Claim Amount"
        row["currency"] = row.get("currency")
        return row
    amount, label, currency = monetary_value(row, meta, set(fields))
    row["amount"], row["amount_label"], row["currency"] = amount, label, currency
    return row


@frappe.whitelist()
def get_dashboard(date_from=None, date_to=None):
    """Return permitted module stage counts and a bounded recent document feed."""
    if frappe.session.user == "Guest":
        raise frappe.PermissionError
    date_from, date_to = date_range(date_from, date_to)
    modules = []
    stage_cache = {}
    for key, config in MODULES.items():
        for dt in config["stages"]:
            if dt not in stage_cache: stage_cache[dt] = _stage_data(dt, date_from, date_to)
        stages = [stage_cache[dt] for dt in config["stages"]]
        if any(stage["available"] for stage in stages):
            modules.append({"key": key, "label": config["label"], "stages": stages})

    recent = []
    for dt in ("Sales Order", "Purchase Order", "Sales Invoice", "Purchase Invoice", "Delivery Note", "Work Order", "Task"):
        if not _allowed(dt):
            continue
        meta = frappe.get_meta(dt)
        fields = _record_fields(meta)
        try:
            for row in frappe.get_list(dt, fields=fields, filters=date_filters(meta,date_from,date_to), order_by="modified desc", limit_page_length=8):
                recent.append(_record_values(row, meta, fields))
        except Exception:
            continue
    recent.sort(key=lambda row: str(row.get("modified") or ""), reverse=True)
    companies = frappe.get_list("Company", fields=["name"], order_by="name", limit_page_length=200) if frappe.has_permission("Company", "read") else []
    return {"modules": modules, "recent": recent[:12], "companies": [row.name for row in companies]}


@frappe.whitelist()
def get_documents(doctype, search=None, start=0, page_length=20, company=None, status=None, date_from=None, date_to=None):
    """Search/list records using permission-aware get_list and bounded paging."""
    if not isinstance(doctype, str) or not _allowed(doctype):
        frappe.throw(frappe._("Not permitted"), frappe.PermissionError)
    meta = frappe.get_meta(doctype)
    page_length = min(max(cint(page_length) or 20, 1), 50)
    start = min(100000, max(cint(start), 0))
    filters = [["allocated_to", "=", frappe.session.user]] if doctype == "ToDo" else []
    if company and meta.has_field("company"):
        filters.append(["company", "=", company])
    status_field = "status" if meta.has_field("status") else None
    if status == "Draft" and meta.is_submittable:
        filters.append(["docstatus", "=", 0])
    elif status == "Submitted" and meta.is_submittable:
        filters.append(["docstatus", "=", 1])
    elif status == "Cancelled" and meta.is_submittable:
        filters.append(["docstatus", "=", 2])
    elif status and status_field:
        filters.append([status_field, "=", status])
    filters.extend(date_filters(meta, date_from, date_to))
    fields = _record_fields(meta)
    # Search only the document name. Never interpolate user text into SQL.
    or_filters = {"name": ["like", f"%{search.strip()[:140]}%"]} if search and search.strip() else None
    rows = frappe.get_list(doctype, filters=filters, or_filters=or_filters, fields=fields,
                           order_by="modified desc", limit_start=start, limit_page_length=page_length + 1)
    more = len(rows) > page_length
    rows = rows[:page_length]
    for row in rows:
        _record_values(row, meta, fields)
        row["can_edit"] = row.docstatus == 0 and frappe.has_permission(doctype, "write", doc=row.name)
    return {"rows": rows, "has_more": more, "start": start, "page_length": page_length,
            "can_create": frappe.has_permission(doctype, "create")}


@frappe.whitelist()
def get_entry_config(doctype):
    """Resolve curated quick fields against live metadata and permissions."""
    if not isinstance(doctype, str) or not _allowed(doctype, "create"):
        frappe.throw(frappe._("Not permitted"), frappe.PermissionError)
    meta = frappe.get_meta(doctype)
    configured = QUICK_CREATE.get(doctype, [])
    fields = []
    for fieldname in configured:
        field = meta.get_field(fieldname)
        if not field or field.hidden or field.read_only or field.fieldtype in ("Table", "Table MultiSelect", "Section Break", "Column Break", "HTML", "Button"):
            continue
        item = {"fieldname": field.fieldname, "label": field.label, "fieldtype": field.fieldtype,
                "reqd": bool(field.reqd), "options": field.options}
        if field.fieldtype == "Select":
            item["options"] = [x for x in (field.options or "").split("\n") if x]
        if field.default:
            item["default"] = field.default
        fields.append(item)
    return {"doctype": doctype, "fields": fields, "can_create": True,
            "full_form_route": ["Form", doctype, "new-" + frappe.scrub(doctype)]}


@frappe.whitelist(methods=["POST"])
def create_document(doctype, values):
    """Create only a draft through standard validation and permission checks."""
    if not isinstance(doctype, str) or not _allowed(doctype, "create"):
        frappe.throw(frappe._("Not permitted"), frappe.PermissionError)
    values = frappe.parse_json(values) if isinstance(values, str) else values
    if not isinstance(values, dict):
        frappe.throw(frappe._("Invalid document values."))
    configured = QUICK_CREATE.get(doctype)
    if not configured:
        frappe.throw(frappe._("Quick entry is not configured for this DocType."))
    meta = frappe.get_meta(doctype)
    data = {key: value for key, value in values.items() if key in configured and meta.has_field(key)}
    doc = frappe.get_doc({"doctype": doctype, **data})
    doc.insert()
    return {"doctype": doctype, "name": doc.name, "route": ["Form", doctype, doc.name]}


WORK_VIEWS = {"todos", "assigned", "checkins", "drafts", "submitted"}


def _work_sources(view):
    if view in {"todos", "assigned"}:
        types = ["ToDo"]
    elif view == "checkins":
        types = ["Employee Checkin"]
    else:
        types = sorted({dt for module in MODULES.values() for dt in module["stages"]})
    return [frappe.get_meta(dt) for dt in types if _allowed(dt) and (view not in {"drafts", "submitted"} or frappe.get_meta(dt).is_submittable)]


def _work_filters(meta, view, fields, company=None, status=None, date_from=None, date_to=None):
    filters = []
    if view in {"todos", "assigned"}:
        # Tasks and assignments are always scoped to the authenticated assignee.
        filters.append(["allocated_to", "=", frappe.session.user])
        if view == "assigned":
            filters.append(["status", "=", "Open"])
    if view in {"drafts", "submitted"}:
        filters.append(["docstatus", "=", 0 if view == "drafts" else 1])
    if company:
        if "company" not in fields:
            return None
        filters.append(["company", "=", company])
    if status:
        if meta.name == "ToDo":
            filters.append(["status", "=", status])
        elif status in {"Draft", "Submitted", "Cancelled"}:
            if not meta.is_submittable:
                return None
            filters.append(["docstatus", "=", {"Draft":0,"Submitted":1,"Cancelled":2}[status]])
        elif "status" in fields:
            filters.append(["status", "=", status])
        elif meta.name == "Employee Checkin" and "log_type" in fields:
            filters.append(["log_type", "=", status])
        else:
            return None
    filters.extend(date_filters(meta, date_from, date_to))
    return filters


@frappe.whitelist()
def get_work(view, search=None, start=0, page_length=20, company=None, status=None, date_from=None, date_to=None, record_limit=100):
    """Merge a bounded, permission-filtered work window; hydrate only task page links."""
    from my_space.review.api import _user
    _user()
    if view not in WORK_VIEWS:
        frappe.throw(frappe._("Choose a valid work view."))
    date_from, date_to = date_range(date_from, date_to)
    limit = min(100, max(20, cint(record_limit) or 50))
    page_length = min(50, max(1, cint(page_length) or 20))
    start = min(limit, max(0, cint(start)))
    pool=[]
    for meta in _work_sources(view):
        fields=_record_fields(meta)
        filters=_work_filters(meta, view, fields, company, status, date_from, date_to)
        if filters is None:
            continue
        if search and cstr(search).strip():
            filters.append(["name", "like", "%"+cstr(search).strip()[:140]+"%"])
        rows=frappe.get_list(meta.name, fields=fields, filters=filters, order_by="modified desc, name desc", limit_page_length=limit+1)
        pool.extend(_record_values(row,meta,fields) for row in rows)
    pool.sort(key=lambda row:(cstr(row.get("modified")),row["doctype"],row["name"]),reverse=True)
    truncated=len(pool)>limit
    window=pool[:limit]
    rows=window[start:start+page_length]
    if view in {"todos", "assigned"}:
        from my_space.review.assignment_details import reference_brief
        for row in rows:
            brief=reference_brief(row)
            row["reference_preview"]=brief
            # Reference IDs only appear as linked context after native read checks.
            row.pop("reference_type",None);row.pop("reference_name",None)
            if brief:
                row["amount"],row["amount_label"],row["currency"]=brief["amount"],brief["amount_label"],brief["currency"]
    return dict(rows=rows,has_more=start+page_length<len(window),start=start,page_length=page_length,record_limit=limit,truncated=truncated,window_count=len(window))
