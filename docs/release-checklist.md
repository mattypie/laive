# Release Checklist

## Pre-Release Validation

- Confirm `agent-plans/progress.md` reflects the current implementation status.
- Run workspace verification.
- Run package tests.
- Replay trace fixtures and inspect summary output.
- Run scenario benchmark fixtures and verify expected steps and risk classes.
- Review compatibility matrix for the target Live version.

## Packaging

- Build or package the Remote Script artifact.
- Package the MCP server entrypoint.
- Package the UI helper and document Accessibility requirements.
- Bundle fixture and troubleshooting references needed for operator support.

## Safety Review

- Verify risk-class mappings for all exposed write tools.
- Confirm destructive actions require explicit confirmation.
- Confirm UI fallback tools declare fallback mode in their outputs.
- Confirm audit logging includes trace IDs and affected object summaries.

## Documentation Review

- Update quickstart if installation or test commands changed.
- Update architecture overview if component boundaries changed.
- Update tool reference for any new or removed tools.
- Update known limitations and troubleshooting guidance.

## Release Output

- Create release notes with supported Live versions.
- Include known limitations and fallback caveats.
- Include rollback guidance for operators testing a new build.

## Rollback Plan

- Remove or disable the installed Remote Script.
- Revert to the previous stable MCP server build.
- Disable UI fallback helpers if the issue is Accessibility-related.
- Preserve trace logs and failing fixtures for diagnosis.
