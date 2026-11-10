"""Standalone packaging regressions; no site/database is required."""
import ast
import unittest
from pathlib import Path

from my_space import hooks
from my_space.preferences import sanitize_redirect
from my_space.site_assets import get_shared_assets

ROOT = Path(__file__).resolve().parents[1]


class StandaloneTests(unittest.TestCase):
    def test_only_erpnext_is_required(self):
        self.assertEqual(hooks.required_apps, ['erpnext'])

    def test_no_external_flow_imports_or_assets(self):
        for path in ROOT.rglob('*'):
            if not path.is_file() or 'dist' in path.parts or path.suffix not in {'.py', '.html', '.js', '.css'}:
                continue
            if path == Path(__file__):
                continue
            text = path.read_text()
            if path.suffix == '.py':
                tree = ast.parse(text)
                for node in ast.walk(tree):
                    names = ([node.module or ''] if isinstance(node, ast.ImportFrom) else
                             [alias.name for alias in node.names] if isinstance(node, ast.Import) else [])
                    self.assertFalse(any(name == 'flow' or name.startswith('flow.') for name in names), str(path))
            self.assertNotIn('/assets/flow/', text, str(path))
            self.assertNotIn('/api/method/flow.', text, str(path))

    def test_shared_assets_are_bundled_locally(self):
        assets = get_shared_assets()
        self.assertEqual(set(assets), {'login_css', 'welcome_css', 'theme_css'})
        for url in assets.values():
            self.assertTrue(url.startswith('/assets/my_space/'))
            self.assertRegex(url, r'\?v=[0-9a-f]{16}$')
            relative = url.split('/assets/my_space/', 1)[1].split('?')[0]
            self.assertTrue((ROOT / 'public' / relative).is_file())
        self.assertTrue((ROOT / 'templates/includes/my_space_supervisor.html').is_file())

    def test_redirects_stay_local(self):
        for bad in [None, 'https://example.com', '//example.com', '/\\example.com', '/%2fexample.com', '/bad\npath']:
            self.assertEqual(sanitize_redirect(bad), '/desk')
        for good in ['/desk', '/welcomes', '/my-space-sales-order?name=DEMO-1']:
            self.assertEqual(sanitize_redirect(good), good)


if __name__ == '__main__':
    unittest.main()
