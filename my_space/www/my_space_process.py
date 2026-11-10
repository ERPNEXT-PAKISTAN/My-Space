import frappe

no_cache = True

def get_context(context):
    frappe.local.flags.redirect_location = "/welcomes#process"
    raise frappe.Redirect
