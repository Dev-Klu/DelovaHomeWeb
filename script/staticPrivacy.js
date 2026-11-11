const path = require('path');

function isPrivateStaticPath(urlPath) {
    const normalized = path.posix.normalize('/' + urlPath.replace(/\\/g, '/')).toLowerCase();
    if (normalized === '/data/locales.json') return false;
    return normalized === '/data' || normalized.startsWith('/data/') ||
        /^\/[^/]+\.json$/.test(normalized) ||
        /\.(?:key|pem|p12|pfx)$/.test(normalized) ||
        normalized === '/server.js' || normalized === '/script/db.js';
}

module.exports = isPrivateStaticPath;
