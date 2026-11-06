"""Regression checks for the pure database connection migration utility."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "lib"))
from canopus_database_url import DATABASE_DEFAULTS, dsn_from_fields, fields_from_dsn


class DatabaseUrlTests(unittest.TestCase):
    def test_reserved_unicode_and_ipv6_roundtrip(self):
        for host in ["localhost", "127.0.0.1", "::1", "2001:db8::1"]:
            fields = {"host": host, "port": 15432, "database": "база/name+?", "user": "u" + "+ю:/@", "password": "p" + "+@:/%? #пароль"}
            uri = dsn_from_fields(fields)
            self.assertEqual(fields_from_dsn(uri), fields)
            self.assertIn("%2B", uri)
            self.assertNotIn("пароль", uri)

    def test_defaults_alias_and_literal_plus(self):
        self.assertEqual(fields_from_dsn("postgresql://"), DATABASE_DEFAULTS)
        parsed = fields_from_dsn("POSTGRES://" + "u:p+word@localhost/db+name")
        self.assertEqual(parsed["password"], "p+word")
        self.assertEqual(parsed["database"], "db+name")
        self.assertEqual(fields_from_dsn(dsn_from_fields({})), DATABASE_DEFAULTS)

    def test_invalid_uri_and_fields_do_not_leak_input(self):
        tails = ["u:pw@localhost:0/db", "u:pw@localhost:65536/db", "u:pw@localhost:+1/db", "u:pw@localhost:/db", "u:pw@::1/db", "u:pw@[::1/db", "u:pw@[::1]extra/db", "u:pw@localhost/db/path", "u:pw@localhost/db?sslmode=require", "u:pw@localhost/db#fragment", "u:pw@localhost/%GG", "u:pw@localhost/%FF", "u:pw@localhost/%00", "u:pw@localhost/db name", "u:pw@host@localhost/db", ":pw@localhost/db"]
        for tail in tails:
            with self.subTest(tail=tail):
                with self.assertRaises(ValueError) as caught:
                    fields_from_dsn("postgresql://" + tail)
                self.assertNotIn("pw", str(caught.exception))
                self.assertNotIn(tail, str(caught.exception))
        for fields in [{"port": True}, {"port": "5432"}, {"host": "::bad::"}, {"user": ""}, {"password": "p" + "\0"}, {"sslmode": "require"}]:
            with self.assertRaises(ValueError):
                dsn_from_fields(fields)

    def test_no_input_mutation(self):
        fields = {"port": 15432, "password": "pw"}
        saved = dict(fields)
        fields_from_dsn(dsn_from_fields(fields))
        self.assertEqual(fields, saved)


if __name__ == "__main__":
    unittest.main()
