"""FlowTrack document Review and native actions. No inbox or workflow setup."""
from html import escape


from my_space.review.document_details import RECORD_TYPES, EMPLOYEE_TYPES, APPROVER_FIELDS


from my_space.review.status_labels import describe as describe_status, DECISIONS, stage_views


import frappe


from frappe import _


from frappe.model import get_permitted_fields


from frappe.model.workflow import get_transitions, has_approval_access, apply_workflow, is_transition_condition_satisfied


from frappe.utils import cint, cstr, strip_html, flt


SAFE_TYPES = {"Data", "Link", "Dynamic Link", "Select", "Date", "Datetime", "Currency", "Float", "Int", "Percent", "Check", "Small Text", "Text", "Long Text", "Text Editor", "Read Only", "Time", "Duration", "Rating"}


DEFAULT_FIELDS = ["employee", "employee_name", "department", "company", "posting_date", "expense_date", "expense_type", "description", "remarks", "approval_status", "expense_approver", "is_paid", "mode_of_payment", "payable_account", "total_amount_reimbursed", "total_advance_amount", "total_claimed_amount", "total_sanctioned_amount", "grand_total", "total", "currency", "status", "priority"]


def _user():
    if frappe.session.user == "Guest" or "Desk User" not in frappe.get_roles():
        frappe.throw(_("Desk access required"), frappe.PermissionError)
    return frappe.session.user


def _config():
    return frappe.conf.get("flowtrack_review") or {}


def _native_actions(doc):
    if not frappe.get_meta(doc.doctype).is_submittable:
        return []
    status = cint(doc.docstatus)
    if status == 0 and doc.has_permission("write") and doc.has_permission("submit"):
        return ["Submit"]
    if status == 1 and doc.has_permission("cancel"):
        return ["Cancel"]
    return []


def _field(record, name):
    return record.get(name) if hasattr(record, "get") else getattr(record, name, None)


def _transition_has_effect(transition, wf, doc=None):
    state, target = _field(transition, "state"), _field(transition, "next_state")
    if state is None or target is None or state != target:
        return True
    if _field(transition, "transition_tasks"):
        return True
    row = next((r for r in getattr(wf, "states", []) if _field(r, "state") == target), None)
    field = _field(row, "update_field") if row else None
    if field:
        return bool(_field(row, "evaluate_as_expression") or doc is None or cstr(doc.get(field)) != cstr(_field(row, "update_value")))
    return False


def _transition_consistent(doc, wf, transition):
    if doc.doctype != "Expense Claim" or _field(transition, "next_state") is None:
        return True
    row = next((r for r in getattr(wf, "states", []) if _field(r, "state") == _field(transition, "next_state")), None)
    if not row or _field(transition, "transition_tasks") or _field(row, "evaluate_as_expression"):
        return True
    approval = doc.get("approval_status")
    if _field(row, "update_field") == "approval_status":
        approval = _field(row, "update_value")
    if cint(doc.docstatus) == 0 and cstr(_field(row, "doc_status")) == "1" and approval == "Draft":
        return False
    if cint(_field(row, "doc_status")) != 2 and (_field(transition, "next_state") == "Approved" and approval == "Rejected" or _field(transition, "next_state") == "Rejected" and approval == "Approved"):
        return False
    return True


def _effective_transitions(doc, wf):
    state = doc.get(wf.workflow_state_field)
    return [t for t in wf.transitions if t.state == state and is_transition_condition_satisfied(t, doc) and (doc.doctype != "Expense Claim" or _transition_has_effect(t, wf, doc))]


def _required_transitions(doc, wf):
    transitions = _effective_transitions(doc, wf)
    if doc.doctype != "Expense Claim":
        return transitions
    optional = {_field(row, "state") for row in wf.states if cint(_field(row, "is_optional_state"))}
    return [transition for transition in transitions if transition.next_state not in optional]


def _expense_conflicts(doc, wf):
    """Identify contradictions without rewriting any recorded business status."""
    if not wf:
        return []
    state = cstr(doc.get(wf.workflow_state_field))
    approval = doc.get("approval_status")
    status = doc.get("status")
    row = next((r for r in getattr(wf, "states", []) if _field(r, "state") == state), None)
    notices = []
    expected = _field(row, "doc_status") if row else None
    if expected is not None and cstr(expected) != "" and cint(expected) != cint(doc.docstatus):
        notices.append("Document Status does not match the configured Workflow State.")
    # A cancelled document may legitimately retain its previous approval decision.
    if cint(doc.docstatus) != 2:
        decision = _field(row, "update_value") if row and _field(row, "update_field") == "approval_status" else state
        if (decision == "Approved" and approval in {"Rejected", "Draft"}) or (decision == "Rejected" and approval == "Approved"):
            notices.append("Workflow State and Expense Claim Approval Status disagree.")
        if (status == "Rejected" and approval == "Approved") or (status in {"Paid", "Unpaid"} and approval == "Rejected"):
            notices.append("Expense Claim Status and Approval Status disagree.")
    return notices


