"""Personal factory welcome, rendered only for the authenticated session owner."""
from urllib.parse import quote, urlparse
from datetime import timedelta
from math import isfinite

import frappe
from frappe import _
from frappe.utils import now_datetime, get_system_timezone, strip_html, get_datetime
from frappe.rate_limiter import rate_limit
from flow.www.factory_login import sanitize_redirect
from flow.www.factory_assets import get_factory_assets

no_cache = True


def safe_photo(value):
	"""Allow uploaded images and configured HTTPS profile images, never executable URLs."""
	if not isinstance(value, str) or "\\" in value or any(ord(c) < 32 for c in value):
		return ""
	parsed = urlparse(value)
	if parsed.scheme == "https" and parsed.netloc and not parsed.username and not parsed.password:
		return value
	if value.startswith(("/files/", "/private/files/", "/assets/")) and not parsed.netloc:
		return value
	return ""


def get_direct_reports(employee_name):
	"""Read only active direct reports through native Employee and field permissions."""
	if not employee_name or not frappe.has_permission("Employee", "read"):
		return [], False, _("Your account does not have permission to view employee lists.")
	from frappe.model import get_permitted_fields
	permitted = set(get_permitted_fields("Employee"))
	fields = [name for name in ("name", "employee_name", "designation", "department", "company") if name == "name" or name in permitted]
	try:
		rows = frappe.get_list("Employee", filters={"reports_to": employee_name, "status": "Active"}, fields=fields, order_by="name asc", limit_page_length=101)
	except frappe.PermissionError:
		return [], False, _("Your account does not have permission to view employee lists.")
	return rows[:100], len(rows) > 100, _("No active employees reporting to you are visible to your account.")


def get_workspace_modules():
	"""Match Desk's readable DocType navigation, including custom document types."""
	if frappe.session.user == "Guest" or "Desk User" not in frappe.get_roles():
		return []
	from frappe.utils.modules import get_blocked_modules
	user = frappe.get_user()
	readable = set(user.get_can_read())
	blocked = set(get_blocked_modules())
	labels = {"Accounts": _("Accounting"), "HR": _("Human Resources")}
	groups = {}
	for name in sorted(readable):
		info = user.doctype_map.get(name)
		if not info or info.get("istable") or info.get("module") in blocked:
			continue
		if frappe.session.user != "Administrator" and not frappe.has_permission(name, "read"):
			continue
		module = info.get("module") or _("Other")
		group = groups.setdefault(module, {"key": module, "label": labels.get(module, _(module)), "links": []})
		group["links"].append({"doctype": name, "label": _(name), "url": "/desk/" + quote(name.lower().replace(" ", "-"), safe="-"), "is_single": bool(info.get("issingle"))})
	order = {name: index for index, name in enumerate(("Selling", "Buying", "Accounts", "Stock", "Manufacturing", "Projects", "HR", "Payroll", "Support"))}
	for group in groups.values():
		group["links"].sort(key=lambda link: link["label"].casefold())
	return sorted(groups.values(), key=lambda group: (order.get(group["key"], 99), group["label"].casefold()))


