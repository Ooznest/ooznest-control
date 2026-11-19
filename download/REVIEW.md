# Download page redesign review

## References inspected

- https://ooznest.co.uk/ — desktop header, photographic hero, product cards, section hierarchy and typography.
- https://ooznest.co.uk/workbee-z1-cnc-router-machine/ — desktop and mobile hero, below-fold story, asymmetric corners, image/text sections.
- https://ooznest.co.uk/product-category/system-control/ — mobile category navigation and inset product cards.
- https://ooznest.co.uk/product/black-1500x1500mm-workbee-z1-cnc-router-machine-ethernet-uk-power/ — desktop product layout and below-fold information panels.
- https://ooznest.co.uk/contact-us/ — support cards, background pattern, heading and button styles.
- https://ooznest.co.uk/my-account/ — supporting form layout, illustration and footer.

Inspected the rendered styles and exported the live theme app.min.css. Source uses Nunito headings/buttons, Roboto body, #004c5b dark teal, #449d9f mid teal, #ff6600 orange, #ff8533 buttons, #ebefef backgrounds, 8px buttons and rounded/asymmetric outer panels. The software page adapts the header links to useful software destinations without basket, VAT or shipping controls. Dark text on orange buttons improves readability over the reference's white text.

## Asset provenance

- ooznest.svg: https://ooznest.co.uk/wp-content/uploads/2026/06/logo-without-space.svg
- workbee.webp: https://ooznest.co.uk/wp-content/uploads/2026/10/workbee-hero-machine-768x577.webp
- extrusion-pattern.webp: https://ooznest.co.uk/wp-content/uploads/2025/12/Group-255.png (server supplies WebP).
- Software screenshots are copied from docs/application-guide/screenshots into download/ for publishing. They are documentation captures, not new captures of this checkout. WorkBee photography comes from the current Z1+ marketing page and is captioned as general WorkBee imagery rather than a Z2 product photograph.

## Capability checks

- js/features/config-wizard.js: machine configuration workflow.
- js/machine/jogging.js: jogging and step controls.
- js/machine/probe.js: probing routines and connection safety checks.
- js/viewer/gcode-draw.js: G-code visualization.
- js/features/job-control.js: streaming and start/pause/stop.
- js/machine/connection-manager.js: desktop USB/network paths and browser WebSerial.
- package.json: Windows EXE, Mac DMG x64/arm64, Linux AppImage.

## Verification

- Local preview: http://127.0.0.1:4177/download/ (loopback-only, page/vendor/documentation screenshot directories).
- Inspected desktop and 390px mobile layouts, navigation, download section, secondary-installation disclosure, getting-started section and screenshots. No horizontal overflow detected; all eight image elements loaded at final review.
- Live release lookup resolved v1.0.203 and Windows, Intel Mac, Apple Silicon Mac and Linux AppImage links.
- node --test tests/direct-download.test.cjs tests/download-page.test.cjs: 8 passing tests. Covers all four direct route selections, manual fallback, Mac architecture selection, absent/untrusted packages, invalid release metadata and failure/retry recovery.
- git diff --check passed.
- Browser-level forced network failure inspection was interrupted by the browser tooling. Failure/retry behavior was verified in the automated DOM harness instead.
- Installer binaries were not downloaded or installed. No CNC hardware operations were performed. Physical mobile devices and Safari were not checked.

Comparison screenshots are outside the repository at C:/Users/User/.codex/visualizations/2026/11/19/01a1f5c4-3215-78c1-a22e-435dda307fe2/: download-desktop.jpg, download-mobile.jpg, download-preview.jpg, reference-workbee.jpg.

Scope excludes the existing machine/configuration changes, goal document and direct-download test file.

Follow-up corrections: replaced the text-glyph navigation arrows with the original Ooznest submenu-arrow.svg (16 × 12px, flex-centred), matched the reference's Roboto navigation type, removed hero rotation, and visually checked the actual machine-selection wizard screenshot before replacing the mislabeled gamepad capture. Rechecked at 1085px and 390px with no horizontal overflow.
