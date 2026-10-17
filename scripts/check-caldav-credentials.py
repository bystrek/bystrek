#!/usr/bin/env python3
"""Check CalDAV Basic authentication without involving the app."""

import argparse
import base64
import getpass
import json
import subprocess
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def check_tsdav(url: str, username: str, password: str) -> int:
    probe = """
import { createDAVClient } from 'tsdav';
const { url, username, password } = JSON.parse(await Bun.stdin.text());
try {
  const client = await createDAVClient({
    serverUrl: url,
    credentials: { username, password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
  const calendars = await client.fetchCalendars();
  console.log(`tsdav: connected (${calendars.length} calendars)`);
} catch (error) {
  console.log(`tsdav: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
"""
    result = subprocess.run(
        ["bun", "--no-env-file", "-e", probe],
        cwd=Path(__file__).resolve().parent.parent / "api",
        input=json.dumps({"url": url, "username": username, "password": password}),
        text=True,
        capture_output=True,
        timeout=45,
        check=False,
    )
    print(result.stdout.strip() or f"tsdav: failed to run (exit {result.returncode})")
    if result.stderr.strip():
        print(f"tsdav process error: {result.stderr.strip()}", file=sys.stderr)
    return result.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url",
        default="https://sync.infomaniak.com/",
        help="CalDAV server URL (default: https://sync.infomaniak.com/)",
    )
    parser.add_argument(
        "--compare-client",
        action="store_true",
        help="also try the app's tsdav library (requires Bun and api dependencies)",
    )
    args = parser.parse_args()
    url = urlsplit(args.url)
    if url.scheme != "https" or not url.hostname or url.username or url.password:
        parser.error("use an HTTPS URL without embedded credentials")

    username = input("CalDAV username: ")
    password = getpass.getpass("App-specific password: ")
    auth = base64.b64encode(f"{username}:{password}".encode()).decode("ascii")
    request = Request(
        args.url,
        data=(
            b'<?xml version="1.0" encoding="utf-8"?>'
            b'<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/>'
            b'</d:prop></d:propfind>'
        ),
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/xml; charset=utf-8",
            "Depth": "0",
        },
        method="PROPFIND",
    )

    try:
        with urlopen(request, timeout=20) as response:
            print(f"HTTP {response.status}: CalDAV authentication accepted")
            if args.compare_client:
                return check_tsdav(args.url, username, password)
            return 0
    except HTTPError as error:
        if error.code == 401:
            print("HTTP 401: CalDAV server rejected these credentials")
        else:
            print(f"HTTP {error.code}: CalDAV server did not accept the request")
        return 1
    except URLError as error:
        print(f"Connection failed: {error.reason}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