def _workflow_notices(doc, wf):
    if not wf or doc.doctype != "Expense Claim":
        return []
    state = doc.get(wf.workflow_state_field)
    notices = []
    for transition in wf.transitions:
        if transition.state != state or not is_transition_condition_satisfied(transition, doc):
            continue
        if not _transition_has_effect(transition, wf, doc):
            notices.append(_("Configured action {0} leaves {1} unchanged and has no field update or task. It is not a new pending approval.").format(transition.action, state))
        elif not _transition_consistent(doc, wf, transition):
            notices.append(_("Configured action {0} would submit a Draft approval or create conflicting Expense Claim approval statuses. Review the native Approval Status and workflow field updates before using it.").format(transition.action))
    return notices


def _expense_status(doc, wf, permitted):
    def value(field):
        return doc.get(field) if field in permitted else None
    document_status = {0: "Draft", 1: "Submitted", 2: "Cancelled"}.get(cint(doc.docstatus), "Unknown")
    state = value(wf.workflow_state_field) if wf else None
    approval, claim = value("approval_status"), value("status")
    cancelled = cint(doc.docstatus) == 2 or claim == "Cancelled"
    rejected = not cancelled and (approval == "Rejected" or claim == "Rejected" or state == "Rejected")
    conflicts = _expense_conflicts(doc, wf)
    outgoing = _required_transitions(doc, wf) if wf else []
    configuration_blocked = bool(outgoing and not any(_transition_consistent(doc, wf, t) for t in outgoing))
    approved = approval == "Approved" or approval is None and claim in {"Paid", "Unpaid"}
    paid = cint(doc.docstatus) == 1 and claim == "Paid" and not rejected and not cancelled
    unpaid = cint(doc.docstatus) == 1 and approved and claim == "Unpaid" and not rejected and not cancelled
    net, reimbursed = value("grand_total"), value("total_amount_reimbursed")
    remaining = max(0, flt(net) - flt(reimbursed)) if net is not None and reimbursed is not None and not rejected and not cancelled else None
    if cancelled:
        display, payment, variant = "Cancelled", "Cancelled", "muted"
    elif rejected:
        display, payment, variant = "Rejected", "Not payable — rejected", "danger"
    elif paid:
        display, payment, variant = "Paid", "Paid", "success"
        if flt(value("total_advance_amount")) > 0 and net is not None and flt(net) == 0:
            payment = "Settled against advance"
    elif unpaid:
        display, payment, variant = "Approved · Unpaid", "Awaiting payment", "warning"
        if reimbursed is not None and flt(reimbursed) > 0 and remaining is not None and remaining > 0:
            payment = "Partly reimbursed"
    elif cint(doc.docstatus) == 0 and state in {"Draft", "Returned"}:
        display, payment, variant = ("Returned for correction" if state == "Returned" else "Draft"), "Not posted", "warning" if state == "Returned" else "muted"
    elif configuration_blocked:
        display, payment, variant = "Draft" if cint(doc.docstatus) == 0 else "Needs Review", "Not posted" if cint(doc.docstatus) == 0 else "Workflow setup needs review", "warning"
    elif outgoing:
        display, payment, variant = "Pending Approval", "Not posted" if cint(doc.docstatus) == 0 else "Awaiting approval", "pending"
    else:
        display, payment, variant = claim or document_status, "Not posted" if cint(doc.docstatus) == 0 else "Not determined", "muted"
    return dict(document_status=document_status, workflow_state=state, approval_status=approval, claim_status=claim, display_status=display, payment_status=payment, variant=variant, conflicts=conflicts, has_conflict=bool(conflicts), configuration_blocked=configuration_blocked, cancelled=cancelled, rejected=rejected, paid=paid, unpaid=unpaid, completed=bool(paid and not outgoing and not conflicts), outstanding=remaining, claimed=value("total_claimed_amount"), sanctioned=value("total_sanctioned_amount"), advance_applied=value("total_advance_amount"), reimbursed=reimbursed, net_payable=net)


