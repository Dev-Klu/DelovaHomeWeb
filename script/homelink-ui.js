/* HomeLink UI helpers shared by dashboard + network pages */
(function () {
    var base = location.pathname.indexOf('/pages/') !== -1 ? '../' : '';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    async function api(url, opts) {
        var res = await fetch(url, opts);
        if (res.status === 401) { var e = new Error('Sessie verlopen, log opnieuw in'); e.auth = true; throw e; }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    }

    function ago(ts) {
        if (!ts) return '–';
        var s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
        if (s < 45) return 'zojuist';
        if (s < 3600) return Math.round(s / 60) + ' min geleden';
        if (s < 86400) return Math.round(s / 3600) + ' u geleden';
        return Math.round(s / 86400) + ' d geleden';
    }

    function countUp(el, to, opts) {
        if (!el) return;
        opts = opts || {};
        var dec = opts.decimals || 0, suffix = opts.suffix || '';
        var from = parseFloat(el.dataset.v || '0') || 0;
        el.dataset.v = to;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) {
            el.textContent = to.toFixed(dec) + suffix; return;
        }
        var t0 = performance.now(), dur = 900;
        (function tick(t) {
            var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
            el.textContent = (from + (to - from) * e).toFixed(dec) + suffix;
            if (p < 1) requestAnimationFrame(tick);
        })(t0);
    }

    function spark(history) {
        var pts = (history || []).map(function (h) { return h.v; });
        var vals = pts.filter(function (v) { return v != null; });
        if (vals.length < 2) return '<svg class="hl-spark" viewBox="0 0 200 44"></svg>';
        var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
        var range = Math.max(1, max - min), w = 200, h = 44, step = w / Math.max(1, pts.length - 1);
        var d = '', first = null, last = null;
        pts.forEach(function (v, i) {
            if (v == null) { d += ' '; first = null; return; }
            var x = (i * step).toFixed(1), y = (h - 6 - ((v - min) / range) * (h - 14)).toFixed(1);
            d += (first === null ? 'M' : 'L') + x + ' ' + y + ' ';
            if (first === null) first = x; last = x;
        });
        var area = d + 'L' + last + ' ' + h + ' L0 ' + h + ' Z';
        return '<svg class="hl-spark" viewBox="0 0 200 44" preserveAspectRatio="none">' +
            '<defs><linearGradient id="sp-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></linearGradient></defs>' +
            '<path class="area" d="' + area + '"/><path class="line" d="' + d + '"/></svg>';
    }

    function stClass(s) { return s === 'online' || s === true ? 'st-ok' : (s === 'offline' || s === false ? 'st-bad' : 'st-unk'); }

    function node(cx, cy, w, name, sub, status, extra) {
        var x = cx - w / 2, y = cy - 31;
        return '<g><rect class="node-card" x="' + x + '" y="' + y + '" width="' + w + '" height="62" rx="16"/>' +
            '<circle class="' + stClass(status) + '" cx="' + (x + w - 16) + '" cy="' + (y + 16) + '" r="4.5"/>' +
            '<text class="t-name" x="' + (x + 16) + '" y="' + (cy - 3) + '">' + esc(name) + '</text>' +
            '<text class="t-mono" x="' + (x + 16) + '" y="' + (cy + 14) + '">' + esc(sub) + '</text>' +
            (extra ? '<text class="t-sub" x="' + (x + 16) + '" y="' + (cy + 27) + '">' + esc(extra) + '</text>' : '') + '</g>';
    }

    function link(d, status) {
        var down = status === 'offline' ? ' down' : '';
        return '<path class="link' + down + '" d="' + d + '"/><path class="flow' + down + '" d="' + d + '"/>';
    }

    function topology(ov) {
        var nets = {};
        (ov.networks || []).forEach(function (n) { nets[n.id] = n; });
        var s = nets.starlink || { name: 'Starlink', cidr: '192.168.10.0/24', status: 'unknown', location: 'Boven', deviceCount: 0 };
        var p = nets.proximus || { name: 'Proximus', cidr: '192.168.0.0/24', status: 'unknown', location: 'Beneden', deviceCount: 0 };
        var ts = ov.tailscale || {};
        var inet = ov.internet || {};
        var tsOnline = ts.installed && ts.online;
        var tsPeers = (ts.peers || []).filter(function (x) { return x.online; }).length;
        var lat = function (n) { return n.latency != null ? n.latency + ' ms' : '—'; };

        var out = '<svg class="hl-topo" viewBox="0 0 760 310" role="img" aria-label="Netwerktopologie">' +
            '<defs><linearGradient id="tp-flow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs>';

        out += link('M170 171 L170 229', s.status);
        out += link('M590 171 L590 229', p.status);
        if (tsOnline) out += '<path class="tail" d="M380 171 L380 229"/>';

        out += '<circle class="ring" cx="380" cy="260" r="40"/><circle class="ring r2" cx="380" cy="260" r="40"/>';

        out += node(380, 40, 150, 'Internet', inet.online == null ? '…' : (inet.online ? lat(inet) : 'offline'), inet.online == null ? 'unknown' : (inet.online ? 'online' : 'offline'));
        out += node(170, 140, 170, s.name, s.cidr, s.status, 'Gateway ' + lat(s));
        out += node(590, 140, 170, p.name, p.cidr, p.status, 'Gateway ' + lat(p));
        out += node(380, 140, 150, 'Tailscale', ts.installed ? (tsPeers + ' nodes online') : 'niet gevonden', tsOnline ? 'online' : (ts.installed ? 'offline' : 'unknown'));
        out += node(170, 260, 170, s.location || 'Boven', s.deviceCount + ' apparaten', s.status);
        out += node(590, 260, 170, p.location || 'Beneden', p.deviceCount + ' apparaten', p.status);

        out += '<g><rect class="node-card" x="315" y="229" width="130" height="62" rx="18" style="stroke:#6366f1"/>' +
            '<image href="' + base + 'img/brand/homelink-mark.svg" x="323" y="237" width="46" height="46"/>' +
            '<text class="t-name" x="374" y="257">HomeLink</text><text class="t-mono" x="374" y="274">hub</text></g>';

        return out + '</svg>';
    }

    window.HL = { base: base, esc: esc, api: api, ago: ago, countUp: countUp, spark: spark, topology: topology };
})();
