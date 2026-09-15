# Main screen

The main screen remains visible while you work. It contains the controller state, DRO, jog panel and job controls; the tab bar opens feature pages.

![Connected WorkBee Z2 main screen at work zero](/images/ooznest-control/58-first-job-loaded-at-work-zero.png =100%x)

## DRO and work coordinates

The **Machine** values are the controller's coordinates. The **Work** values are the active work coordinate system (normally G54). Use the WCS selector to view another saved work system. Use an axis **Zero** button only after physically establishing the work zero for that job.

The clean main-screen capture above shows the WCS selector alongside the live Machine and Work values. The selector changes which saved work system is displayed; it does not move the machine.

## Jog panel

Choose a jog feed rate and either Incremental or Continuous mode. Incremental mode enables the jog distance selector. Each arrow moves in the direction shown; the centre button is not a substitute for homing.

{.is-warning}
> Jogging moves the real machine. Start with a clear machine, a slow feed, and a small incremental distance. Never use a screenshot's coordinates as a setting for another machine.

## 3D Preview

The preview is a visual check of the loaded program. Use camera controls to inspect the toolpath, the perspective/grid controls to orient the model, and the Endmill button to set the displayed cutter.

### Camera modes

The camera button cycles through **Perspective**, **Orthographic**, and **Spindle View**. It changes only the preview, never the machine position or the G-code.

- **Perspective** is the normal angled 3D view. Use it to understand height, clearances and the overall toolpath.
- **Orthographic** removes perspective distortion. Use it to inspect the plan shape and compare parallel edges without apparent convergence.
- **Spindle View** keeps the camera target following the displayed spindle position. It is useful while following the tool through a job; you can still orbit and zoom.

![Perspective camera view](/images/ooznest-control/60-3d-preview-perspective.png =100%x)

![Orthographic camera view](/images/ooznest-control/61-3d-preview-orthographic.png =100%x)

![Spindle View camera](/images/ooznest-control/63-3d-preview-spindle-view.png =100%x)

### Grid reference

The grid button alternates between **Grid: Machine**, which spans the configured machine workspace, and **Grid: Job**, which is fitted around the loaded program with a margin. Changing grid reference resets only the preview camera.

![Perspective view: Machine grid spans the configured workspace](/images/ooznest-control/71-perspective-machine-grid-wide.png =100%x)

![Perspective view: Job grid is fitted around the loaded program](/images/ooznest-control/72-perspective-job-grid-wide.png =100%x)

![Endmill setup](/images/ooznest-control/67-endmill-setup-modal.png =65%x)

## Job controls and statistics

Load and review a program first. **Run** sends it to the controller; pause, resume and reset affect a real job. Job statistics report the active job rather than proving a cut is safe.

The live capture above includes the job-statistics card and the Run Job control. The [First Job](14-first-job.md) page shows the run choices and an active job separately.