def _actions(doc, wf):
    if not wf:
        return _native_actions(doc)
    if not doc.get(wf.workflow_state_field):
        return []
    transitions = get_transitions(doc, wf)
    if doc.doctype == "Expense Claim" and _expense_conflicts(doc, wf):
        cancelled = {_field(row, "state") for row in wf.states if cstr(_field(row, "doc_status")) == "2"}
        transitions = [transition for transition in transitions if transition.next_state in cancelled]
    return list(dict.fromkeys(t.action for t in transitions if has_approval_access(frappe.session.user, doc, t) and (doc.doctype != "Expense Claim" or _transition_has_effect(t, wf, doc)) and _transition_consistent(doc, wf, t)))


def _state_info(doc, wf):
    if not wf:
        if doc.doctype in RECORD_TYPES:
            return "Recorded", False, False, []
        if doc.doctype == "ToDo":
            return doc.get("status"), False, doc.get("status") == "Closed", []
        status = cint(doc.docstatus)
        return {0: "Draft", 1: "Submitted", 2: "Cancelled"}.get(status), status == 2, status == 1, []
    state = doc.get(wf.workflow_state_field)
    outgoing = _required_transitions(doc, wf)
    state_row = next((s for s in wf.states if s.state == state), None)
    style = frappe.db.get_value("Workflow State", state, "style") if state else None
    rejected = style == "Danger" or doc.docstatus == 2
    complete = bool(state and not outgoing and not rejected)
    # Expose configured roles only on documents the user can read; never guess users.
    next_roles = sorted({t.allowed for t in outgoing})
    return state, rejected, complete, next_roles


def _claim_amount(doc, permitted):
    # grand_total is the net sanctioned/taxed amount less allocated advances,
    # not the amount being claimed by the employee.
    for field, label in (("total_claimed_amount", "Claim Amount"), ("grand_total", "Net Payable")):
        if field in permitted and doc.get(field) is not None:
            return doc.get(field), label
    return None, "Claim Amount"


def _readable_table(doc, meta, fieldname):
    df = meta.get_field(fieldname)
    return bool(df and df.fieldtype in {"Table", "Table MultiSelect"} and (frappe.session.user == "Administrator" or not df.permlevel or doc.has_permlevel_access_to(fieldname, df, "read")))


def _claim_settlement(doc, permitted, meta=None):
    """Configured claim settlement route, not proof that money was disbursed."""
    def value(field):
        return doc.get(field) if field in permitted else None
    meta = meta or frappe.get_meta(doc.doctype)
    net = value("grand_total")
    allocated = value("total_advance_amount")
    advances = []
    if _readable_table(doc, meta, "advances"):
        child = set(get_permitted_fields("Expense Claim Advance", parenttype=doc.doctype))
        if allocated is None and "allocated_amount" in child:
            allocated = sum(flt(row.get("allocated_amount")) for row in doc.get("advances", []))
        for row in doc.get("advances", []):
            name = row.get("employee_advance") if "employee_advance" in child else None
            if name and frappe.has_permission("Employee Advance", "read", doc=name):
                advances.append({"doctype": "Employee Advance", "name": name})
    mode = value("mode_of_payment")
    paid = value("is_paid")
    account = value("payable_account")
    method_type = None
    direct = paid is not None and cint(paid) == 1
    if direct and mode and frappe.has_permission("Mode of Payment", "read", doc=mode):
        method_type = frappe.get_cached_value("Mode of Payment", mode, "type")
    base = (method_type if method_type in {"Cash", "Bank"} else "Direct Payment") if direct else ("Payable" if paid is not None and not cint(paid) else "Not specified")
    if flt(allocated) > 0:
        label = "Advance + " + base if net is not None and flt(net) > 0 else "Against Advance"
        kind = "advance"
    else:
        label, kind = base, base.lower().replace(" ", "-")
    configured_route = label
    if cint(doc.docstatus) == 2:
        label, kind = "Cancelled", "cancelled"
    elif "status" in permitted and doc.get("status") == "Rejected" or "approval_status" in permitted and doc.get("approval_status") == "Rejected":
        label, kind = "Not payable (Rejected)", "rejected"
    return {"label": label, "kind": kind, "configured_route": configured_route if configured_route != label else None, "mode_of_payment": mode if direct else None, "payable_account": account, "advance_amount": allocated, "advances": advances, "net_payable": net}


