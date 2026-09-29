# First connection

Use this page only for a controller that has just left the factory and reports `Machine Config: unconfigured`.

{.is-warning}
> Keep clear of the machine while configuring it. Do not home, jog, run a macro, or run a job until the machine is assembled, wired and safe to move.

## 1. Connect the controller

In a browser, choose **Connect**, select **Ooznest Motion Control Core (COMxx)**, then choose **Connect** in the browser permission dialog. The browser remembers authorised ports; it may reconnect automatically next time.

{.is-info}
> Do not select **USB JTAG/serial debug unit (COM30)** for normal machine use. That is the ESP32-S3 programming port, used only while the controller is in bootloader mode for a firmware flash.

## 2. Select the machine

The Configuration Wizard starts automatically for an unconfigured controller. Select **WorkBee Z2 500 × 500 mm**.

![Machine selection](/images/ooznest-control/00-first-connection-machine-selection.png =100%x)

## 3. Flash the matching firmware

The wizard may ask for firmware before configuration can continue. Select **WorkBee Z2**, then select **Flash Firmware**. During the flash, the controller re-enumerates as an ESP32-S3 bootloader and the browser can show **USB JTAG/serial debug unit (COM30)**. This is expected for flashing only: its USB PID/VID differs from the normal running grblHAL controller. When flashing completes, wait for the controller to reappear as **Ooznest Motion Control Core** before reconnecting. Do not unplug during the flash.

![Firmware step](/images/ooznest-control/01-first-connection-firmware-flashing-modal.png =100%x)

![Firmware complete and controller reconnected](/images/ooznest-control/03-first-connection-firmware-complete.png =100%x)

{.is-info}
> The Firmware dialog is also available later from **Settings → Firmware**. It is documented with Settings because that is where it is opened after first connection.

## 4. Answer the machine questions

For the documented WorkBee Z2 500 × 500 example, choose:

- **Toolhead:** WorkBee Router Head
- **Probe:** Ooznest XYZ Probe
- **Dust shoe:** Yes
- **Enclosure:** No Enclosure

![Router toolhead](/images/ooznest-control/04-first-connection-toolhead-workbee-router.png =100%x)

![Ooznest probe](/images/ooznest-control/05-first-connection-ooznest-probe.png =100%x)

![Dust shoe](/images/ooznest-control/06-first-connection-dust-shoe.png =100%x)

![No enclosure](/images/ooznest-control/07-first-connection-no-enclosure.png =100%x)

## 5. Networking

Choose **Wi-Fi off / Ethernet optional** unless you have the controller's network details ready. To use Wi-Fi, choose Wi-Fi and enter the customer’s own network details; do not publish or share those details in screenshots or support tickets.

![Wi-Fi off](/images/ooznest-control/08-first-connection-wifi-off-ethernet.png =100%x)

![Wi-Fi option selected](/images/ooznest-control/09-first-connection-wifi-enabled.png =100%x)

## 6. Review and apply

Review every choice, then choose **Apply Configuration**. The wizard writes the required GRBL settings and closes when the controller has accepted them.

![Configuration review](/images/ooznest-control/10-first-connection-configuration-review.png =100%x)

After it closes, confirm the status is **IDLE** before continuing to [Main screen](03-main-screen.md).
