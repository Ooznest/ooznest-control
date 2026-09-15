# First job

This first job is deliberately cautious: prove the setup with a simple, shallow program before attempting a production cut.

## Before switching on

- Wear appropriate PPE and make the work area clear.
- Secure the material and confirm the cutter is fitted correctly.
- Connect dust extraction if fitted.
- Verify the emergency stop and keep it reachable.

## Prepare the machine

1. [Connect](02-connect.md) and wait for **IDLE**.
2. Home the machine only when it is safe to move.
3. Fit the correct tool and set the work zero using the method required by the job.
4. Load the program in the [Editor](04-gcode-editor.md).
5. Inspect it in [3D Preview](03-main-screen.md#3d-preview).

![Loaded job at work zero](/images/ooznest-control/58-first-job-loaded-at-work-zero.png =100%x)

## Prove the job

Start with a safe Z clearance and a conservative feed. If possible, air-cut above the material first. Watch the first moves with a hand ready to pause or reset; do not leave the machine unattended.

## Run

Only select **Run** after the toolpath, work zero, clamps, tool and spindle/dust setup have been checked. Use Job Statistics to follow progress, but trust the real machine over the screen.

![Active job with Pause and Stop](/images/ooznest-control/59-first-job-running-at-work-zero.png =100%x)

## After the job

Wait for all motion to stop, make the tool safe, inspect the result, then remove the workpiece. If something was unexpected, preserve the Console/troubleshooting information before resetting the controller.
