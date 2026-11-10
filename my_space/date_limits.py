"""Shared, server-enforced limits for document lists and reporting."""
import frappe
from frappe import _
from frappe.utils import getdate, nowdate, add_days
from frappe.model import get_permitted_fields


def date_range(date_from=None, date_to=None):
    try:
        end = getdate(date_to or nowdate())
        start = getdate(date_from or end)
    except (ValueError, TypeError):
        frappe.throw(_('Enter valid From and To dates.'))
    if start > end:
        frappe.throw(_('From date must be on or before To date.'))
    if (end - start).days >= 366:
        frappe.throw(_('Choose a date range of 366 days or fewer.'))
    return str(start), str(end)


def document_date_field(meta):
    permitted = set(get_permitted_fields(meta.name))
    return next((name for name in ('time', 'transaction_date', 'posting_date', 'attendance_date', 'from_date', 'report_date', 'start_date')
                 if name in permitted and meta.get_field(name) and meta.get_field(name).fieldtype in {'Date', 'Datetime'}), 'creation')


def date_filters(meta, date_from=None, date_to=None, field=None):
    start, end = date_range(date_from, date_to)
    field = field or document_date_field(meta)
    return [[field, '>=', start], [field, '<', str(add_days(end, 1))]]
