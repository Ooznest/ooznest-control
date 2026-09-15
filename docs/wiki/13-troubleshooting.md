# Troubleshooting

Make the machine safe first. Record the exact code and message before clearing, resetting, changing wiring or changing a setting. A reset clears state; it does not repair the cause.

> This reference is based on the connected controller's `$EA` / `$EE` definitions. If the controller shows different text, include that exact text in the support ticket.

## Diagnostic tabs

![Troubleshooting signals](/images/ooznest-control/20-connected-troubleshooting-overview.png =100%x)

- **Signals** — live limit, probe and controller input state.
- **Power Supply** — controller supply checks; isolate mains before inspecting wiring.
- **Spindles** — spindle diagnostic status. Do not test a spindle unless the machine is safe.
- **RGB LED** — controller LED diagnostics.
- **Info** — application, firmware, configuration and connection details.

![Power Supply checks](/images/ooznest-control/21-connected-troubleshooting-power.png =100%x)

![Spindle checks](/images/ooznest-control/22-connected-troubleshooting-spindles.png =100%x)

![RGB LED checks](/images/ooznest-control/23-connected-troubleshooting-rgb-led.png =100%x)

![Configured controller information](/images/ooznest-control/32-connected-troubleshooting-info-configured.png =100%x)

## Export troubleshooting information

For an Ooznest Control support ticket choose **Export Troubleshooting Information** on **Info** and attach the generated file. Include what happened, exact code/message, app version, connection method, machine configuration and repeatable steps.

Review the export before sharing: it can contain configuration and network identifiers. Redact Wi-Fi credentials, customer data and unrelated job names. The Console `$I+` capture also contains a board MAC address—blur it in Photoshop before publication.

## Alarms

An alarm stops the controller because continuing may be unsafe. Do not clear it until the physical cause is understood. For hard limit, reset-in-motion, E-stop and motor fault, position is normally untrustworthy: resolve the cause, reset and home.

![Real Alarm 8: pull-off did not clear limit](/images/ooznest-control/41-real-alarm-8-homing-pull-off.png =100%x)

| Code | Meaning | Fix |
| --- | --- | --- |
| 1 | Hard limit; position likely lost. | Inspect switch/wiring, remove cause, reset and home. |
| 2 | Soft limit; position retained. | Correct work zero, program target or travel settings; unlock only when clear. |
| 3 | Reset/E-stop while moving; position likely lost. | Release/resolve cause, inspect, reset and home. |
| 4 | Probe initial state is wrong. | Test probe, plate, clip and cable; ensure expected open/closed state. |
| 5 | Probe did not contact in programmed travel. | Check contact, direction and distance; reposition and probe-test. |
| 6 | Homing was reset. | Remove reset cause and home again. |
| 7 | Safety door opened during homing. | Close/secure door and its switch; home again. |
| 8 | Pull-off did not release limit. | Check stuck switch/wiring; review pull-off distance. |
| 9 | Homing did not find limit. | Check the correct switch/wiring; review travel and pull-off. |
| 10 | E-stop asserted. | Release physical E-stop, investigate, reset and home if interrupted. |
| 11 | Homing required. | Run `$H` / Home all before normal motion. |
| 12 | Limit switch engaged. | Clear the physical limit safely; inspect switch before continuing. |
| 13 | Probe protection triggered. | Remove cause, check probe wiring/state, then clear. |
| 14 | Spindle speed timeout. | Inspect spindle/VFD, run signal and speed feedback; do not bypass. |
| 15 | Auto-square second switch not found. | Check second switch/wiring and gantry; review travel/pull-off. |
| 16 | Power-on self-test failed. | Power down safely, inspect hardware and contact support with an export. |
| 17 | Motor fault. | Isolate power; inspect driver/motor wiring and fault indication. |
| 18 | Homing configuration invalid. | Review homing/axis/limit settings or restore correct profile. |
| 19 | Modbus timeout/message error. | Check device power, RS-485 wiring, address and settings. |
| 20 | I/O expander communication failed. | Power down and inspect expander supply/bus wiring. |
| 21 | Non-volatile storage failure. | Stop changing settings; export diagnostics and contact support. |
| 22 | Buffer overflow. | Reset, reduce sender load and export if it repeats. |

## Errors

An error rejects a command or G-code line. Correct the program, setup or controller condition before running again.

![Simulated Error 20: invalid G-code command](/images/ooznest-control/64-simulated-error-20.png =100%x)

*This Error 20 screenshot is a local UI simulation used only for documentation; it did not change the connected controller state.*

### Command, setting and motion

