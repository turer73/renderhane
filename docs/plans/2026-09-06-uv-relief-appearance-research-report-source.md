# Relief Pro UV Appearance Research — Report Source

Date: 2026-09-06
Status: engineering research and implementation contract
Scope: Relief Pro only; Dome is explicitly out of scope.

## Research question

How can the UV colour artwork make the existing physical relief easier to read without changing the canonical geometry, breaking XY registration, or presenting a colour illusion as measured physical depth?

## Product boundary

- The canonical manufacturing surface remains the unsigned 16-bit absolute height map. STL, GLB and 3MF are derived from that geometry.
- Source UV artwork is immutable. A depth-assisted colour image is a separate derived artifact and never becomes the geometry master.
- White and varnish are physical ink channels. Their masks can share the same XY transform, but their deposited thickness is unknown until the exact printer, ink, media, RIP preset, pass count and environment are measured.
- A digital appearance result never promotes `physical_validation_required` to production approval.

## Evidence reviewed

### Colour management and print process

- The ICC v4 architecture connects source and destination colour encodings through a profile connection space; the current ICC recommendation is ICC.1:2022. The reference print viewing condition is D50-based, while actual profile and viewing conditions must be recorded. Sources: [ICC specifications](https://www.color.org/icc_specs2/), [ICC profile introduction](https://www.color.org/getting-started/).
- ISO 13655 defines spectral measurement conditions for graphic-arts images; ISO 3664 defines critical viewing conditions. The measurement condition, backing, geometry, observer and illuminant must travel with every physical result. Sources: [ISO 13655](https://www.iso.org/standard/65430.html), [ISO 3664:2025](https://www.iso.org/standard/83759.html).
- Fogra ProcessStandard Digital treats colour fidelity, run consistency, process control, standard viewing and measured MediaWedge results as separate evidence. A preview or embedded profile alone is not a print calibration. Source: [Fogra PSD](https://fogra.org/en/certification/digital-printing/psd).
- ISO 12647-1 describes the minimum process-control parameters needed to specify the visual and technical properties of halftone production prints. It does not justify a universal tone-value-increase or ink-limit number for every UV printer/media combination. Source: [ISO 12647-1](https://www.iso.org/standard/57816.html).
- CIEDE2000 is suitable for reporting colour differences, but acceptance limits must be set for the actual device/media/preset and validated by repeated measurements. Sources: [ICC colour measurement FAQ](https://www.color.org/faqs/), [CIEDE2000 workshop](https://www.color.org/events/colorimetry/Melgosa_CIEDE2000_Workshop-July4.pdf).

### White and clear/varnish ink

- Manufacturer workflows place white under colour when substrate colour or transparency would otherwise alter appearance. White is therefore a process plate, not a geometric height source. Source: [Roland white-base workflow](https://downloadcenter.rolanddg.com/contents/manuals/UV-Guide_USE_EN_R1/tgn1605000870205_2.html).
- RIP choke/spread changes a spot plate to reduce visible registration halos. The transform must have one owner. Relief Pro records a physical target in millimetres, while the selected RIP converts it to device pixels; the engine must not apply a second hidden choke. Source: [ONYX Spot Layer Tool](https://help.onyxgfx.com/25/Thrive/Content/Job%20Editor/Color%20Correction/Spot%20Layer%20Tool.htm).
- Selective gloss/matte can add useful angular contrast. Multiple clear/gloss passes can also create real surface height, but manufacturers explicitly make this a printer/profile/pass workflow. It must not be reported as known millimetres or braille compliance without measurement. Sources: [Roland gloss artwork](https://downloadcenter.rolanddg.com/contents/manuals/UV-Guide_USE_EN/mmw1605507989415.html), [Roland thick-gloss workflow](https://downloadcenter.rolanddg.com/contents/manuals/UV-Guide_USE_EN/yze1661132702220.html), [Mimaki white and clear guide](https://taiwan.mimaki.com/archives/034/202310/D203721-10_UJV100Plus_WhiteAndClearPrintGuide_e.pdf).

### Perceived shape

- Shading is a strong monocular shape cue, and observers commonly assume illumination from above. Incorrect or inconsistent shading can reverse convex/concave interpretation. Sources: [Shading and luminance gradients](https://pmc.ncbi.nlm.nih.gov/articles/PMC4530877/), [Perceived depth from shading boundaries](https://pubmed.ncbi.nlm.nih.gov/27271807/).
- Curvature and image-orientation structure contribute to perceived shape; more contrast is not automatically more correct depth. Sources: [Shape from shading: curvature and orientation](https://doi.org/10.1068/p230169), [Orientation fields and shape perception](https://pmc.ncbi.nlm.nih.gov/articles/PMC12280972/).
- A two-scale relief representation is technically appropriate: low-frequency depth carries the base form and higher-frequency normal/detail carries local readability. Source: [Real-time Bas-Relief Generation from Depth-and-Normal Maps on GPU](https://diglib.eg.org/items/7a2d84c8-8ad7-41e3-bcb4-13629d85a30c).

## Mathematical appearance model

Let the canonical height sample be `q(x,y)` in `[0, 65535]`, the configured relief depth be `D` millimetres, and the physical pixel pitch be `dx=W/Nx`, `dy=H/Ny`:

```text
h(x,y) = D * q(x,y) / 65535
p = dh/dx
qg = dh/dy
n = normalize((-p, -qg, 1))
```

For one fixed, versioned top-left light vector `l`, a bounded normal cue is:

```text
s  = max(0, dot(n, l))
uN = tanh((s - l.z) / sigmaN)
```

Subtracting `l.z` makes a flat surface neutral. Derivatives are calculated in physical millimetres so anisotropic rasters do not distort the light direction.

Curvature is useful only at low weight because second derivatives amplify noise. A stable bounded approximation is derived from a Gaussian-smoothed height field:

```text
uC = tanh(laplacian(G_sigma * h) / curvatureScale)
```

The initial composite cue is deliberately small and auditable:

```text
u = wN*uN + wC*uC + wE*uE
Lout = clamp(Lsource + maxDeltaL*u, Lmin, Lmax)
```

`uE` is an optional edge-contact term derived from the same height gradient. It is clipped to the silhouette and may not create a detached cast shadow. Source RGB is decoded to linear light before luminance operations; direct arithmetic in gamma-encoded sRGB is forbidden. The first implementation changes lightness only. Warm/cool shifts, aerial perspective, parallax and free cast shadows default to off.

### Painting techniques translated into safe controls

- Bounded chiaroscuro/value grouping, real-height edge hierarchy and a low-amplitude cavity proxy may improve legibility only when derived from the same canonical map and clipped to the registered silhouette.
- Selective gloss/matte is an uncalibrated process suggestion. Optional semantic warm/cool and saturation staging remain off until a measured, locked printer/RIP/ICC profile validates them without brand-hue drift.
- Unsafe defaults are detached shadows, arbitrary bevels, perspective warp, haze, brand-hue shifts, black crush, variable-white pseudo-shading and any silhouette-external effect.
- The artwork coordinate system has `up=-y`; the fixed top-left light vector is bound to that orientation. Rotation requires recompilation, otherwise the cue can invert convex/concave reading.

## Required artifacts

- `uv-artwork-source.png`: immutable source.
- `uv-artwork-depth-enhanced.png`: optional, derived appearance artifact.
- `shading-map-16.png`: signed cue encoded around neutral midpoint for audit.
- `appearance-normal.png`: diagnostic normal visualization, not geometry.
- `white-mask.png`: authored or RIP-owned process plate; ownership recorded.
- `appearance-varnish-mask.png`: selective appearance plate; never named relief height.
- `uv-appearance-job-ticket.json`: hashes, dimensions, coefficients, light vector, source/output colour space, ICC/preset identifiers, white/varnish ownership and calibration status.

All rasters must have the exact same canvas and XY transform. No automatic crop, fit, resample, perspective correction or global alignment is allowed inside the appearance stage.

## Validation gates

### Digital invariants

- Geometry master, STL, GLB, 3MF and cut-contour hashes are unchanged when appearance assistance is enabled.
- Pixel outside the silhouette is unchanged/transparent.
- A flat height map produces a neutral cue and byte-identical colour artwork.
- Physical `dx != dy` fixtures produce the same normal for the same millimetre slope.
- Output is deterministic for identical source bytes and canonicalized parameters.
- The job ticket reports colour-space/profile assumptions and `appearance_status=not_calibrated`, `physical_z_mm=null` until physical evidence exists.

### Colour evidence

- Report region-wise and global `mean/p95/max delta L*`; add CIEDE2000 only after the output ICC transform and measured print values are available.
- Report gamut clipping and out-of-mask modification. Do not silently clip or modify alpha.
- Do not hard-code universal Delta E, TAC, GCR, TVI, choke or varnish-pass acceptance numbers. Establish limits per locked printer/ink/media/RIP preset after repeated coupon measurements and measurement-system analysis.

### Physical coupon

The first coupon must include neutral and chromatic ramps, ink-limit/GCR patches, white 0/1/2-pass opacity patches, registration crosses with candidate choke values in millimetres, no/full/selective gloss and matte comparisons, and a separate multi-pass emboss block. Measure under the recorded ISO 13655 condition and inspect under D50 plus at least one alternate illuminant for metamerism. Compare depth-assist on/off artwork on identical geometry at both 0° and 180° artwork orientation; record convex/concave correctness and false-depth rate separately for each orientation. A successful result requires not only preference for the enhanced sample but correct convex/concave interpretation and a low false-depth rate.

## Implementation decision

The feature is an additive module in the existing `workers/relief/relief_engine`; it is not a second relief motor. It consumes the canonical height map and same-canvas UV artwork, produces only derived appearance artifacts and a job ticket, and leaves the canonical geometry pipeline untouched. White choke and device separation remain RIP-owned. Selective varnish output starts as an uncalibrated appearance suggestion. Final production status continues to require real P1S/A1 mini geometry evidence and UV printer/RIP/ICC coupon evidence.