def _document(doctype, name):
    _user()
    doc = frappe.get_doc(doctype, name)
    doc.check_permission("read")
    if doctype == "ToDo" and doc.allocated_to != frappe.session.user:
        frappe.throw(_("Only your own assignments are available"), frappe.PermissionError)
    return doc


def _history(doc):
    # Parent read permission is mandatory. System-generated Workflow comments are
    # existing recorded history; no inferred or reconstructed decisions.
    return frappe.get_all("Comment", filters={"reference_doctype": doc.doctype, "reference_name": doc.name, "comment_type": ["in", ["Workflow", "Submitted", "Cancelled"]]}, fields=["name", "creation", "comment_by", "owner", "content", "comment_type"], order_by="creation asc, name asc")


def _attachments(doc):
    files = frappe.get_list("File", filters={"attached_to_doctype": doc.doctype, "attached_to_name": doc.name}, fields=["name", "file_name", "is_private"], limit_page_length=100)
    return [dict(name=f.name, label=f.file_name, private=bool(f.is_private), can_delete=bool(doc.has_permission("write") and frappe.has_permission("File", "delete", doc=f.name))) for f in files if frappe.has_permission("File", "read", doc=f.name)]


def _expense_summary(doc, permitted, child_fields):
    """Reference-layout fields derived only from permission-readable claim data."""
    summary = []
    def add(name, label, value, fieldtype="Data", icon="file"):
        summary.append(dict(fieldname=name, label=label, value=value, fieldtype=fieldtype, icon=icon))
    if "employee" in permitted:
        employee = doc.get("employee_name") if "employee_name" in permitted else None
        add("employee", "Employee", employee or doc.get("employee") or "", icon="user")
    if "mode_of_payment" in permitted:
        add("mode_of_payment", "Mode of Payment", doc.get("mode_of_payment") or "", icon="money")
    if "total_claimed_amount" in permitted:
        add("total_claimed_amount", "Claim Amount", doc.get("total_claimed_amount"), "Currency", "money")
    if "expenses" in permitted and "expense_date" in child_fields:
        dates = sorted(cstr(row.get("expense_date")) for row in doc.get("expenses", []) if row.get("expense_date"))
        add("expense_period", "Expense Period", [dates[0], dates[-1]] if dates else [], "Date Range", "calendar")
    if "remark" in permitted:
        purpose = doc.get("remark")
        if not purpose and "expenses" in permitted and "description" in child_fields:
            purpose = "; ".join(dict.fromkeys(strip_html(cstr(row.get("description"))) for row in doc.get("expenses", []) if row.get("description")))
        add("remark", "Purpose", strip_html(cstr(purpose)), icon="file")
    if "total_sanctioned_amount" in permitted and doc.get("total_sanctioned_amount") and doc.get("total_sanctioned_amount") != doc.get("total_claimed_amount"):
        add("total_sanctioned_amount", "Sanctioned Amount", doc.get("total_sanctioned_amount"), "Currency", "money")
    return summary


def _tools(doc, wf, permitted):
    from my_space.review.claim_tools import review_tools
    return review_tools(doc, wf, permitted)


