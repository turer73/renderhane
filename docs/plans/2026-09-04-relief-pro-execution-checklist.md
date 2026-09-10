# Relief Pro — Evidence-Gated Execution Checklist

This checklist is the operational source of truth for the current branch. A checked software item does not imply physical production approval.

## Gate A — Product contract

- [x] Relief Pro and Dome are separate products.
- [x] Canonical geometry source is a 16-bit relief map plus recipe.
- [x] AI output is advisory, not final production geometry.
- [x] Front Manufacturing Master is separate from an oblique concept render.
- [x] Digital and physical validation statuses are separate.

## Gate B — Deterministic geometry foundation

- [x] Baseline relief-map to watertight plate builder exists.
- [x] Regression tests cover dimensions, topology and deterministic artifacts.
- [x] Multi-depth benchmark runner exists.
- [x] Generic 3MF exporter exists and rejects open meshes.
- [x] Shared-canvas package builder exists for geometry and UV artifacts.
- [x] Silhouette-trimmed product builder prototype exists.
- [x] Optional magnet-pocket boolean prototype exists.
- [ ] CI checks are green on the branch.
- [ ] Independent code review has no BLOCKER/HIGH findings.

## Gate C — Front master and benchmark input

- [x] Front-master contract validator implemented.
- [x] Synthetic software-regression fixture implemented.
- [x] Kapadokya Phase 0 recipe recorded.
- [x] Physical measurement CSV template recorded.
- [x] 70 mm UV registration coupon recorded.
- [ ] Kapadokya front master approved as an orthographic manufacturing master.
- [ ] Explicit silhouette mask manually approved.
- [ ] Text/logo vector layer supplied or intentionally waived.
- [ ] Five semantic depth layers approved.
- [ ] 16-bit Kapadokya relief map approved as benchmark revision v1.

## Gate D — Digital Kapadokya outputs

Required for 0.6 / 1.0 / 1.4 / 1.8 mm:

- [ ] STL opens without repair.
- [ ] GLB bounds and metre conversion verified.
- [ ] Generic 3MF validates and opens in Bambu Studio.
- [ ] Watertight/manifold and zero open-edge checks pass.
- [ ] Single connected component confirmed.
- [ ] Flat back and base thickness confirmed.
- [ ] Magnet pocket dimensions and remaining base confirmed.
- [ ] Artifact and recipe hashes recorded.
- [ ] UV artwork, white mask and varnish mask share the exact canvas.

## Gate E — Physical printing

For both P1S and A1 mini:

- [ ] 0.6 mm relief printed and measured.
- [ ] 1.0 mm relief printed and measured.
- [ ] 1.4 mm relief printed and measured.
- [ ] 1.8 mm relief printed and measured.
- [ ] Width, height and thickness measured with caliper.
- [ ] Flat-back deviation and warping recorded.
- [ ] Text legibility and fine-detail score recorded.
- [ ] Print time, material and slicer profile recorded.
- [ ] Rejected samples retained in benchmark evidence.

## Gate F — UV calibration

- [ ] 70 mm coupon printed without scaling.
- [ ] Colour registration X/Y measured.
- [ ] White-mask offset measured.
- [ ] Varnish offset measured.
- [ ] Edge bleed measured.
- [ ] Safe relief-height limit established for the actual printer/RIP/material.
- [ ] Printer profile stored with measured limits.

## Gate G — MVP product decision

- [ ] Default relief height selected from evidence, not visual preference.
- [ ] Default P1S and A1 mini profile recorded.
- [ ] First-print acceptance is at least 85%.
- [ ] Calibrated-profile acceptance is at least 95%.
- [ ] Median manual correction is at most 5 minutes.
- [ ] UV registration error is at most 0.5 mm.
- [ ] Final status language reviewed so digital success cannot be mistaken for physical approval.

## Next implementation order

1. Make all worker/3MF/product geometry CI checks green.
2. Run independent manufacturing code review.
3. Approve the Kapadokya front master and semantic layers.
4. Produce four digital variants and slicer-open evidence.
5. Print P1S/A1 mini samples.
6. Run UV coupon.
7. Select defaults from measured results.
8. Only then integrate workflow/database/editor APIs.