def get_welcome_profile():
	"""Read an allowlist of fields for the session user; never accept another identity."""
	if frappe.session.user == "Guest":
		raise frappe.PermissionError
	user_id = frappe.session.user
	user = frappe.db.get_value("User", user_id, ["full_name", "user_image", "email", "user_type"], as_dict=True) or {}
	created = (getattr(frappe.session, "data", {}) or {}).get("creation")
	profile = {
		"name": user.get("full_name") or user_id,
		"username": user_id,
		"email": user.get("email") or user_id,
		"photo": safe_photo(user.get("user_image")),
		"company_name": "",
		"company_logo": "",
		"login_at": get_datetime(created).strftime("%d %b %Y · %H:%M:%S") if created else _("Session time unavailable"),
		"can_checkin": False,
		"requires_location": bool(frappe.db.get_single_value("HR Settings", "allow_geolocation_tracking")) if frappe.db.exists("DocType", "HR Settings") else False,
		"employee": None,
		"direct_reports": [],
		"direct_reports_more": False,
		"direct_reports_status": _("Link an active Employee record to your account to view your direct reports."),
		"direct_reports_url": "",
		"roles": [role for role in frappe.get_roles(user_id) if role not in ("All", "Guest")],
		"shift": None,
		"shift_status": _("No schedule available"),
		"last_checkin": None,
		"attendance_status": _("No check-in/out event recorded"),
		"final_attendance": _("No submitted attendance for today"),
		"final_attendance_url": "",
		"punch_warning": "",
		"approval_count_label": "0",
		"today_first_in": None,
		"today_latest_out": None,
		"quick_actions": [],
		"entry_links": [],
		"workspace_recent": [],
		"work_links": [],
		"modules": [],
		"tasks": [],
		"recent_work": [],
		"approvals": [],
		"my_expense_claims": [],
		"tasks_status": _("No open assignments visible to you."),
	}
	if frappe.db.table_exists("Employee"):
		meta = frappe.get_meta("Employee")
		fields = [field for field in ["name", "employee_name", "designation", "department", "branch", "company", "image", "default_shift", "reports_to", "employment_type"] if field == "name" or meta.has_field(field)]
		emp = frappe.db.get_value("Employee", {"user_id": user_id, "status": "Active"}, fields, as_dict=True)
		if emp:
			profile["employee"] = {field: emp.get(field) or "" for field in fields}
			profile["direct_reports"], profile["direct_reports_more"], profile["direct_reports_status"] = get_direct_reports(emp.name)
			if frappe.has_permission("Employee", "read"):
				profile["direct_reports_url"] = "/desk/employee?reports_to=" + quote(emp.name, safe="") + "&status=Active"
			profile["name"] = emp.get("employee_name") or profile["name"]
			profile["photo"] = profile["photo"] or safe_photo(emp.get("image"))
			profile["company_name"] = emp.get("company") or ""
			if emp.get("company"):
				profile["company_logo"] = safe_photo(frappe.get_cached_value("Company", emp.company, "company_logo"))
			profile["can_checkin"] = frappe.db.table_exists("Employee Checkin")
			if profile["can_checkin"]:
				event = frappe.db.get_value("Employee Checkin", {"employee": emp.name}, ["log_type", "time"], order_by="time desc, creation desc", as_dict=True)
				if event and event.get("time"):
					profile["attendance_status"] = (_("Checked out") if event.log_type == "OUT" else _("Checked in")) + " · " + get_datetime(event.time).strftime("%d %b %Y · %H:%M:%S")
			if profile["can_checkin"]:
				day_start = now_datetime().replace(hour=0, minute=0, second=0, microsecond=0)
				for event_type, key, order in [("IN", "today_first_in", "time asc"), ("OUT", "today_latest_out", "time desc")]:
					value = frappe.db.get_value("Employee Checkin", {"employee": emp.name, "log_type": event_type,
						"time": ["between", [day_start, day_start + timedelta(days=1) - timedelta(microseconds=1)]]},
						"time", order_by=order)
					if value:
						profile[key] = get_datetime(value).strftime("%H:%M:%S")
			if frappe.db.table_exists("Attendance"):
				attendance = frappe.db.get_value("Attendance", {"employee": emp.name, "attendance_date": now_datetime().date(), "docstatus": 1}, ["name", "status"], as_dict=True, order_by="modified desc")
				if attendance:
					profile["final_attendance"] = attendance.status or _("Submitted")
					profile["final_attendance_url"] = "/app/attendance/" + quote(attendance.name, safe="") if frappe.has_permission("Attendance", "read", doc=attendance.name) else ""
				elif profile["today_first_in"]:
					profile["final_attendance"] = _("Pending HR processing")
			if profile["can_checkin"]:
				day_start = now_datetime().replace(hour=0, minute=0, second=0, microsecond=0)
				punches = frappe.get_all("Employee Checkin", filters=[["employee", "=", emp.name], ["time", ">=", day_start], ["time", "<", day_start + timedelta(days=1)]], fields=["log_type"], order_by="time asc, creation asc", limit_page_length=501)
				repeated = sum(previous.log_type == current.log_type == "IN" for previous, current in zip(punches, punches[1:]))
				if repeated:
					profile["punch_warning"] = _("{0} repeated IN event(s) today without an OUT between them. Review your timeline.").format(repeated)
			# Resolve the actual HRMS assignment, including overnight/default shifts.
			try:
				if frappe.db.table_exists("Shift Type"):
					from hrms.hr.doctype.shift_assignment.shift_assignment import get_employee_shift
					now = now_datetime()
					schedule = get_employee_shift(emp.name, now, consider_default_shift=True)
					if schedule:
						start, end = schedule["start_datetime"], schedule["end_datetime"]
						profile["shift"] = {"name": schedule["shift_type"]["name"], "start": start.strftime("%d %b · %H:%M"), "end": end.strftime("%d %b · %H:%M")}
						profile["shift_status"] = _("Within scheduled hours") if start <= now < end else _("Outside scheduled hours")
					elif emp.get("default_shift"):
						profile["shift_status"] = _("No shift timing available for this date")
				if frappe.db.table_exists("Employee Checkin"):
					latest = frappe.db.get_value("Employee Checkin", {"employee": emp.name, "log_type": "IN"}, "time", order_by="time desc")
					if latest:
						profile["last_checkin"] = latest.strftime("%d %b %Y · %H:%M")
			except Exception:
				frappe.logger("factory_login").warning("Welcome schedule unavailable", exc_info=True)
	# Navigation reflects actual read permission, not guessed access from job titles.
	if user.get("user_type") == "System User":
		for doctype, label, path, detail in [
			("Employee Checkin", "Employee Checkin", "/app/employee-checkin", "Employee IN and OUT records"),
			("Task", "Tasks", "/app/task", "Projects and assigned work"),
			("Work Order", "Production", "/app/work-order", "Manufacturing work orders"),
			("Job Card", "Job cards", "/app/job-card", "Shop-floor operations"),
			("Sales Order", "Sales Order", "/app/sales-order", "Customer orders"),
			("Sales Invoice", "Sales Invoice", "/app/sales-invoice", "Customer billing"),
			("Purchase Order", "Purchase Order", "/app/purchase-order", "Supplier orders"),
			("Purchase Receipt", "Purchase Receipt", "/app/purchase-receipt", "Receive purchased goods"),
			("Purchase Invoice", "Purchase Invoice", "/app/purchase-invoice", "Supplier billing"),
			("Stock Entry", "Stock Entry", "/app/stock-entry", "Material receipts, issues and transfers"),
			("Material Request", "Material Request", "/app/material-request", "Request materials"),
			("Delivery Note", "Delivery Note", "/app/delivery-note", "Dispatch goods"),
			("Payment Entry", "Payment Entry", "/app/payment-entry", "Record payments"),
			("Issue", "Support", "/app/issue", "Requests and reported issues"),
		]:
			if frappe.db.table_exists(doctype) and frappe.has_permission(doctype, "read"):
				create_url = ""
				if frappe.has_permission(doctype, "create"):
					create_url = "/my-space-" + path.rsplit("/", 1)[-1] if doctype in ("Sales Order", "Purchase Order", "Sales Invoice", "Purchase Invoice") else path + "/new-" + path.rsplit("/", 1)[-1]
				profile["work_links"].append({"doctype": doctype, "label": _(label), "url": path, "detail": _(detail), "create_url": create_url})
		if frappe.db.table_exists("ToDo") and frappe.has_permission("ToDo", "read"):
			try:
				for task in frappe.get_list("ToDo", filters={"allocated_to": user_id, "status": "Open"}, fields=["name", "description", "priority", "date"], order_by="modified desc", limit_page_length=5):
					profile["tasks"].append({"title": strip_html(task.description or _("Open assignment"))[:180], "priority": task.priority or "", "due": str(task.date) if task.date else "", "url": "/app/todo/" + quote(task.name, safe="")})
			except frappe.PermissionError:
				profile["tasks_status"] = _("Assignments are unavailable for this account.")
	if user.get("user_type") == "System User":
		for doctype, path in [("Sales Order", "sales-order"), ("Purchase Order", "purchase-order"), ("Sales Invoice", "sales-invoice"), ("Purchase Invoice", "purchase-invoice"), ("Stock Entry", "stock-entry")]:
			if frappe.db.table_exists(doctype) and frappe.has_permission(doctype, "read"):
				for row in frappe.get_list(doctype, filters={"owner": user_id, "docstatus": 0}, fields=["name", "modified"], order_by="modified desc", limit_page_length=2):
					profile["recent_work"].append({"title": doctype + " · " + row.name, "url": ("/my-space-" + path + "?name=" + quote(row.name, safe="") if doctype in ("Sales Order", "Purchase Order", "Sales Invoice", "Purchase Invoice") else "/app/" + path + "/" + quote(row.name, safe="")), "modified": str(row.modified)})
		if frappe.db.table_exists("Workflow Action") and frappe.has_permission("Workflow Action", "read"):
			for row in frappe.get_list("Workflow Action", filters={"status": "Open"}, fields=["name", "reference_doctype", "reference_name"], order_by="modified desc", limit_page_length=5):
				if frappe.has_permission(row.reference_doctype, "read", doc=row.reference_name):
					profile["approvals"].append({"title": row.reference_doctype + " · " + row.reference_name, "url": "/app/workflow-action/" + quote(row.name, safe="")})
		profile["expense_approvals"], profile["my_expense_claims"] = get_expense_claim_rows(user_id)
	profile["approval_count_label"] = "5+" if len(profile["approvals"]) >= 5 else str(len(profile["approvals"]))
	profile["entry_links"] = [link for link in profile["work_links"] if link["doctype"] in ("Sales Order", "Purchase Order", "Sales Invoice", "Purchase Invoice") and link["create_url"]]
	preferred_actions = ["Sales Order", "Purchase Order", "Sales Invoice", "Purchase Invoice", "Stock Entry", "Task"]
	profile["quick_actions"] = [link for label in preferred_actions for link in profile["work_links"] if link["doctype"] == label][:6]
	profile["workspace_recent"] = sorted(profile["recent_work"], key=lambda item: item["modified"], reverse=True)[:6]
	profile["modules"] = get_workspace_modules()
	profile["initials"] = "".join(part[0] for part in profile["name"].split()[:2]).upper()
	return profile


