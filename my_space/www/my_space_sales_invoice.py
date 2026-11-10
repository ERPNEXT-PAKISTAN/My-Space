from my_space.entry import page_context

no_cache = True

def get_context(context):
    return page_context(context, "sales-invoice")
