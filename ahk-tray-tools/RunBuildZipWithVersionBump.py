from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


TOOL_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = TOOL_ROOT.parent
MANIFEST_PATH = PROJECT_ROOT / "extension" / "manifest.json"
BUILD_SCRIPT = PROJECT_ROOT / "scripts" / "build-zip.js"
DIST_DIR = PROJECT_ROOT / "dist"
VERSION_RE = re.compile(r'("version"\s*:\s*")([0-9]+(?:\.[0-9]+){0,3})(")')
CREATED_ZIP_RE = re.compile(r"Created\s+(.+?)\s+in dist/", re.IGNORECASE)


def increment_version(version: str) -> str:
    parts = version.split(".")
    if not 1 <= len(parts) <= 4 or not all(part.isdigit() for part in parts):
        raise ValueError(f"Unsupported manifest version format: {version}")

    numbers = [int(part) for part in parts]
    numbers[-1] += 1
    return ".".join(str(number) for number in numbers)


def read_manifest_text() -> tuple[str, bool]:
    raw = MANIFEST_PATH.read_bytes()
    has_bom = raw.startswith(b"\xef\xbb\xbf")
    if has_bom:
        raw = raw[3:]
    return raw.decode("utf-8"), has_bom


def write_manifest_text(text: str, has_bom: bool) -> None:
    data = text.encode("utf-8")
    if has_bom:
        data = b"\xef\xbb\xbf" + data
    MANIFEST_PATH.write_bytes(data)


def bump_manifest_version() -> tuple[str, str]:
    text, has_bom = read_manifest_text()
    manifest = json.loads(text)
    old_version = manifest.get("version")
    if not isinstance(old_version, str):
        raise ValueError('extension/manifest.json does not contain a string "version" field.')

    new_version = increment_version(old_version)
    updated, count = VERSION_RE.subn(rf"\g<1>{new_version}\g<3>", text, count=1)
    if count != 1:
        raise ValueError('Could not update the "version" field in extension/manifest.json.')

    json.loads(updated)
    write_manifest_text(updated, has_bom)
    return old_version, new_version


def run_build_zip() -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(BUILD_SCRIPT)],
        cwd=PROJECT_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def find_zip_path(build_output: str, version: str) -> Path:
    match = CREATED_ZIP_RE.search(build_output)
    if match:
        return DIST_DIR / match.group(1).strip()
    return DIST_DIR / f"{version}.zip"


def main() -> int:
    if not MANIFEST_PATH.exists():
        print(f"Manifest not found: {MANIFEST_PATH}", file=sys.stderr)
        return 1
    if not BUILD_SCRIPT.exists():
        print(f"Build script not found: {BUILD_SCRIPT}", file=sys.stderr)
        return 1

    try:
        old_version, new_version = bump_manifest_version()
    except Exception as exc:
        print(f"Version number increment failed: {exc}", file=sys.stderr)
        return 1

    try:
        result = run_build_zip()
    except FileNotFoundError as exc:
        print(f"Version number incremented: {old_version} -> {new_version}")
        print(f"Could not run build-zip.js: {exc}", file=sys.stderr)
        return 1

    build_output = "\n".join(part for part in [result.stdout.strip(), result.stderr.strip()] if part)
    if result.returncode != 0:
        print(f"Version number incremented: {old_version} -> {new_version}")
        print("build-zip.js failed")
        if build_output:
            print(build_output)
        return result.returncode

    zip_path = find_zip_path(build_output, new_version)
    print(f"Version number incremented: {old_version} -> {new_version}")
    print("build-zip.js ran successfully")
    print(zip_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