def get_expense_claim_rows(user_id):
	"""Return only readable claims and workflow actions available to this user."""
	if not frappe.db.table_exists("Expense Claim") or not frappe.has_permission("Expense Claim", "read"):
		return [], []
	from frappe.model.workflow import get_transitions, get_workflow

	claims, actionable = [], []
	meta = frappe.get_meta("Expense Claim")
	fields = ["name", "docstatus"] + [field for field in ["employee_name", "employee", "company", "remark", "posting_date", "total_claimed_amount", "currency", "workflow_state", "status", "owner", "modified"] if meta.has_field(field)]
	try:
		for row in frappe.get_list("Expense Claim", fields=fields, order_by="modified desc", limit_page_length=100):
			item = {field: row.get(field) for field in fields}
			item["url"] = "/app/expense-claim/" + quote(row.name, safe="")
			item["remark"] = strip_html(item.get("remark") or "")[:180]
			if row.owner == user_id and len(claims) < 20:
				claims.append(item)
			try:
				if row.docstatus == 0:
					doc = frappe.get_doc("Expense Claim", row.name)
					transitions = get_transitions(doc, get_workflow(doc.doctype))
				else:
					transitions = []
			except Exception:
				transitions = []
			if transitions:
				item["actions"] = []
				for transition in transitions:
					next_state = next((state for state in get_workflow(doc.doctype).states if state.state == transition.next_state), None)
					decision = get_expense_claim_decision(transition, next_state)
					if decision:
						item["actions"].append({"action": transition.action, "approval_status": decision})
				item["actions"].sort(key=lambda action: action["action"])
				if item["actions"]:
					actionable.append(item)
	except frappe.PermissionError:
		return [], []
	return actionable[:50], claims


