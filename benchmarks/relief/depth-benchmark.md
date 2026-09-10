# Semantic Depth Candidate Benchmark

The goal is not to choose the prettiest depth map. The goal is to identify which candidate preserves the intended foreground/middle/background order with the least manual correction for a manufactured relief.

## Required inputs

All files must use the same pixel canvas:

- front manufacturing master,
- explicit silhouette mask,
- semantic label image,
- optional text/logo mask,
- one raw depth image per candidate,
- manifest based on `depth-benchmark-manifest.example.json`.

The semantic label image contains integer region IDs. `regions` maps each ID to an ordinal rank. A higher rank means physically closer/higher in the finished relief.

## Run

```bash
python workers/relief/depth_benchmark.py \
  --manifest benchmarks/relief/depth-benchmark-manifest.json \
  --output /tmp/renderhane-depth-benchmark
```

## Metrics

- `ordinal_pair_accuracy`: whether region median depths follow the approved ordinal order.
- `adjacent_separation`: whether neighbouring depth ranks remain materially distinct after robust normalisation.
- `within_region_roughness`: excessive local variation within semantic regions; this is a warning metric, not a universal truth because some regions intentionally contain texture.
- `silhouette_background_variation`: structured depth outside the approved product silhouette.
- `text_edge_score`: contrast at the approved text/logo boundary.
- `composite_score`: documented weighted digital score used only for provisional ranking.

The tool automatically records whether a source depth map had to be inverted. Inversion is not itself a defect.

## Decision rules

- `usable_candidate`: passes the current digital thresholds.
- `needs_review`: potentially usable after manual correction.
- `reject_candidate`: semantic order is too unreliable for this benchmark.

No candidate becomes the production default from this score alone. Final selection also requires:

1. recorded manual correction time,
2. deterministic mesh validation,
3. P1S and A1 mini samples,
4. UV registration test,
5. operator acceptance.

## Anti-bias rules

- Do not remove failed examples from the data set.
- Do not tune a model only against Kapadokya and call it general.
- Record exact model/checkpoint/license, inference time and cost.
- Keep raw provider output immutable.
- Store normalised output separately.
- Do not let visual-review agents overwrite quantitative results.
- Select by category if no single model wins across tourist scenes, portraits, logos and isolated objects.
