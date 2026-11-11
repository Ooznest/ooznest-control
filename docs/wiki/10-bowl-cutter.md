# Bowl Cutter

Use **Tools > Bowl Cutter** to generate a bowl or tray program centred on the active work X/Y origin.

## Before you start

Secure stock large enough for the entire bowl and surrounding workholding. Check stock thickness against the final depth and leave the required bottom thickness. Keep clamps and screws outside every cutting and travel move. Fit a suitable cutter with the spindle isolated.

## Step 1: Establish the origin and shape

| Instructions | Preview |
| --- | --- |
| <ul><li>Fit the intended cutter; a ball-nose cutter can improve the finish of curved surfaces.</li><li>Set X/Y zero at the centre of the intended bowl and Z zero at the highest point of the stock.</li><li><strong>Width / Length:</strong> bowl dimensions.</li><li><strong>Corner Radius:</strong> controls rounded plan-view corners and the generated narrowing towards the bottom. It is not the cutter radius; enter the physical cutter diameter separately.</li></ul> | ![Bowl Cutter workspace](/workbee/ooznest-control/bowl-cutter/19-connected-tools-bowl-cutter.png) |

## Step 2: Set cutting parameters

| Instructions | Preview |
| --- | --- |
| <ul><li><strong>Final Depth:</strong> total depth below Z zero. <strong>Stepdown:</strong> maximum depth increment per pass.</li><li><strong>Safe Z Clearance:</strong> travel height above work Z zero. Check clamps and available Z travel.</li><li><strong>Tool Diameter:</strong> actual cutter diameter. <strong>Stepover:</strong> pass spacing as a percentage of diameter; smaller spacing adds passes and can reduce surface scallops.</li><li><strong>Feed / Plunge:</strong> cutting and downward feed rates. <strong>RPM:</strong> spindle speed command when supported. Set dial manually on manual spindles.</li></ul> | ![Bowl dimensions and cutting parameters](/workbee/ooznest-control/bowl-cutter/bowl-dimensions.png) |

## Step 3: Generate and inspect

| Instructions | Preview |
| --- | --- |
| <ul><li>Click <strong>Generate G-Code</strong>. The new program is loaded into 3D Preview.</li></ul> | ![Bowl generation controls](/workbee/ooznest-control/bowl-cutter/58-generate.png) |
| <ul><li>Check the centre, boundary, corner shape, first plunge, final depth and every travel move against the real setup.</li><li>Check remaining bottom thickness and that neither the tool nor holder reaches workholding.</li><li>Inspect the spindle start and stop commands in the generated file before running.</li></ul> | ![Bowl toolpath in 3D Preview](/workbee/ooznest-control/bowl-cutter/58-3dview-bowl.png) |

## Step 4: Run the program

For a manual router, set the speed and start it yourself. For a controlled spindle, verify that its generated start command is appropriate and that it reaches speed before cutting. Start extraction, then click **Run Job > Run (Streaming)** and read the confirmation. Keep the computer connected and watch the first moves.

## Next steps

See [First Job](/en/self-build-solutions/workbee-cnc-machine/workbee-machines/ooznest-control/first-job) for the shared pre-flight and job-control procedure, or [G-code Editor](/en/self-build-solutions/workbee-cnc-machine/workbee-machines/ooznest-control/gcode-editor) to save and inspect the generated file.

## Optional: Cutout

Enable **Cutout** before generating to cut the bowl free from its parent stock after pocketing. Leave it unticked to generate only the pocket; the offset and stock-depth inputs remain disabled.

| Instructions | Preview |
| --- | --- |
| <ul><li>Tick <strong>Cutout</strong>.</li><li><strong>Outside Offset:</strong> wall thickness outside the pocket. Tool radius compensation is included automatically; do not add the tool radius to this value.</li><li><strong>Stock Depth:</strong> final cutout depth below the same stock-top Z zero. It must exceed <strong>Final Depth</strong> to leave a bottom in the bowl.</li><li>The cutout uses the same cutter, <strong>Stepdown</strong>, feed and plunge rates.</li></ul> | ![Enabled Cutout options and Generate G-Code button](/workbee/ooznest-control/bowl-cutter/bowl-cutout-options.jpg) |
| <ul><li>Click <strong>Generate G-Code</strong> again and inspect the outside contour in 3D Preview.</li><li>Check clearance around the full outside cut, including the cutter and holder.</li><li>Example shown: a 100 × 100 mm pocket, 5 mm outside offset and 6 mm cutter produce a 110 × 110 mm outside bowl shape and a 116 × 116 mm tool-centre path.</li></ul> | ![Top view showing the pocket and surrounding cutout contour](/workbee/ooznest-control/bowl-cutter/bowl-cutout-top.jpg) |
| <ul><li>Check that the cutout reaches the intended stock depth after the pocket is finished.</li><li>Example shown: 20 mm pocket depth and 25 mm stock depth leave a 5 mm bottom; the cutout steps down to 25 mm below Z zero.</li><li>Secure the bowl so it cannot move as the final pass releases it. No holding tabs are generated.</li></ul> | ![Bowl pocket and deeper outside cutout in 3D Preview](/workbee/ooznest-control/bowl-cutter/bowl-cutout-preview.jpg) |
