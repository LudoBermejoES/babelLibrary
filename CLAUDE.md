# Versioning

Before every `git commit`, automatically bump the version based on the commit
message's conventional-commit prefix. Include the updated files in the same
commit — no separate version-bump commit.

## Bump rules (highest wins)

| Commit prefix | Bump |
|---|---|
| `BREAKING CHANGE` in message, or `type!:` | **major** |
| `feat:` | **minor** |
| `fix:` `perf:` `refactor:` `build:` `ci:` `test:` `chore:` `docs:` `style:` | **patch** |

If the message matches none of these (e.g. a bare message with no prefix),
**skip the bump silently**.

## Files to update (always all three, same version string)

1. `package.json` — `"version": "X.Y.Z"`
2. `web/package.json` — `"version": "X.Y.Z"`
3. `Cargo.toml` — `[workspace.package]` `version = "X.Y.Z"` (both Rust crates,
   `babel-gen` and `server`, inherit this via `version.workspace = true`, so
   only the workspace root needs editing)

Bumping the workspace version changes both crates' resolved version, which
`Cargo.lock` must reflect — run `cargo update --workspace` after editing
`Cargo.toml` and stage the resulting `Cargo.lock` alongside the three version
files. Skipping this leaves `Cargo.lock` out of sync with `Cargo.toml`, which
`cargo build`/`cargo test` silently repair by rewriting the lockfile on the
next run — showing up later as unexplained `Cargo.lock` diffs in an unrelated
commit.

## How to read the current version

```bash
grep '"version"' package.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/'
```

## How to apply the bump

```bash
# patch example — adjust MAJOR/MINOR/PATCH arithmetic for minor/major
sed -i.bak "s/\"version\": \"${CURRENT}\"/\"version\": \"${NEW}\"/" package.json && rm package.json.bak
sed -i.bak "s/\"version\": \"${CURRENT}\"/\"version\": \"${NEW}\"/" web/package.json && rm web/package.json.bak
sed -i.bak "s/^version = \"${CURRENT}\"/version = \"${NEW}\"/" Cargo.toml && rm Cargo.toml.bak
cargo update --workspace
```

Then stage all four files **before** the commit:

```bash
git add package.json web/package.json Cargo.toml Cargo.lock
```

## On push to main

Tag every version bump so the repo's tag history stays accurate:

```bash
VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
git tag "v${VERSION}"
git push --follow-tags
```

`git push --follow-tags` pushes the commits and the new tag together in one
step (a plain `git push origin "v${VERSION}"` also works, but requires two
separate pushes — one for commits, one for the tag).

**Verify the tag actually landed.** `--follow-tags` has been observed to push
the commit but silently skip a tag created moments earlier in the same
session — the `git push` output shows only the commit ref update, with no
`* [new tag]` line, and it does not error. Don't assume success from the
absence of an error. After pushing, confirm with:

```bash
git ls-remote --tags origin | grep "v${VERSION}"
```

If it's missing, push the tag explicitly:

```bash
git push origin "v${VERSION}"
```

**Important — tagging does NOT trigger a build.** `.github/workflows/ci.yml`
runs on every push/PR regardless of tags (tests, lint, typecheck — no Docker).
`.github/workflows/release.yml` (the Docker build + GHCR push) fires **only**
on an explicit `workflow_dispatch` run or a published GitHub Release — never
automatically from a tag push. This is intentional: routine commits and tags
must never trigger a paid build on their own. To actually cut a release after
tagging, run it yourself:

```bash
gh workflow run release.yml
```

## Skip conditions

- Commit message starts with `chore(release):` — already a version bump, skip.
- No conventional-commit prefix detected — skip silently.
