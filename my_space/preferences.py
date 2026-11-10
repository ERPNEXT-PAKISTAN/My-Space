"""My Space user preferences and safe local navigation."""
from urllib.parse import unquote, urlparse
import frappe
from frappe import _


def sanitize_redirect(redirect):
    if not isinstance(redirect, str):
        return '/desk'
    decoded = unquote(redirect)
    if not decoded.startswith('/') or decoded.startswith('//') or chr(92) in decoded or any(ord(char) < 32 for char in decoded):
        return '/desk'
    parsed = urlparse(decoded)
    if parsed.scheme or parsed.netloc:
        return '/desk'
    return redirect


def get_theme():
    theme = frappe.defaults.get_user_default('my_space_theme') or frappe.defaults.get_user_default('flow_theme')
    return theme if theme in ('light', 'dark') else 'light'


@frappe.whitelist(methods=['POST'])
def set_theme(theme):
    if frappe.session.user == 'Guest':
        raise frappe.PermissionError
    if theme not in ('light', 'dark'):
        frappe.throw(_('Choose Light or Dark mode.'))
    frappe.defaults.set_user_default('my_space_theme', theme)
    return {'theme': theme}
