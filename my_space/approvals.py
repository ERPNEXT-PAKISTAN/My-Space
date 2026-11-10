"""Minimal website runtime for My Space's native document center."""
from hashlib import sha256
from pathlib import Path

import frappe
from frappe.utils import get_assets_json


def get_assets():
    public = Path(__file__).parent / 'public'
    files = {
        'process_css': 'css/my_space_process.css',
        'process_js': 'js/my_space_process.js',
        'date_ranges_js': 'js/date_ranges.js',
        'welcome_css': 'css/welcomes.css',
        'approvals_css': 'css/my_space_approvals.css',
        'review_css': 'css/my_space_review.css',
        'welcome_js': 'js/welcomes.js',
        'loader_js': 'js/my_space_loader.js',
        'approvals_js': 'js/my_space_approvals.js',
        'review_js': 'js/my_space_review.js',
    }
    result = {key: f'/assets/my_space/{path}?v={sha256((public / path).read_bytes()).hexdigest()[:12]}' for key, path in files.items()}
    result['runtime_js'] = get_assets_json().get('my_space_runtime.bundle.js', '/assets/my_space/dist/js/my_space_runtime.bundle.js')
    return result


@frappe.whitelist()
def get_boot():
    from my_space.review.api import _user
    from frappe.website.utils import get_boot_data
    from frappe.permissions import get_user_permissions

    _user()
    boot = get_boot_data()
    boot['user'] = frappe.get_user().load_user()
    boot['user']['last_selected_values'] = {}
    boot['user_permissions'] = get_user_permissions(frappe.session.user)
    boot['session'] = {'user': frappe.session.user, 'user_fullname': frappe.get_cached_value('User', frappe.session.user, 'full_name')}
    boot['user_roles'] = frappe.get_roles()
    boot['single_types'] = frappe.get_all('DocType', filters={'issingle': 1}, pluck='name')
    return boot
