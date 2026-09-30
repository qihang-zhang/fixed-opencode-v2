"""Validate the wrapper's reproducible upstream and tool-version contracts."""

import json
from pathlib import Path
import subprocess
import tomllib


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    upstream = json.loads((root / "upstream.json").read_text())
    config = tomllib.loads((root / "mise.toml").read_text())
    package = json.loads((root / "opencode/package.json").read_text())
    head = subprocess.check_output(
        ["git", "-C", str(root / "opencode"), "rev-parse", "HEAD"], text=True
    ).strip()
    if head != upstream["commit"]:
        raise SystemExit("Submodule HEAD differs from upstream.json; update the pin explicitly.")
    if package["version"] != upstream["tag"].removeprefix("v"):
        raise SystemExit("Upstream package version does not match the pinned release tag.")
    if package["packageManager"] != f"bun@{config['tools']['bun']}":
        raise SystemExit("mise Bun version differs from the upstream packageManager.")
    if (root / ".python-version").read_text().strip() != config["tools"]["python"]:
        raise SystemExit("Python pins differ between mise and uv.")
    status = subprocess.check_output(["git", "-C", str(root / "opencode"), "status", "--porcelain"], text=True)
    if status:
        raise SystemExit(f"Upstream submodule must stay pristine; adapt it from adapters/ instead:\n{status}")
    print(f"Verified {upstream['tag']} ({head}) and tool-version contracts.")


if __name__ == "__main__":
    main()
