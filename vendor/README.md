# Included third-party code

- **Acorn 8.15.0**: https://github.com/acornjs/acorn (MIT, `acorn.LICENSE`).
  Downloaded from https://registry.npmjs.org/acorn/-/acorn-8.15.0.tgz and verified against the registry SHA-512 integrity:
  `sha512-NZyJarBfL7nWwIq+FDL6Zp/yHEhePMNnnJ0y3qfieCrmNvYct8uvtiV41UvlSe6apAfk0fY1FbWx+NwfmpvtTg==`.
  `acorn.js` contains the original `dist/acorn.js` inside a local CommonJS wrapper. It exports to the temporary `window.__xrAntiDebugAcorn` namespace rather than using page AMD/CommonJS globals or overwriting `window.acorn`. `anti-debug.js` captures and removes that temporary export.
- **Anti Anti Debug 1.0.7**: https://github.com/Andrews54757/Anti-Anti-Debug (Unlicense, `anti-anti-debug.LICENSE`). Its console filtering and dynamic constructor interception informed `anti-debug.js`; the implementation uses parsed statements, safe fallback and independent site configuration. Original icons are not included.

These files ship locally. No runtime dependency fetch or build step is required.
