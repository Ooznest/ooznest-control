# Settings

Settings reads and writes the controller's GRBL/grblHAL configuration. Use the Configuration Wizard for normal machine selection; change individual values only when you understand their effect or have support instructions.

![Live Settings overview](/images/ooznest-control/12-connected-settings-root.png =100%x)

## Finding a setting

Use the search field and the left category tree. Categories include limits, homing, probing, networking, Wi-Fi, spindle and each axis. **Save** remains unavailable until a value has changed.

![Live WorkBee Z2 X-axis values](/images/ooznest-control/13-connected-settings-x-axis.png =100%x)

{.is-warning}
> Values shown in screenshots belong to the captured WorkBee Z2 500 × 500 setup. Do not copy them to another machine.

## Firmware

Open **Settings → Firmware**. Select the firmware that matches the machine, flash it, keep USB connected, select the port if prompted, and wait for the controller to reconnect.

![Firmware Flasher](/images/ooznest-control/14-settings-firmware-flasher.png =75%x)

When the controller reports an older supported firmware build, Ooznest Control may show an update notification. Read the release notes, then choose **Update firmware** only when you are ready to keep the controller connected through the full flash and reconnect process.

![Firmware update available](/images/ooznest-control/45-simulated-firmware-update-available.png =75%x)

*This notification screenshot is a local UI simulation for documentation; its version numbers and release note are examples.*

## Gamepad

Open **Settings → Gamepad** to see whether a controller is detected and choose button actions. This page is available even when no controller is connected; do not assign motion actions until you can test safely.

![Gamepad Settings](/images/ooznest-control/15-settings-gamepad-modal.png =75%x)

## Calibration

Use Calibration only with a measured physical result. The complete safe workflow is on [Axis Calibration](15-calibration.md).

## Backup, restore, refresh and save

**Backup** downloads the current controller settings. Name it with the machine and date. **Restore** overwrites controller settings from the selected backup: only restore a backup from the same machine/profile. **Refresh** discards the on-screen view and reads current settings again. **Save** writes changed values to the controller.

**Wizard** reopens the guided machine-selection workflow. Use it when setting up a new controller or deliberately changing the machine profile; it is not a substitute for editing one known setting. After firmware flashing, restoring a backup or completing the Wizard, use **Refresh** (or reconnect) to confirm that the displayed values are current.
