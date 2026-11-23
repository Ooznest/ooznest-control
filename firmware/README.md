# Bundled Ooznest firmware

Freshly built on 2026-11-23 for the ESP32-S3 Ooznest Motion Control Core.
The firmware reports grblHAL core build 20261117.

The flashing tool uses:

- bootloader.bin at 0x0000
- partitions.bin at 0x8000
- One machine application at 0x10000:
  - ooznest-workbee-z1plus.bin
  - ooznest-workbee-z2plus.bin
  - ooznest-actuator.bin

All three applications enable both PWM outputs and all seven Modbus VFD drivers,
with nine spindle registration slots. They include the spindle array bounds fix
from grblHAL/Plugins_spindle commit eceb329, plus the Ooznest board Ethernet
module/link report. The existing GPIO module-presence detection is retained.

Bootloader and partition images were rebuilt. Partition images and bootloader
build configurations were verified identical across all three environments.
Bootloader binaries can differ in their embedded compile timestamps. Application payloads are not merged flash images.
