"""Lossless PostgreSQL URI conversion for the explicit configuration migration.

No file writes, environment inputs, database imports or network operations.
Errors deliberately contain no input values. Driver connection policy is separate.
"""
import ipaddress
import re
from urllib.parse import quote, unquote

DATABASE_DEFAULTS = {
    "host": "127.0.0.1", "port": 5432, "database": "canopus",
    "user": "canopus_app", "password": "",
}
INVALID_DATABASE_URL = "database_url must be a PostgreSQL URI without query options or fragments and with valid UTF-8 components"


def _bad():
    return ValueError(INVALID_DATABASE_URL)


def _decode(value):
    if re.search(r"%(?![0-9a-fA-F]{2})", value):
        raise _bad()
    try:
        text = unquote(value, encoding="utf-8", errors="strict")
    except (ValueError, UnicodeError):
        raise _bad() from None
    if "\0" in text:
        raise _bad()
    return text


def _host(value):
    if not isinstance(value, str) or not value or any(ord(c) <= 32 or ord(c) >= 127 for c in value):
        raise _bad()
    if any(c in value for c in "/\\?#@[],%"):
        raise _bad()
    if ":" in value:
        try:
            ipaddress.IPv6Address(value)
        except ValueError:
            raise _bad() from None
    return value


def _port(value):
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 65535:
        raise _bad()
    return value


def dsn_from_fields(fields):
    """Encode the existing five connection fields; reject unknown keys and values."""
    if not isinstance(fields, dict) or set(fields) - set(DATABASE_DEFAULTS):
        raise _bad()
    values = {**DATABASE_DEFAULTS, **fields}
    host = _host(values["host"])
    port = _port(values["port"])
    for key in ("database", "user", "password"):
        value = values[key]
        if not isinstance(value, str) or "\0" in value or (key != "password" and not value):
            raise _bad()
        try:
            value.encode("utf-8", errors="strict")
        except UnicodeError:
            raise _bad() from None
    endpoint = "[" + host + "]" if ":" in host else host
    # URI components, not form encoding: literal plus and reserved characters are escaped.
    authority = quote(values["user"], safe="") + ":" + quote(values["password"], safe="")
    return "postgresql" + "://" + authority + "@" + endpoint + ":" + str(port) + "/" + quote(values["database"], safe="")


def fields_from_dsn(value):
    """Parse the URI subset supported by the current local non-TLS driver."""
    if not isinstance(value, str) or any(ord(c) <= 32 or ord(c) == 127 for c in value):
        raise _bad()
    scheme, separator, rest = value.partition("://")
    if not separator or scheme.lower() not in ("postgresql", "postgres") or "?" in rest or "#" in rest:
        raise _bad()
    authority, _, database = rest.partition("/")
    if "/" in database or authority.count("@") > 1:
        raise _bad()
    result = dict(DATABASE_DEFAULTS)
    if "@" in authority:
        credentials, authority = authority.split("@", 1)
        user, separator, password = credentials.partition(":")
        result["user"] = _decode(user)
        result["password"] = _decode(password) if separator else ""
        if not result["user"]:
            raise _bad()
    if authority.startswith("["):
        host, separator, suffix = authority[1:].partition("]")
        if not separator or ":" not in host or (suffix and not suffix.startswith(":")):
            raise _bad()
        result["host"] = _host(host)
        number = suffix[1:] if suffix else None
    else:
        host, separator, number = authority.partition(":")
        result["host"] = _host(_decode(host)) if host else DATABASE_DEFAULTS["host"]
        number = number if separator else None
    if number is not None:
        if not re.fullmatch(r"[0-9]+", number):
            raise _bad()
        try:
            result["port"] = _port(int(number))
        except ValueError:
            raise _bad() from None
    if database:
        result["database"] = _decode(database)
    return result
