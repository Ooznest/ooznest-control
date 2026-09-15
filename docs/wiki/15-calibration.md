# Axis Calibration

Open **Settings → Calibration**. Calibration deliberately moves one selected axis, so remove tools and loose items, use a clear machine and accurately measure the resulting travel. It is not a substitute for homing or squaring the machine.

## 1. Select the axis

Choose the axis to check. Calibrate one axis at a time.

![Calibration axis selection](/images/ooznest-control/26-connected-calibration-axis-selection.png =100%x)

## 2. Choose the method

Choose the distance-measurement workflow. Use a measured physical result, not a value copied from another machine.

![Calibration method](/images/ooznest-control/27-connected-calibration-method.png =100%x)

## 3. Prepare the measurement

Set up a ruler, tape or dial indicator so the commanded and measured distances can be compared accurately.

![Calibration setup](/images/ooznest-control/28-connected-calibration-setup.png =100%x)

## 4. Run the test move and enter the measured distance

The controller moves the requested distance. Enter what it physically moved, not what the display was expected to show. The app calculates the new steps-per-mm value.

![Calibration measurement](/images/ooznest-control/29-connected-calibration-measurement.png =100%x)

## 5. Review and apply

Check the calculated value and apply only when the measurement is credible. Repeat the check if the error was substantial.

![Calibration result](/images/ooznest-control/30-connected-calibration-result.png =100%x)

## 6. Confirm completion

Keep a record of the measurement, date and machine. Re-test the axis before starting customer work.

![Calibration complete](/images/ooznest-control/31-connected-calibration-done.png =100%x)

{.is-warning}
> Calibration changes the controller setting for the selected axis. Do not apply a result measured against a loose ruler, an obstructed axis or a machine with mechanical slip.
