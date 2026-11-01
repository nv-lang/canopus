import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).with_name("convert-model-presets.py")
spec = importlib.util.spec_from_file_location("converter", SCRIPT)
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


def fixture(windows=False):
    profiles, mappings = {}, []
    for family in ("alpha", "beta"):
        profiles[family] = {}
        for tier in converter.TIERS:
            profiles[family][tier] = {"model": f"provider/{family}-{tier}#native", "variant": "native"}
            if windows:
                profiles[family][tier].update(context=1000, output=200, input=800)
            mappings.append({"family": family, "model": f"provider/{family}-{tier}", "variant": "native",
                             "source": {"family": family, "model": f"acp-{tier}", "effort": "exact-native"}})
    stages = {"develop": {"family": "alpha", "tier": "task"}, "accept": {"family": "beta", "tier": "heavy"},
              "plan": {"family": "alpha", "tier": "heavy"}, "plan_accept": {"family": "beta", "tier": "medium"}}
    return {"model_profiles": profiles, "profile_sets": {"sample": stages}, "profile_set": "sample"}, mappings


class ConversionTests(unittest.TestCase):
    def test_exact_mapping_inheritance_aliases_and_no_mutation(self):
        raw, mappings = fixture()
        before = copy.deepcopy(raw)
        plan = converter.plan_conversion(raw, mappings, "medium")
        self.assertEqual(plan["unresolved"], [])
        preset = plan["files"]["sample.json"]
        self.assertEqual(preset["roles"]["dev"]["default"]["model"], "acp-medium")
        self.assertEqual(preset["roles"]["dev"]["by_weight"]["heavy"]["effort"], "exact-native")
        self.assertEqual(preset["roles"]["dev_accept"]["family"], "beta")
        self.assertEqual(preset["roles"]["delivery"]["by_weight"]["heavy"]["model"], "acp-medium")
        self.assertEqual(preset["roles"]["spec"], preset["roles"]["plan"])
        self.assertEqual(preset["migration"]["profiles"], raw["model_profiles"])
        self.assertIn("accept", preset["migration"]["stages"])
        self.assertEqual(raw, before)

    def test_unresolved_never_emits_presets(self):
        raw, mappings = fixture()
        self.assertTrue(converter.plan_conversion(raw, mappings)["unresolved"])
        self.assertEqual(converter.plan_conversion(raw, [], "medium")["files"], {})
        raw["model_profiles"]["alpha"]["light"]["api_key"] = "not-a-real-credential"
        plan = converter.plan_conversion(raw, mappings, "medium")
        self.assertEqual(plan["files"], {})
        self.assertNotIn("not-a-real-credential", json.dumps(plan))

    def test_windows_preserved_but_not_falsely_migrated(self):
        raw, mappings = fixture(windows=True)
        plan = converter.plan_conversion(raw, mappings, "medium")
        self.assertEqual(plan["files"], {})
        self.assertIn("context/output/input have no equivalent verified runtime mapping", plan["unresolved"])
        self.assertEqual(plan["preserved"]["profiles"], raw["model_profiles"])
        self.assertEqual(plan["preserved"]["sets"], raw["profile_sets"])
        self.assertEqual(plan["preserved"]["profile_set"], raw["profile_set"])

    def test_ambiguity_rejected(self):
        raw, mappings = fixture()
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            converter.plan_conversion(raw, mappings + [mappings[0]], "medium")
        with self.assertRaises(ValueError):
            json.loads('{"a":1,"a":2}', object_pairs_hook=converter.unique_object)

    def test_canonical_alias_and_bounds(self):
        raw, mappings = fixture()
        raw["profile_sets"]["sample"]["develop_accept"] = {"family": "beta", "tier": "light"}
        raw["tier_min"], raw["tier_max"] = "medium", "medium"
        plan = converter.plan_conversion(raw, mappings, "heavy")
        self.assertEqual(plan["unresolved"], [])
        roles = plan["files"]["sample.json"]["roles"]
        self.assertEqual(roles["dev_accept"]["model"], "acp-medium")
        self.assertEqual(roles["delivery"]["by_weight"]["heavy"]["model"], "acp-medium")

    def test_shadowed_alias_cannot_leak_unknown_fields(self):
        raw, mappings = fixture()
        raw["profile_sets"]["sample"]["develop_accept"] = {"family": "beta", "tier": "light"}
        raw["profile_sets"]["sample"]["accept"]["credential"] = "do-not-copy"
        plan = converter.plan_conversion(raw, mappings, "medium")
        self.assertEqual(plan["files"], {})
        self.assertNotIn("do-not-copy", json.dumps(plan))

    def test_dry_run_write_and_repeat_preserve_bytes(self):
        approved = Path(os.environ["LOCALAPPDATA"]) / "Temp" / "opencode" if os.name == "nt" else None
        with tempfile.TemporaryDirectory(dir=approved) as directory:
            root = Path(directory)
            raw, mappings = fixture()
            source, mapping, target = root / "source.json", root / "mapping.json", root / "new-presets"
            original = (json.dumps(raw, indent=3) + "\r\n").encode()
            source.write_bytes(original)
            mapping.write_text(json.dumps(mappings), encoding="utf-8")
            command = [sys.executable, str(SCRIPT), str(source), "--mapping", str(mapping), "--default-weight", "medium"]
            before = sorted(p.name for p in root.iterdir())
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(sorted(p.name for p in root.iterdir()), before)
            self.assertFalse(json.loads(result.stdout)["activated"])
            write = command + ["--write-new-directory", str(target)]
            self.assertEqual(subprocess.run(write, capture_output=True).returncode, 0)
            preset_bytes = (target / "sample.json").read_bytes()
            self.assertNotEqual(subprocess.run(write, capture_output=True).returncode, 0)
            self.assertEqual((target / "sample.json").read_bytes(), preset_bytes)
            self.assertEqual(source.read_bytes(), original)
            existing = root / "existing-file"
            existing.write_bytes(b"keep")
            with self.assertRaises(FileExistsError):
                converter.write_new_directory(converter.plan_conversion(raw, mappings, "medium"), existing)
            self.assertEqual(existing.read_bytes(), b"keep")
            unresolved_target = root / "unresolved"
            with self.assertRaises(ValueError):
                converter.write_new_directory(converter.plan_conversion(raw, []), unresolved_target)
            self.assertFalse(unresolved_target.exists())

    def test_old_nova_preset_is_not_misinterpreted_as_legacy(self):
        plan = converter.plan_conversion({"roles": {"dev": {"family": "alpha"}}}, [])
        self.assertEqual(plan["files"], {})


if __name__ == "__main__":
    unittest.main()