@frappe.whitelist()
def review(doctype, name):
    doc = _document(doctype, name)
    meta = frappe.get_meta(doctype)
    wf_name = frappe.db.get_value("Workflow", {"document_type": doctype, "is_active": 1}, "name")
    wf = frappe.get_cached_doc("Workflow", wf_name) if wf_name else None
    # Scalar-field helpers omit Table fields. Check table permlevels explicitly
    # after the parent document read permission has already been enforced.
    permitted = set(get_permitted_fields(doctype))
    permitted.update(df.fieldname for df in meta.get_table_fields() if frappe.session.user == "Administrator" or not df.permlevel or doc.has_permlevel_access_to(df.fieldname, df, "read"))
    fields = []
    selected = _config().get("display_fields", {}).get(doctype, DEFAULT_FIELDS)
    for fieldname in selected:
        df = meta.get_field(fieldname)
        if df and fieldname in permitted and df.fieldtype in SAFE_TYPES and not df.hidden:
            value = doc.get(fieldname)
            fields.append({"fieldname": fieldname, "label": df.label, "fieldtype": df.fieldtype, "value": strip_html(cstr(value)) if value is not None else ""})
    remark_fields = [dict(fieldname=df.fieldname, label=df.label, fieldtype=df.fieldtype, value=strip_html(cstr(doc.get(df.fieldname)))) for df in meta.fields if df.fieldname in permitted and not df.hidden and df.fieldtype in SAFE_TYPES and (df.fieldname in {"remark", "remarks", "custom_remark", "custom_remarks"} or cstr(df.label).strip().lower() in {"remarks", "purpose"}) and doc.get(df.fieldname)]
    additional_fields = []
    if doctype != "Expense Claim":
        from my_space.review.document_details import header_details
        fields, additional_fields = header_details(doc, meta, permitted, SAFE_TYPES, _config().get("display_fields", {}).get(doctype))
    tables = []
    child_fields = set()
    if doctype == "Expense Claim" and "expenses" in permitted:
        child_meta = frappe.get_meta("Expense Claim Detail")
        child_fields = set(get_permitted_fields(child_meta.name, parenttype=doctype))
        columns = [f for f in ("expense_type", "description", "amount") if f in child_fields]
        tables = [{"label": "Expense Details", "columns": columns, "rows": [{f: strip_html(cstr(row.get(f))) for f in columns} for row in doc.get("expenses", [])], "total": sum(flt(row.get("amount")) for row in doc.get("expenses", [])) if "amount" in columns else None}]
    if doctype != "Expense Claim":
        from my_space.review.document_details import child_tables
        tables = child_tables(doc, meta, SAFE_TYPES)
    from my_space.review.document_events import recorded_events
    from my_space.review.assignment_details import reference_review
    linked_document = reference_review(doc) if doctype == "ToDo" else None
    task_description = None
    if doctype == "ToDo" and "description" in permitted:
        from my_space.review.claim_tools import _draft_editable, _field_writable
        field = meta.get_field("description")
        if field and not field.hidden:
            task_description = dict(value=frappe.utils.sanitize_html(cstr(doc.get("description")), always_sanitize=True), editable=bool(_draft_editable(doc, wf) and _field_writable(doc, field)))
    return {"data": {"linked_document": linked_document, "task_description": task_description, "document_events": recorded_events(doc), "doctype": doc.doctype, "name": doc.name, "owner": doc.owner, "creation": doc.creation, "modified": doc.modified, "state": doc.get(wf.workflow_state_field) if wf and wf.workflow_state_field in permitted else (_state_info(doc, None)[0] if not wf else None), "flow_mode": "workflow" if wf else "standard" if meta.is_submittable else "record", "is_submittable": bool(meta.is_submittable), "business_status": doc.get("status") if "status" in permitted else None, "additional_fields": additional_fields, "remark_fields": remark_fields, "docstatus": cint(doc.docstatus), "fields": fields, "tools": _tools(doc, wf, permitted), "summary_fields": _expense_summary(doc, permitted, child_fields) if doctype == "Expense Claim" and not _config().get("display_fields", {}).get(doctype) else fields, "currency": doc.get("currency") if "currency" in permitted else None, "next_states": sorted({t.next_state for t in _required_transitions(doc, wf)}) if wf else [] if not meta.is_submittable else (["Submitted"] if cint(doc.docstatus) == 0 else ["Cancelled"] if cint(doc.docstatus) == 1 else []), "status_info": _expense_status(doc, wf, permitted) if doctype == "Expense Claim" else None, "status_summary": describe_status(doc, meta, wf, permitted, _expense_status(doc, wf, permitted) if doctype == "Expense Claim" else None), "workflow_notices": _workflow_notices(doc, wf), "can_print": bool(doc.has_permission("print")), "settlement": _claim_settlement(doc, permitted, meta) if doctype == "Expense Claim" else None, "tables": tables, "actions": _actions(doc, wf), "history": _history(doc), "next_roles": _state_info(doc, wf)[3] if wf else [], "activity": frappe.get_all("Comment", filters={"reference_doctype": doc.doctype, "reference_name": doc.name, "comment_type": "Comment"}, fields=["creation", "owner", "comment_by", "content"], order_by="creation desc", limit_page_length=50), "can_complete": doctype == "ToDo" and doc.status == "Open", "attachments": _attachments(doc), "attachments_note": _("Attachments open through Frappe with normal file permissions.")}}


@frappe.whitelist()
def history(doctype, name):
    return {"data": _history(_document(doctype, name))}


@frappe.whitelist()
def transitions(doctype, name):
    return {"data": review(doctype, name)["data"]["actions"]}


