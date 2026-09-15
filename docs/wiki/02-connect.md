# Connect to a configured machine

Use this page after [First connection](01-first-connection.md) has been completed.

## Browser — WebSerial

1. Open Ooznest Control in a supported Chromium browser.
2. Choose **Connect**.
3. Select **Ooznest Motion Control Core (COMxx)** in the browser permission dialog. Do not select **USB JTAG/serial debug unit (COM30)**; that bootloader-only port is used during firmware flashing.
4. Choose **Connect** and wait for an **IDLE** status.

![Configured WorkBee Z2 connected](/images/ooznest-control/11-connected-workbee-z2-main-screen.png =100%x)

If the port does not appear, close other software that may already have it open, unplug/reconnect the USB lead, then refresh the page and try again.

## Desktop application — Serial

Choose the controller's serial port from the connection dialog, then connect. Only one application can use a serial port at a time.

![Electron USB serial connection](/images/ooznest-control/42-electron-usb-connect.png =65%x)

Leave **Baud** at `115200` unless Ooznest support has specified a different value. If the port is not listed, disconnect browser-based Ooznest Control and any sender that may already own the port, then unplug/reconnect the controller.

## Desktop application — Wi-Fi/Ethernet (Telnet)

Choose the network connection method only after the controller has been configured for the local network. Use the controller address supplied by the installation; it is not normally the public internet address.

Select **WiFi/Ethernet**, choose the local **Network Adapter**, then choose **Start Scan**. The adapter must be on the same local network as the controller; a VPN adapter is normally not the correct choice.

![Electron network-adapter scan](/images/ooznest-control/43-electron-network-scan.png =65%x)

Select the discovered controller, or enter its local IP address manually. The default port shown is `23`; only change it when the controller installation uses another port.

![Electron Wi-Fi/Ethernet connection](/images/ooznest-control/44-electron-wifi-ethernet-connect.png =65%x)

If scanning finds nothing, confirm that the controller has completed Wi-Fi setup or is connected to Ethernet, then check that computer and controller are on the same subnet. A successful ping alone does not prove that the grblHAL port is reachable.

## Controller-hosted browser mode — WebSocket

WebSocket is deliberately hidden in the installed Electron and Cordova applications; those builds use USB or Wi-Fi/Ethernet Telnet on port `23`. In a browser page served from a compatible controller SD card, Ooznest Control probes `ws://<controller-ip>:81/ws` and connects automatically when that controller WebSocket service is available. It is not a normal Electron connection choice.

{.is-warning}
> A connection is not a safety check. Before sending motion, inspect the machine, remove loose items, verify the emergency stop, and make sure the tool is clear.
