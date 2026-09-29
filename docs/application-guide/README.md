# Ooznest Control Application Guide

Open `index.html` for the guide home. The guide is now split into short pages:

- `first-job.html` — connection, homing, work zero, preview and Run Job.
- `machine-controls.html` — units, WCS, DRO, zeroing, jogging and preview.
- `workspace-tabs.html` — Editor, Probe, Macros, SD Card, Tools and Console.
- `service-features.html` — Settings, diagnostics, calibration, configuration, firmware and gamepad.
- Feature pages contain their own contextual modal sections: connection, Endmill, Edit Macro, Tool Change, Calibration, Configuration, Firmware and Gamepad.
- `screenshots.html` — 69 captured full views, modal captures and close crops.

The screenshots were captured from a temporary local browser profile with demo macros and SD-card listing data. They are UI references, not safe machine settings. Connected Idle, real coordinates, probe execution, complete calibration, verified WorkBee Z2 firmware progress and the Electron USB picker still need the controller capture tomorrow.

The capture script is `capture-screenshots.js`. It uses a local Chrome DevTools endpoint and supports `CAPTURE_ENDPOINT` and `CAPTURE_URL` environment variables for local verification.
