"""269: explicit, offline legacy profile conversion. No live configuration writes."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re

TIERS = ("light", "medium", "heavy")
STAGES = ("develop", "develop_accept", "plan", "plan_accept", "spec", "spec_accept", "delivery", "delivery_accept")
INHERIT = {"spec": ("plan", False), "spec_accept": ("plan_accept", False),
           "delivery": ("develop", True), "delivery_accept": ("develop_accept", True)}
ROLES = {"develop": "dev", "develop_accept": "dev_accept"}


def unique_object(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError("duplicate JSON key")
        out[key] = value
    return out


def plan_conversion(raw, mappings, default_weight=None):
    """Pure plan. Unresolved data never becomes an activatable preset."""
    issues, files = [], {}
    if default_weight is not None and default_weight not in TIERS:
        raise ValueError("invalid explicit default weight")
    profiles = raw.get("model_profiles", raw.get("profiles", {}))
    if "model_profiles" in raw and "profiles" in raw and raw["profiles"] != profiles:
        issues.append("conflicting profiles aliases")
    sets = raw.get("profile_sets", {})
    if not isinstance(profiles, dict) or not isinstance(sets, dict):
        return {"unresolved": ["profiles and profile_sets must be objects"], "files": {}, "active_legacy_set": None}
    active = raw.get("profile_set")
    active_name = active if isinstance(active, str) else None
    if active and (active_name is None or active_name not in sets):
        issues.append("active legacy set is unresolved")
    for family, tiers in profiles.items():
        if not re.fullmatch(r"[a-z0-9-]+", family) or not isinstance(tiers, dict) or set(tiers) - set(TIERS):
            issues.append("unsupported profile family or tier")
            continue
        for profile in tiers.values():
            if not isinstance(profile, dict) or set(profile) - {"model", "variant", "context", "input", "output"}:
                issues.append("unsupported profile fields; metadata omitted")
                continue
            model = profile.get("model", "")
            if not isinstance(model, str) or re.search(r"[\s:@?\\]|sk-|api[_-]?key|token=", model, re.I):
                issues.append("unsafe model identifier; metadata omitted")
            variant = profile.get("variant", "")
            if not isinstance(variant, str) or (variant and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", variant)) or re.search(r"sk-|api[_-]?key", str(variant), re.I):
                issues.append("unsafe variant; metadata omitted")
            for window in ("context", "output", "input"):
                if window in profile and (type(profile[window]) is not int or profile[window] <= 0):
                    issues.append("invalid profile window; metadata omitted")
    preserved = {"profiles": copy.deepcopy(profiles), "sets": {}, "profile_set": None} if not issues else {"profiles": {}, "sets": {}, "profile_set": None}
    if any(isinstance(profile, dict) and any(key in profile for key in ("context", "output", "input"))
           for tiers in profiles.values() if isinstance(tiers, dict) for profile in tiers.values()):
        issues.append("context/output/input have no equivalent verified runtime mapping")
    index = {}
    for mapping in mappings:
        key = (mapping.get("family"), mapping.get("model"), mapping.get("variant", ""))
        if key in index:
            raise ValueError("ambiguous mapping")
        source = mapping.get("source", {})
        if set(source) != {"family", "model", "effort"} or not all(isinstance(v, str) for v in source.values()) or not source["family"] or not source["model"]:
            raise ValueError("mapping needs an exact direct ACP source")
        if not re.fullmatch(r"[a-z][a-z0-9_-]{0,39}", source["family"]) or any(re.search(r"[\s:@?\\]|sk-|api[_-]?key|token=", value, re.I) for value in source.values()):
            raise ValueError("unsafe mapping identifier")
        index[key] = copy.deepcopy(source)
    for name, original in sets.items():
        local = []
        if not isinstance(name, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,39}", name) or not isinstance(original, dict):
            issues.append("invalid legacy set name or shape")
            continue
        cells = copy.deepcopy(original)
        for cell in original.values():
            if not isinstance(cell, dict) or set(cell) != {"family", "tier"} or not isinstance(cell.get("family"), str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,39}", cell["family"]) or cell.get("tier") not in (*TIERS, "task"):
                local.append("unsupported or unsafe stage cell; metadata omitted")
        if not local:
            preserved["sets"][name] = copy.deepcopy(original)
        if "accept" in cells:
            # Matches the existing reader: the canonical spelling wins.
            cells.setdefault("develop_accept", cells["accept"])
            del cells["accept"]
        if set(cells) - set(STAGES):
            local.append("unknown legacy stage")
        used = {}
        inheritance = {}

        def cell_for(stage):
            if stage in cells:
                return cells[stage], False
            if stage in INHERIT:
                parent, lower = INHERIT[stage]
                cell, parent_lower = cell_for(parent)
                inheritance[stage] = {"from": parent, "lower": lower}
                return cell, lower or parent_lower
            return None, False

        def resolve(cell, lower, weight):
            if not isinstance(cell, dict) or set(cell) != {"family", "tier"}:
                raise ValueError("missing or invalid stage cell (spawn_models needs explicit resolution)")
            family, tier = cell["family"], cell["tier"]
            if not isinstance(family, str) or tier not in (*TIERS, "task"):
                raise ValueError("invalid family or legacy tier")
            tier = weight if tier == "task" else tier
            if tier is None:
                raise ValueError("task tier needs an explicit default weight")
            rank = TIERS.index(tier)
            if lower:
                rank = max(0, rank - 1)
            for bound, upper in ((raw.get("tier_max"), True), (raw.get("tier_min"), False)):
                if bound is not None:
                    if bound not in TIERS:
                        raise ValueError("invalid legacy tier bounds")
                    rank = min(rank, TIERS.index(bound)) if upper else max(rank, TIERS.index(bound))
            profile = profiles.get(family, {}).get(TIERS[rank])
            if not isinstance(profile, dict) or set(profile) - {"model", "variant", "context", "input", "output"}:
                raise ValueError("missing profile or unsupported profile fields")
            model = profile.get("model")
            if not isinstance(model, str) or "/" not in model or not model:
                raise ValueError("profile needs an explicit provider/model")
            base, sep, suffix = model.partition("#")
            variant = profile.get("variant", suffix if sep else "")
            if not isinstance(variant, str) or (sep and variant != suffix):
                raise ValueError("conflicting variant")
            for key in ("context", "input", "output"):
                if key in profile and (type(profile[key]) is not int or profile[key] <= 0):
                    raise ValueError("invalid profile window")
            source = index.get((family, base, variant))
            if source is None:
                raise ValueError("no explicit ACP mapping for profile")
            used.setdefault(family, {})[TIERS[rank]] = copy.deepcopy(profile)
            return copy.deepcopy(source)

        roles = {}
        for stage in STAGES:
            cell, lower = cell_for(stage)
            try:
                base = resolve(cell, lower, default_weight)
                overrides = {weight: resolve(cell, lower, weight) for weight in TIERS} if isinstance(cell, dict) and cell.get("tier") == "task" else {}
                roles[ROLES.get(stage, stage)] = {"default": base, "by_weight": overrides} if overrides else base
            except (ValueError, TypeError, AttributeError) as error:
                local.append(f"{stage}: {error}")
        if raw.get("tier_min") in TIERS and raw.get("tier_max") in TIERS and TIERS.index(raw["tier_min"]) > TIERS.index(raw["tier_max"]):
            local.append("inverted legacy tier bounds")
        if local:
            issues.extend(f"{name}: {item}" for item in local)
        else:
            files[f"{name}.json"] = {"description": "Converted legacy preset; activation is a separate owner action", "roles": roles,
                "migration": {"profiles": copy.deepcopy(profiles), "stages": {k: copy.deepcopy(v) for k, v in original.items() if k in (*STAGES, "accept")},
                              "inheritance": inheritance, "default_weight": default_weight,
                              "was_active": raw.get("profile_set") == name,
                              "profiles_key": "model_profiles" if "model_profiles" in raw else "profiles",
                              "tier_min": raw.get("tier_min"), "tier_max": raw.get("tier_max")}}
    if active_name in preserved["sets"]:
        preserved["profile_set"] = active_name
    # No partial batch that could hide unresolved active or inherited assignments.
    return {"unresolved": issues, "files": {} if issues else files,
            "active_legacy_set": preserved["profile_set"], "preserved": preserved}


def write_new_directory(plan, destination):
    if plan["unresolved"]:
        raise ValueError("unresolved conversion cannot be written as presets")
    destination = Path(destination)
    destination.mkdir(parents=False, exist_ok=False)
    for name, data in plan["files"].items():
        with (destination / name).open("x", encoding="utf-8", newline="\n") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--mapping", type=Path, required=True)
    parser.add_argument("--default-weight", choices=TIERS)
    parser.add_argument("--write-new-directory", type=Path)
    args = parser.parse_args()
    original = args.source.read_bytes()
    raw = json.loads(original.decode("utf-8-sig"), object_pairs_hook=unique_object)
    mappings = json.loads(args.mapping.read_text(encoding="utf-8-sig"), object_pairs_hook=unique_object)
    plan = plan_conversion(raw, mappings, args.default_weight)
    if args.write_new_directory:
        write_new_directory(plan, args.write_new_directory)
    # Do not print source configuration, model identifiers, paths or credentials.
    print(json.dumps({"dry_run": not bool(args.write_new_directory), "source_sha256": hashlib.sha256(original).hexdigest(),
                      "preset_count": len(plan["files"]), "unresolved": plan["unresolved"], "activated": False}))
    return 1 if plan["unresolved"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
