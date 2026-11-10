"""Version My Space-owned shared visual assets by content."""
from hashlib import sha256
from pathlib import Path


def get_shared_assets():
    public = Path(__file__).parent / 'public'
    files = {'login_css':'css/welcome_base.css', 'welcome_css':'css/welcome_layout.css', 'theme_css':'css/welcome_theme.css'}
    return {key: '/assets/my_space/' + name + '?v=' + sha256((public / name).read_bytes()).hexdigest()[:16] for key, name in files.items()}
