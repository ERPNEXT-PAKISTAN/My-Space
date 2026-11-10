"""Permission-filtered Business Flow lists owned by My Space."""
import frappe
from frappe import _
from frappe.utils import cint
from frappe.model import get_permitted_fields
from my_space.review.api import _user
from my_space.process_catalog import workflow_catalog
from my_space.date_limits import date_range, date_filters, document_date_field

FIELDS = {
 "Stock Entry": ["stock_entry_type", "posting_date", "from_warehouse", "to_warehouse"],
 "Stock Reconciliation": ["purpose", "posting_date", "set_warehouse", "difference_amount"],
 "BOM": ["item", "quantity", "uom", "total_cost"],
 "Production Plan": ["posting_date", "total_planned_qty", "total_produced_qty"],
 "Work Order": ["production_item", "qty", "produced_qty", "planned_start_date"],
 "Job Card": ["production_item", "operation", "for_quantity", "total_completed_qty"],
 "Employee Checkin": ["employee_name", "time", "log_type"],
 "Attendance": ["employee_name", "attendance_date", "in_time", "out_time"],
 "Employee": ["employee_name", "designation", "department"],
 "Expense Claim": ["employee_name", "posting_date", "total_claimed_amount"],
 "Employee Advance": ["employee_name", "posting_date", "advance_amount"],
 "Payment Entry": ["party", "posting_date", "paid_amount"],
 "Journal Entry": ["posting_date", "voucher_type", "total_debit"],
 "Salary Slip": ["employee_name", "start_date", "net_pay"],
 "Leave Application": ["employee_name", "leave_type", "from_date", "to_date"],
 "Project": ["project_name", "customer", "percent_complete"],
 "Task": ["subject", "project", "priority"],
 "Timesheet": ["employee_name", "start_date", "total_hours"],
}
SAFE = {"Link", "Dynamic Link", "Data", "Select", "Date", "Datetime", "Time", "Check", "Int", "Float", "Currency", "Percent"}

def catalog():
 return {key:value for key,value in workflow_catalog().items() if not value.get("kind")}

def allowed(doctype):
 if doctype not in {step["doctype"] for module in catalog().values() for lane in module["lanes"] for step in lane["steps"]}:
  frappe.throw(_("Unknown process document"), frappe.PermissionError)
 meta = frappe.get_meta(doctype)
 if not frappe.has_permission(doctype, "read"):
  frappe.throw(_("You do not have permission to read this document type"), frappe.PermissionError)
 return meta

@frappe.whitelist()
def get_catalog():
 _user()
 modules=[]
 for key,module in catalog().items():
  lanes=[]
  for lane in module["lanes"]:
   steps=[]
   for step in lane["steps"]:
    dt=step["doctype"]
    if not frappe.db.exists("DocType", dt) or not frappe.has_permission(dt,"read"): continue
    meta=frappe.get_meta(dt)
    if meta.issingle: continue
    steps.append(dict(doctype=dt,label=_(dt),icon=step["icon"]))
   if steps: lanes.append(dict(title=_(lane["title"]),steps=steps))
  if lanes: modules.append(dict(key=key,label=_(key),lanes=lanes))
 return modules

def document_references(doc, permission_cache=None):
 """Collect real upstream links, including item and payment reference rows."""
 from my_space.review.api import _readable_table
 cache = permission_cache if permission_cache is not None else {}
 targets = {step["doctype"] for module in catalog().values() for lane in module["lanes"] for step in lane["steps"]}
 targets.update({"Quotation", "Supplier Quotation", "Request for Quotation"})
 found = set()
 result = []
 def collect(record, meta, permitted):
  for df in meta.fields:
   if df.hidden or df.fieldname not in permitted: continue
   if df.fieldtype == "Link":
    target = df.options
   elif df.fieldtype == "Dynamic Link" and df.options in permitted:
    target = record.get(df.options)
   else: continue
   name = record.get(df.fieldname)
   if not name or target not in targets or (target, name) == (doc.doctype, doc.name): continue
   key = (target, name)
   if key in found: continue
   found.add(key)
   if key not in cache:
    cache[key] = bool(frappe.has_permission(target, "read", doc=name))
   if cache[key]: result.append(dict(doctype=target, label=_(target), name=name))
 meta = frappe.get_meta(doc.doctype)
 collect(doc, meta, set(get_permitted_fields(doc.doctype)))
 for df in meta.get_table_fields():
  if df.hidden or not _readable_table(doc, meta, df.fieldname): continue
  child_meta = frappe.get_meta(df.options)
  permitted = set(get_permitted_fields(df.options, parenttype=doc.doctype))
  for child in doc.get(df.fieldname) or []:
   collect(child, child_meta, permitted)
 return result


@frappe.whitelist()
def get_documents(doctype, start=0, search="", stage="", company="", date_from=None, date_to=None):
 _user()
 meta=allowed(doctype)
 if meta.issingle: frappe.throw(_("This document has no list"))
 if stage not in ("", "0", "1", "2"): frappe.throw(_("Invalid entry status"))
 permitted=set(get_permitted_fields(doctype))
 fields=["name", "docstatus"]
 choices=FIELDS.get(doctype)
 if choices is None:
  choices=[]
  for options in (("customer_name","supplier_name","customer","supplier","employee_name","applicant_name",meta.title_field), ("transaction_date","posting_date","offer_date","report_date","review_date","from_date"), ("grand_total","base","total_payroll_amount","quantity")):
   match=next((f for f in options if f and meta.has_field(f)),None)
   if match: choices.append(match)
  if not choices: choices=[df.fieldname for df in meta.fields if df.in_list_view][:4]
 columns=[]
 for name in choices[:4]:
  df=meta.get_field(name)
  if df and name in permitted and not df.hidden and df.fieldtype in SAFE:
   fields.append(name);columns.append(dict(fieldname=name,label=_(df.label),fieldtype=df.fieldtype))
 if meta.has_field("status") and "status" in permitted: fields.append("status")
 if meta.has_field("currency") and "currency" in permitted: fields.append("currency")
 date_from,date_to=date_range(date_from,date_to)
 filters=date_filters(meta,date_from,date_to)
 if stage and meta.is_submittable: filters.append(["docstatus","=",cint(stage)])
 if company and meta.has_field("company") and "company" in permitted: filters.append(["company","=",company])
 term=str(search or "").strip()[:100]
 or_filters=None
 if term:
  searchable=["name"]+[c["fieldname"] for c in columns if c["fieldtype"] in {"Data","Link","Dynamic Link"}]
  or_filters=[[f,"like","%"+term+"%"] for f in searchable]
 start=max(0,min(cint(start),100000))
 rows=frappe.get_list(doctype,fields=list(dict.fromkeys(fields)),filters=filters,or_filters=or_filters,order_by="modified desc",start=start,page_length=21)
 columns.append(dict(fieldname="references",label=_("References"),fieldtype="References"))
 permission_cache = {}
 for row in rows[:20]:
  doc = frappe.get_doc(doctype, row.name)
  doc.check_permission("read")
  row["references"] = document_references(doc, permission_cache)
 return dict(rows=rows[:20],has_more=len(rows)>20,columns=columns,submittable=bool(meta.is_submittable),date_from=date_from,date_to=date_to,date_field=document_date_field(meta),page_length=20)
