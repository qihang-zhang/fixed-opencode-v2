"""Track official OpenCode V2 releases and describe our adapted releases.

Commands:
  sync   Pin the submodule to the official latest release if it is newer.
  plan   Print the next release tag for the pinned version (e.g. v2.0.20-fixed.2).
  notes  Print release notes for the current pin and adapters.

Results are also written to $GITHUB_OUTPUT when running in GitHub Actions.
"""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PIN = ROOT / "upstream.json"
REGISTRY = "https://registry.npmjs.org/@opencode%2fcli/latest"


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "sync":
        return sync()
    if command == "plan":
        return output(tag=release_tag(json.loads(PIN.read_text())))
    if command == "notes":
        return print(notes(json.loads(PIN.read_text())))
    sys.exit(__doc__)


def sync() -> None:
    pin = json.loads(PIN.read_text())
    # npm's `latest` dist-tag is what the official installers ship as the V2 stable release.
    with urllib.request.urlopen(REGISTRY, timeout=30) as response:
        version = json.load(response)["version"]
    if parse(version) <= parse(pin["tag"].removeprefix("v")):
        print(f"up to date: official latest is {version}, pinned {pin['tag']}")
        return output(changed="false")
    tag = f"v{version}"
    commit = tag_commit(pin["repository"], tag)
    subprocess.run(["git", "-C", "opencode", "fetch", "--depth=1", "origin", f"refs/tags/{tag}:refs/tags/{tag}"], cwd=ROOT, check=True)
    subprocess.run(["git", "-C", "opencode", "checkout", "--detach", commit], cwd=ROOT, check=True)
    pin = {**pin, "tag": tag, "commit": commit}
    PIN.write_text(json.dumps(pin, indent=2) + "\n")
    print(f"updated pin to {tag} ({commit})")
    output(changed="true", upstream=tag)


def tag_commit(repository: str, tag: str) -> str:
    listing = subprocess.check_output(
        ["git", "ls-remote", repository, f"refs/tags/{tag}", f"refs/tags/{tag}^{{}}"], text=True
    )
    refs = dict(reversed(line.split("\t")) for line in listing.splitlines())
    # Annotated tags point at a tag object; the peeled `^{}` entry is the commit.
    commit = refs.get(f"refs/tags/{tag}^{{}}") or refs.get(f"refs/tags/{tag}")
    if not commit:
        sys.exit(f"official release {tag} has no matching git tag in {repository}")
    return commit


def notes(pin: dict) -> str:
    adapters = sorted((ROOT / "adapters").glob("*.ts"))
    lines = [
        f"Official OpenCode {pin['tag']}, unmodified, rebuilt with the build-time adapters below.",
        "",
        f"- Upstream: {pin['repository'].removesuffix('.git')}/releases/tag/{pin['tag']}",
        f"- Upstream commit: `{pin['commit']}`",
        f"- Built from: `{os.environ.get('BUILD_SHA', 'local')}`",
        "",
        "## Adapters",
        "",
        "- `location-ttl`: Location inactivity eviction default 60 minutes → 24 hours;"
        " override at runtime with `OPENCODE_LOCATION_TTL` (e.g. `90 minutes`, `7 days`).",
        "",
        *[f"- `adapters/{file.name}` sha256 `{hashlib.sha256(file.read_bytes()).hexdigest()}`" for file in adapters],
        "",
        "## Notes",
        "",
        f"- Binaries report version `{pin['tag'].removeprefix('v')}` so they stay compatible with official clients.",
        "- Disable auto-update (`OPENCODE_DISABLE_AUTOUPDATE=1`), or an official upgrade will replace the adapted binary.",
        "- macOS binaries are ad-hoc signed, not notarized.",
        "- Verify downloads with `SHA256SUMS`.",
    ]
    return "\n".join(lines)


def release_tag(pin: dict) -> str:
    # Every commit on main is released: the next `fixed.N` for this upstream
    # version, starting at 1. Release runs are serialized, so numbers never collide.
    tags = subprocess.check_output(
        ["gh", "release", "list", "--limit", "1000", "--json", "tagName", "--jq", ".[].tagName"],
        cwd=ROOT,
        text=True,
    ).split()
    prefix = f"{pin['tag']}-fixed."
    numbers = [int(tag.removeprefix(prefix)) for tag in tags if tag.startswith(prefix) and tag.removeprefix(prefix).isdigit()]
    return f"{prefix}{max(numbers, default=0) + 1}"


def parse(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.split("."))


def output(**values: str) -> None:
    for key, value in values.items():
        print(f"{key}={value}")
    if "GITHUB_OUTPUT" in os.environ:
        with open(os.environ["GITHUB_OUTPUT"], "a") as file:
            file.writelines(f"{key}={value}\n" for key, value in values.items())


if __name__ == "__main__":
    main()
