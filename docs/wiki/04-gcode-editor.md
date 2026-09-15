# G-code Editor

Use the Editor to open, inspect and edit a program before it is run. The filename, text editor and preview all refer to the same loaded program.

![Loaded G-code in the Editor](/images/ooznest-control/50-editor-loaded-gcode-clean.png =100%x)

## Workflow

1. Load a G-code file.
2. Read the setup comments, units, safe heights and tool call.
3. Inspect it in [3D Preview](03-main-screen.md#3d-preview).
4. Save the edited file if required.
5. Use SD upload only when you intend to store that file on the controller card.

The **Upload to SD** control is shown in the clean editor capture above. Use it only after checking the exact file and intended controller card.

{.is-warning}
> Editing G-code can change motion, spindle state and tool changes. A successful preview does not replace checking the material, tool, clamps, work zero and safe Z.