| Code | Meaning | Fix |
| --- | --- | --- |
| 0 | No message supplied. | Record surrounding Console output and export diagnostics. |
| 1 | G-code letter missing. | Correct malformed line. |
| 2 | Missing/invalid numeric value. | Correct the number format/value. |
| 3 | Unsupported `$` command. | Use a supported controller command. |
| 4 | Negative value where positive required. | Enter a valid positive value. |
| 5 | Homing not configured. | Configure homing before homing. |
| 6 | Step pulse below 2 µs. | Set pulse time to at least 2 µs. |
| 7 | Setting read failed/restored. | Re-check profile/settings; export if repeated. |
| 8 | `$` command while not IDLE. | Wait for IDLE, then retry. |
| 9 | G-code locked during alarm/jog. | Resolve underlying alarm or stop jog; do not clear blindly. |
| 10 | Soft limits need homing. | Enable/configure homing first. |
| 11 | Line too long. | Shorten/split line; correct sender/post. |
| 12 | Setting exceeds step-rate capability. | Use values within controller/driver limits. |
| 13 | Safety door opened. | Close/secure door and switch; recover safely. |
| 14 | Build/startup line too long. | Shorten stored line. |
| 15 | Jog target exceeds travel. | Check position, distance and direction. |
| 16 | Invalid jog command. | Use valid jog syntax only. |
| 17 | Laser mode needs PWM. | Configure PWM output or disable laser mode. |
| 18 | Reset asserted. | Find reset cause; home if motion stopped. |
| 19 | Non-positive value. | Supply value above zero. |
| 39 | Value out of range. | Use a permitted value. |
| 43 | Maximum feed exceeded. | Reduce program/settings feed. |
| 44 | RPM out of range. | Use supported spindle RPM. |
| 45 | Limit switch engaged. | Clear physical limit and home/recover safely. |
| 46 | Home machine to continue. | Run homing. |
| 49 | Self-test failed. | Safe hard reset; export if repeated. |
| 50 | Emergency stop active. | Release E-stop and resolve cause before reset. |
| 51 | Motor fault. | Isolate power and investigate drive/motor. |
| 52 | Setting out of range. | Enter permitted setting value. |
| 53 | Setting unavailable. | Check driver/firmware support and profile. |

### G-code, geometry and tooling

| Code | Meaning | Fix |
| --- | --- | --- |
| 20 | Unsupported/invalid G-code. | Correct CAM post or offending line. |
| 21 | Conflicting modal commands. | Split/correct the line. |
| 22 | Feed undefined. | Set valid `F` before feed motion. |
| 23 | Integer required. | Use integer value. |
| 24 | Conflicting axis commands. | Split into valid blocks. |
| 25 | Repeated G-code word. | Remove duplicate. |
| 26 | Required axis words missing. | Add required coordinates. |
| 27 | Invalid line number. | Correct/remove `N` value. |
| 28 | Required value word missing. | Add required parameter. |
| 29 | G59.x unsupported. | Use supported WCS. |
| 30 | G53 used outside G0/G1. | Use G53 only with G0/G1. |
| 31 | Invalid axis words in block. | Remove words or use intended command. |
| 32 | Arc missing in-plane axis. | Add selected-plane endpoint. |
| 33 | Invalid motion target. | Correct coordinates/WCS. |
| 34 | Invalid arc radius. | Correct R or I/J/K offsets. |
| 35 | Arc missing in-plane offset. | Supply needed I/J/K. |
| 36 | Unused value words. | Remove unused values. |
| 37 | Dynamic tool offset on wrong axis. | Match G43.1 to configured axis. |
| 38 | Tool unsupported/undefined. | Define/select valid tool. |
| 40 | Tool change pending. | Complete/cancel change first. |
| 41 | Spindle not running for CSS/sync motion. | Start/verify spindle first. |
| 42 | Threading plane not ZX. | Select ZX/correct program. |
| 47 | ATC current tool not set. | Verify and set with M61. |
| 48 | Value-word conflict. | Correct incompatible parameters. |
| 54 | Retract below drill depth. | Correct drill-cycle depth/retract. |
| 55 | Two auto-squared axes homed together. | Home separately/configure correctly. |
| 56 | Coordinate system locked. | Unlock/select permitted system. |
| 57 | Unexpected file demarcation. | Repair/re-export file. |

### Storage, connection and access

| Code | Meaning | Fix |
| --- | --- | --- |
| 58 | Port unavailable. | Check connection and selected port. |
| 60 | SD card mount failed. | Reseat/check card; back up before formatting. |
| 62 | Directory listing failed. | Check card/filesystem and reconnect. |
| 63 | Directory not found. | Refresh and use existing path. |
| 64 | SD card not mounted. | Insert/mount and refresh. |
| 65 | File system not mounted. | Mount/check storage. |
| 66 | File system read-only. | Check write protection/card health; back up first. |
| 77 | Authentication required. | Authenticate with configured method. |
| 78 | Access denied. | Check permissions/connection. |
| 79 | Critical event active. | Resolve active alarm first. |
| 84 | Could not open file. | Check name/path/card health. |
| 85 | Format failed. | Do not retry over data; check card after backup. |
| 86 | Port unusable. | Reconnect/select valid port. |
| 87 | Tool in spindle. | Verify physical tool/change sequence. |
| 88 | No tool in spindle. | Verify tool state. |
| 89 | Delete failed. | Check path/card state/permissions; back up first. |
| 253 | User-defined error. | Follow accompanying message; export for support. |
