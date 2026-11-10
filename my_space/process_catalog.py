"""Business Flow catalog owned by My Space."""


def workflow_catalog():
	return {
		"Overview": {"color": "#4f46e5", "kind": "overview", "lanes": []},
		"My Workspace": {"color": "#c4975d", "kind": "workspace", "lanes": []},
		"Selling": {"color": "#4f46e5", "lanes": [{"title": "Order to Cash", "steps": [
			{"doctype": "Quotation", "icon": "📝"}, {"doctype": "Sales Order", "icon": "🧾"}, {"doctype": "Delivery Note", "icon": "🚚"}, {"doctype": "Sales Invoice", "icon": "💳"}, {"doctype": "Payment Entry", "icon": "💰"}]}]},
		"Buying": {"color": "#0ea5e9", "lanes": [{"title": "Procure to Pay", "steps": [
			{"doctype": "Material Request", "icon": "📋"}, {"doctype": "Request for Quotation", "icon": "✉️"}, {"doctype": "Supplier Quotation", "icon": "📨"}, {"doctype": "Purchase Order", "icon": "🛒"}, {"doctype": "Purchase Receipt", "icon": "📦"}, {"doctype": "Purchase Invoice", "icon": "🧮"}, {"doctype": "Payment Entry", "icon": "💰"}]}]},
		"Stock": {"color": "#f59e0b", "lanes": [{"title": "Inventory Movement", "steps": [
			{"doctype": "Material Request", "icon": "📋"}, {"doctype": "Stock Entry", "icon": "🔁"}, {"doctype": "Delivery Note", "icon": "🚚"}, {"doctype": "Purchase Receipt", "icon": "📦"}, {"doctype": "Stock Reconciliation", "icon": "⚖️"}]}]},
		"Manufacturing": {"color": "#ef4444", "lanes": [{"title": "Plan to Produce", "steps": [
			{"doctype": "BOM", "icon": "🧩"}, {"doctype": "Production Plan", "icon": "🗓️"}, {"doctype": "Work Order", "icon": "🏭"}, {"doctype": "Job Card", "icon": "🛠️"}, {"doctype": "Stock Entry", "icon": "🔁"}]}]},
		"Quality": {"color": "#14b8a6", "lanes": [{"title": "Quality Loop", "steps": [
			{"doctype": "Quality Inspection", "icon": "🔍"}, {"doctype": "Non Conformance", "icon": "⚠️"}, {"doctype": "Quality Action", "icon": "✅"}, {"doctype": "Quality Review", "icon": "📊"}]}]},
		"HR": {"color": "#ec4899", "lanes": [{"title": "Hire to Retire", "steps": [
			{"doctype": "Job Opening", "icon": "📢"}, {"doctype": "Job Applicant", "icon": "🙋"}, {"doctype": "Job Offer", "icon": "🤝"}, {"doctype": "Employee", "icon": "👤"}, {"doctype": "Employee Checkin", "icon": "📍"}, {"doctype": "Attendance", "icon": "🕒"}, {"doctype": "Leave Application", "icon": "🌴"}]}]},
		"Expenses": {"color": "#f97316", "lanes": [{"title": "Employee Expenses and Advances", "steps": [
			{"doctype": "Expense Claim", "icon": "🧾"}, {"doctype": "Expense Claim Type", "icon": "🏷️"}, {"doctype": "Employee Advance", "icon": "💸"}]}]},
		"Project": {"color": "#0891b2", "lanes": [{"title": "Plan, Track and Bill Projects", "steps": [
			{"doctype": "Project", "icon": "📁"}, {"doctype": "Task", "icon": "✅"}, {"doctype": "Timesheet", "icon": "⏱️"}, {"doctype": "Project Template", "icon": "📋"}]}]},
		"Payroll": {"color": "#8b5cf6", "lanes": [{"title": "Salary Cycle", "steps": [
			{"doctype": "Salary Structure", "icon": "🏷️"}, {"doctype": "Salary Structure Assignment", "icon": "📎"}, {"doctype": "Payroll Entry", "icon": "🗂️"}, {"doctype": "Salary Slip", "icon": "💵"}, {"doctype": "Journal Entry", "icon": "📒"}]}]},
		"Accounts": {"color": "#10b981", "lanes": [{"title": "Record to Report", "steps": [
			{"doctype": "Journal Entry", "icon": "📒"}, {"doctype": "Sales Invoice", "icon": "💳"}, {"doctype": "Purchase Invoice", "icon": "🧮"}, {"doctype": "Payment Entry", "icon": "💰"}, {"doctype": "Bank Reconciliation Tool", "icon": "🏦"}]}]},
		"Dashboards": {"color": "#0d9488", "kind": "dashboards", "lanes": []},
		"Reports": {"color": "#64748b", "kind": "reports", "lanes": []},
	}
