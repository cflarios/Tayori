/**
 * Commit message linting: enforces Conventional Commits.
 *
 * This is what Release Please reads to build the CHANGELOG and pick the next
 * version, so a malformed subject silently produces no release. The hook only
 * enforces the *format* (feat:/fix:/docs:…); writing the message in English is
 * a project convention documented in CONTRIBUTING.md, not something a linter
 * can check.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
