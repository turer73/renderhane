# ADR-0001 — Relief Pro Magnet Attachment Strategy

**Status:** Accepted for Phase 0  
**Date:** 2026-09-04

## Context

A rear recess for a 12 × 2 mm magnet is geometrically easy to subtract with a manifold boolean. That does not make it the best FDM production default.

When the Relief Pro part is printed with its flat outer back on the build plate, a rear-open circular pocket creates a roof that must bridge approximately the magnet diameter. For a 12 mm magnet this is a roughly 12 mm bridge. The mesh can be watertight and dimensionally correct while the physical pocket roof is rough, sagged or dimensionally unreliable.

Printing the relief front against the build plate is not a general solution because the relief is non-planar and must later register to UV artwork.

## Decision

The Phase 0 and initial MVP default is:

> **Flat outer back with a surface-applied adhesive magnet; no deep rear pocket.**

The deterministic builder keeps the pocket option for engineering experiments, but any package containing a pocket receives the warning:

`magnet_pocket_requires_bridge_retention_and_orientation_physical_test`

It cannot be treated as a clean production default merely because digital geometry checks pass.

## Alternatives

### A. Surface-applied magnet — default

Advantages:

- no bridge or internal roof,
- fastest print,
- simplest inspection,
- lowest mesh and slicer risk,
- easy magnet supplier changes,
- failed magnet bond does not scrap the printed geometry before assembly.

Disadvantages:

- magnet protrudes from the back,
- adhesive and surface preparation must be validated,
- packaging must protect the exposed magnet.

### B. Deep rear recess — experimental

Advantages:

- lower assembled protrusion,
- visually integrated attachment.

Risks:

- bridge quality,
- pocket floor thickness,
- dimensional shrinkage,
- magnet retention,
- support-removal or orientation trade-offs.

Required evidence:

- P1S and A1 mini bridge sample,
- pocket diameter/depth measurement,
- pull-off test,
- heat-cycle and drop test,
- inspection of the relief front after the chosen print orientation.

### C. Two-piece rear carrier — premium/future

A relief face and a separately printed rear carrier can place the magnet pocket upward during printing, eliminating the enclosed bridge. This adds assembly, tolerance and adhesive/snap-fit work, so it is not Phase 0 scope.

## Consequences

- Four relief-height benchmark variants are generated without a pocket.
- Pocket topology remains covered by automated tests.
- Pocket packages are always `needs_review` at best until physical evidence exists.
- Product engineering and relief-height experiments remain separable.
- The UI must label attachment style explicitly rather than hiding it inside a generic magnet preset.