def get_expense_claim_decision(transition, next_state):
	"""Map a workflow action/target state to HRMS's approval_status options."""
	if not transition or not next_state:
		return None
	action_name = (transition.action or "").casefold()
	state_name = (next_state.state or "").casefold()
	if "reject" in action_name or "reject" in state_name:
		return "Rejected"
	if "approv" in action_name or "approv" in state_name:
		return "Approved"
	if int(next_state.doc_status or 0) == 1:
		return "Approved"
	return None


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=30, seconds=60)
def apply_expense_claim_action(claim_name=None, action=None, approval_status=None):
	"""Apply a configured Expense Claim workflow transition for the current user."""
	if frappe.session.user == "Guest":
		raise frappe.PermissionError
	if not claim_name or not action or not frappe.db.exists("Expense Claim", claim_name):
		frappe.throw(_("Choose an Expense Claim and an available action."))
	from frappe.model.workflow import apply_workflow, get_transitions, get_workflow
	doc = frappe.get_doc("Expense Claim", claim_name)
	workflow = get_workflow("Expense Claim")
	transitions = get_transitions(doc, workflow)
	transition = next((item for item in transitions if item.action == action), None)
	if not transition:
		frappe.throw(_("This action is no longer available for the claim."))
	next_state = next(state for state in workflow.states if state.state == transition.next_state)
	decision = get_expense_claim_decision(transition, next_state)
	if approval_status not in ("Approved", "Rejected") or approval_status != decision:
		frappe.throw(_("Choose the available Approve or Reject action."))
	# apply_workflow reloads the document from the database; persist HRMS's selection first.
	frappe.db.set_value("Expense Claim", claim_name, "approval_status", approval_status, update_modified=False)
	apply_workflow({"doctype": "Expense Claim", "name": claim_name}, action)
	return {"message": _("{0} applied to Expense Claim {1}.").format(action, claim_name)}


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/factory-login?redirect-to=" + quote(sanitize_redirect(frappe.local.request.args.get("redirect-to")), safe="")
		raise frappe.Redirect
	context.supervisor_label = _("Marcus, your welcome guide")
	context.supervisor_controls = "welcome-tabs"
	context.no_header = True
	context.factory_assets = get_factory_assets()
	from my_space.approvals import get_assets
	context.my_space_assets = get_assets()
	context.my_space_today = frappe.utils.nowdate()
	from frappe.utils import get_build_version
	context.my_space_build_version = get_build_version()
	context.title = _("Your Factory Welcome")
	context.profile = get_welcome_profile()
	context.plant_timezone = get_system_timezone() or "UTC"
	context.company = (context.profile["employee"] or {}).get("company") or frappe.db.get_single_value("Global Defaults", "default_company") or _("Factory Operations")
	context.redirect_to = sanitize_redirect(frappe.local.request.args.get("redirect-to"))
	context.csrf_token = frappe.sessions.get_csrf_token()
	theme = frappe.defaults.get_user_default("flow_theme")
	context.flow_theme = theme if theme in ("light", "dark") else "light"
	palette = frappe.defaults.get_user_default("flow_palette")
	context.flow_palette = palette if palette in ("default", "blue", "ocean", "spring", "pastel", "violet", "sunset") else "default"
	return context


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=30, seconds=60)
def mark_employee_checkin(latitude=None, longitude=None, log_type="IN", preview=False):
	"""Explicit self check-in: identity and timestamp always come from the server."""
	if frappe.session.user == "Guest":
		raise frappe.PermissionError
	if not frappe.db.table_exists("Employee Checkin"):
		frappe.throw(_("Attendance is not configured on this site."))
	# Serialise simultaneous clicks for this employee, including across tabs.
	emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, "name", for_update=True)
	if not emp:
		frappe.throw(_("No active employee is linked to your account."))
	now = now_datetime()
	if log_type not in ("IN", "OUT"):
		frappe.throw(_("Choose check-in or check-out."))
	coordinates = {}
	if latitude is not None or longitude is not None:
		try:
			lat, lon = float(latitude), float(longitude)
			if not (isfinite(lat) and isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
				raise ValueError
		except (TypeError, ValueError):
			frappe.throw(_("Please allow a valid browser location before checking in."))
		coordinates = {"latitude": lat, "longitude": lon}
	branch = frappe.get_cached_value("Employee", emp, "branch") or _("Branch not assigned")
	doc = frappe.get_doc({"device_id": branch, **coordinates, "doctype": "Employee Checkin", "employee": emp, "time": now, "log_type": log_type})
	if preview is True or preview in ("true", "1", 1):
		doc.fetch_shift()
		doc.validate_distance_from_shift_location()
		return {"ready": True, "message": _("Location rules passed for your current shift. No attendance record created.")}
	# Each deliberate submission creates an event; retain HRMS timestamp validation.
	# HRMS validation resolves the actual shift and applies its normal validations.
	doc.insert(ignore_permissions=True)
	return {"created": True, "log_type": log_type, "message": (_("Check-out recorded · {0}") if log_type == "OUT" else _("Check-in recorded · {0}")).format(branch), "timestamp": now.strftime("%d %b %Y · %H:%M:%S")}


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=30, seconds=60)
def get_today_checkins():
	"""Only the session employee's events, using the site's current calendar day."""
	if frappe.session.user == "Guest":
		raise frappe.PermissionError
	if not frappe.db.table_exists("Employee Checkin"):
		return {"events": [], "date": "", "truncated": False}
	emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, "name")
	if not emp:
		frappe.throw(_("No active employee is linked to your account."))
	start = now_datetime().replace(hour=0, minute=0, second=0, microsecond=0)
	rows = frappe.get_all("Employee Checkin", filters=[["employee", "=", emp], ["time", ">=", start], ["time", "<", start + timedelta(days=1)]],
		fields=["log_type", "time", "device_id", "latitude", "longitude"],
		order_by="time desc, creation desc", limit_page_length=501)
	# Exclude future dates without an inclusive midnight boundary.
	rows = [row for row in rows if get_datetime(row.time) < start + timedelta(days=1)]
	return {"date": start.strftime("%d %b %Y"), "truncated": len(rows) > 500,
		"events": [{"log_type": row.log_type or _("Unspecified"), "time": get_datetime(row.time).strftime("%H:%M:%S"),
		"device_id": row.device_id or "", "latitude": row.latitude, "longitude": row.longitude} for row in rows[:500]]}
