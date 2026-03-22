# Fixtures

This directory contains development fixtures for trace replay, scenario benchmarking, and future regression tests.

## Layout

- `traces`
  - JSON Lines bridge traces used for replay and summary tooling.
- `scenarios`
  - JSON scenario manifests used for benchmark and release-validation runs.

## Fixture Rules

- Use stable, hand-curated examples rather than random captures.
- Avoid storing sensitive project data.
- Keep fixtures compact enough to review in code review.
- Prefer explicit timestamps and identifiers where deterministic output matters.
