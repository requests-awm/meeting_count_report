# Brand assets

Drop your official files here and the dashboard will use them automatically on the
next `npm run preview` (they're embedded into out/report.html as base64, so the file
stays self-contained).

| File | Used for | Notes |
|------|----------|-------|
| `ascot-logo.png` | Header logo | Preferred. Transparent-background PNG of the ASCOT wordmark. |
| `ascot-logo.svg` | Header logo | Used if no PNG. Crisper at any size. |
| `favicon.png`    | Browser tab | Optional square icon. If absent, a navy+gold crown SVG is used. |

Detection order for the logo: `ascot-logo.png` → `ascot-logo.svg` → built-in SVG recreation.

To add the real logo: save the ASCOT image as `assets/ascot-logo.png`, then run
`npm run preview`.
