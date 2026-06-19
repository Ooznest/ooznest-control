# Vernier Calibration Logic

## Concept
The machine cuts a series of 100 lines spaced exactly **0.9mm** apart. This creates a "CNC Ruler" that is exactly 90mm long on the machine's internal scale.

A standard physical ruler is then placed against these cut marks. The user identifies which mark on the CNC scale aligns perfectly with a mark on the standard ruler.

## Calculation

### 1. Distance as calculated by the CNC ($D_{cnc}$)
If the **$N$-th** mark on the CNC scale aligns with a mark on the physical ruler:
$$D_{cnc} = N \times 0.9\text{ mm}$$

*Example: If the 96th mark aligns:*
$$D_{cnc} = 96 \times 0.9 = 86.4\text{ mm}$$

### 2. Actual physical distance ($D_{real}$)
The value read from the standard physical ruler at that alignment point.

*Example: If it aligns with the 86mm mark:*
$$D_{real} = 86.0\text{ mm}$$

### 3. Scale Error Calculation ($k$)
The scale factor represents the ratio of actual movement to requested movement.
$$k = \frac{D_{real}}{D_{cnc}}$$

*Example:*
$$k = \frac{86.0}{86.4} \approx 0.99537$$

### 4. Correcting Steps/mm
To correct the machine's movement, the steps per mm value in the firmware (e.g., $100, $101, $102) must be adjusted.

$$\text{new\_steps\_per\_mm} = \frac{\text{old\_steps\_per\_mm}}{k}$$
or
$$\text{new\_steps\_per\_mm} = \text{old\_steps\_per\_mm} \times \left(\frac{D_{cnc}}{D_{real}}\right)$$

*Example:*
$$\text{new} = \text{old} \times \left(\frac{86.4}{86.0}\right) \approx \text{old} \times 1.00465$$