@frappe.whitelist(methods=["POST"])
def add_comment(doctype, name, content):
    """Same native read-permission policy, independently of status/actions."""
    doc = _document(doctype, name)
    content = cstr(content).strip()
    if not content:
        frappe.throw(_("Enter a comment before posting"))
    if len(content) > 10000:
        frappe.throw(_("Comments must be 10,000 characters or fewer"))
    from frappe.desk.form.utils import add_comment as native_add_comment
    user = frappe.session.user
    comment = native_add_comment(
        reference_doctype=doc.doctype,
        reference_name=doc.name,
        content="<p>" + escape(content).replace("\n", "<br>") + "</p>",
        comment_email=user,
        comment_by=frappe.get_cached_value("User", user, "full_name") or user,
    )
    return {"data": {"name": comment.name, "creation": comment.creation, "owner": comment.owner, "comment_by": comment.comment_by, "content": comment.content}}


@frappe.whitelist(methods=["POST"])
def act(doctype, name, action, modified, remarks=None):
    remarks = cstr(remarks).strip()
    if len(remarks) > 2000:
        frappe.throw(_("Remarks must be 2,000 characters or fewer"))
    doc = _document(doctype, name)
    # Lock the document for the transaction before comparing the client's version.
    frappe.db.get_value(doctype, name, "modified", for_update=True)
    doc.reload()
    doc.check_permission("read")
    if cstr(doc.modified) != cstr(modified):
        frappe.throw(_("This document changed. Refresh and review it again."), frappe.TimestampMismatchError)
    if action not in transitions(doctype, name)["data"]:
        frappe.throw(_("This action is no longer allowed"), frappe.PermissionError)
    from my_space.review.claim_tools import _workflow
    workflow = _workflow(doc)
    if workflow:
        result = apply_workflow(doc.as_json(), action)
    else:
        # A fresh configuration check and native permission checks are mandatory.
        # Document methods retain all business validations, accounting hooks,
        # linked-document restrictions, and standard Submitted/Cancelled history.
        if action not in _native_actions(doc):
            frappe.throw(_("This standard action is no longer allowed"), frappe.PermissionError)
        doc.check_permission("submit" if action == "Submit" else "cancel")
        result = doc.submit() if action == "Submit" else doc.cancel()
        result.add_comment("Comment", _("FlowTrack: {0}").format(escape(action)) + ("<br>" + escape(remarks) if remarks else ""))
        return {"data": {"name": result.name, "modified": result.modified, "queued": False}}
    # Supported workflow API records its own Workflow comment; add source audit.
    if result is None:
        doc.add_comment("Workflow", _("FlowTrack: queued {0}").format(escape(action)) + ("<br>" + escape(remarks) if remarks else ""))
        return {"data": {"name": doc.name, "modified": doc.modified, "queued": True}}
    result.add_comment("Workflow", _("FlowTrack: {0}").format(escape(action)) + ("<br>" + escape(remarks) if remarks else ""))
    return {"data": {"name": result.name, "modified": result.modified, "queued": False}}


@frappe.whitelist(methods=["POST"])
def update_task_description(name, modified, description):
    from my_space.review.claim_tools import _locked, _field_writable
    doc = _locked("ToDo", name, modified, draft=True)
    if doc.allocated_to != frappe.session.user:
        frappe.throw(_("Assignment is no longer yours"), frappe.PermissionError)
    field = frappe.get_meta("ToDo").get_field("description")
    if not _field_writable(doc, field):
        frappe.throw(_("You cannot edit the assignment description"), frappe.PermissionError)
    description = frappe.utils.sanitize_html(cstr(description), always_sanitize=True)
    if not strip_html(description).strip() and "<img" not in description.lower():
        frappe.throw(_("Assignment Description is required"))
    doc.description = description
    doc.save()
    return {"data": {"name": doc.name, "modified": doc.modified}}


@frappe.whitelist(methods=["POST"])
def complete_task(name, modified):
    doc = _document("ToDo", name)
    frappe.db.get_value("ToDo", name, "modified", for_update=True)
    doc.reload()
    if doc.allocated_to != frappe.session.user:
        frappe.throw(_("Assignment is no longer yours"), frappe.PermissionError)
    if cstr(doc.modified) != cstr(modified) or doc.status != "Open":
        frappe.throw(_("Assignment changed. Refresh and try again."), frappe.TimestampMismatchError)
    if doc.reference_type and doc.reference_name:
        from frappe.desk.form.assign_to import set_status
        frappe.get_doc(doc.reference_type, doc.reference_name).check_permission("read")
        set_status(doc.reference_type, doc.reference_name, todo=doc.name, assign_to=frappe.session.user, status="Closed")
    else:
        doc.check_permission("write")
        doc.status = "Closed"
        doc.save()
    return {"data": {"name": doc.name, "status": "Closed"}}
