/* HomeLink boot: theme (dark by default), favicon. Runs in <head>, before first paint. */
(function () {
    var root = document.documentElement;
    var inPages = location.pathname.indexOf('/pages/') !== -1;
    var base = inPages ? '../' : '';

    if (!localStorage.getItem('theme')) localStorage.setItem('theme', 'dark');

    function apply() {
        var dark = localStorage.getItem('theme') === 'dark';
        root.classList.toggle('hl-light', !dark);
        var link = document.getElementById('theme-stylesheet');
        if (link) {
            var want = base + (dark ? 'style/style-dark.css' : 'style/style.css');
            if (link.getAttribute('href') !== want) link.setAttribute('href', want);
        }
        root.style.background = dark ? '#060914' : '#eef1fb';
        root.style.color = dark ? '#e8ecff' : '#0f172a';
    }
    window.hlApplyTheme = apply;
    apply();

    if (!document.querySelector('link[rel="icon"]')) {
        var ic = document.createElement('link');
        ic.rel = 'icon';
        ic.type = 'image/svg+xml';
        ic.href = base + 'img/brand/favicon.svg';
        document.head.appendChild(ic);
    }
    var meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#060914';
    document.head.appendChild(meta);
})();
