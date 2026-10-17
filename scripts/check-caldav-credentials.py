#!/usr/bin/env python3
"""Check CalDAV Basic authentication without involving the app."""

import argparse
import base64
import getpass
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url",
        default="https://sync.infomaniak.com/",
        help="CalDAV server URL (default: https://sync.infomaniak.com/)",
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
