# Macros

Macros are named, reusable G-code sequences. They are powerful: running one can move the machine or change its state.

![Macro card](/images/ooznest-control/46-macros-jig-position-card.png =100%x)

## Create a macro

Choose **Add Macro**, give it a clear name, choose a colour and icon, then enter one G-code command per line. Save it when the sequence has been checked.

![Create Macro](/images/ooznest-control/39-macro-name.png =65%x)

## Edit a macro

Use the pencil icon on its card. The Edit Macro dialog contains the name, colour, icon, G-code sequence, Save and Cancel controls. It is documented here, where a customer uses it, rather than in a separate modal reference page.

For a useful site-specific macro, name it **Move to Jig Position** and enter only the verified safe movement for that jig. The coordinates are deliberately not supplied here: they are different for every machine and jig. Do not use a macro to duplicate **Set Zero**; the main screen already provides the correct zeroing controls.

![Edit Macro](/images/ooznest-control/47-macros-edit-jig-position.png =75%x)

## Use a macro

Selecting the body of a macro card runs it. Read its displayed G-code preview first. Confirm the machine state, work coordinate system, tool position and safe clearance first. Do not run an unfamiliar macro merely to test it.

## Delete a macro

Use the card's trash icon, then confirm **Delete Macro**. Deleting only removes the locally saved macro from this browser/application profile; it does not undo any G-code that was already sent to the controller. Use the pencil icon to edit instead of deleting when you want to retain the macro.

![Delete Macro confirmation](/images/ooznest-control/48-macros-delete-confirmation.png =65%x)

{.is-warning}
> A macro can contain machine motion. Treat it with the same care as a job file.
