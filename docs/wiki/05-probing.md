# Probing

The Probe tab is for a correctly fitted and tested probe. Fit the right tool, keep hands clear and run **Test Probe** before any probing motion. A probe routine changes work coordinates; verify the result before cutting.

## Probe Configuration

Set the probe plate X/Y offsets, Z thickness, corner start-hole inset, feedrate, maximum search distance, retract and keep-clear distance. These values describe the physical probe, not the workpiece. Save after measuring the actual plate. A compatible 3D probe also exposes a **Probe Plate / 3D Probe** mode selector.

![Probe configuration](/images/ooznest-control/53-probe-configuration-clean.png =100%x)

## Outside Corner

Use **Outside Corner** to set X, Y and Z zero from an outside stock corner. Enter the diameter of the endmill or dowel pin in the collet, select the actual front/rear and left/right corner, place the plate at that corner, then start only after the safety test passes.

The clean outside-corner capture includes the corner selector, Test Probe and Bypass controls.

![Outside Corner probe workspace](/images/ooznest-control/51-probe-outside-corner-clean.png =100%x)

## Single Surface

Use **Single Surface** for one selected face: Left, Right, Front, Back or Top. The selected direction must agree with where the plate is positioned. For X/Y probing the entered tool diameter is used to calculate the work-zero contact offset; for Z, plate thickness matters.

![Single Surface probe workspace](/images/ooznest-control/52-probe-single-surface-clean.png =100%x)

## Centre Finder — 3D probe only

With a 3D probe selected, **Centre Finder** locates the centre of an inside pocket, rectangular feature or circular feature. Enter approximate X/Y feature dimensions first. Inside-pocket probing begins from the centre and searches outward; outer features start beyond the feature and probe inward. Keep sufficient clearance for the extra search travel.

## Inside Corners — 3D probe only

**Inside Corners** probes two internal faces to set the selected inside corner as work zero. Choose the matching rear/front and left/right diagram position before starting. Use only when both faces are clean, accessible and perpendicular.

## Rotation — 3D probe only

**Rotation** probes two points on an edge to calculate stock angle. Set a sensible P1-to-P2 distance along the edge and use the result to correct the work setup. It does not physically rotate the material.

## Tool Length Offset — 3D probe only

The Tool Length Offset section records a repeatable reference position for tool changes. Set the reference with the known tool, measure each replacement tool at the same reference and verify the reported offset before resuming a job. This is not available for the normal Ooznest XYZ Probe plate workflow.

## Safety test and bypass

**Test Probe** verifies that the controller sees contact/release before a motion routine is enabled. **Bypass** is only for a deliberate diagnostic situation—never bypass just to make a probe routine start. If a probe fails, stop, inspect the plate/clip/cable and use the Signals troubleshooting tab before retrying.

{.is-warning}
> Probing causes real movement. Set conservative feed and travel values, keep the plate and tool clear of clamps, and never use values copied from another machine.
