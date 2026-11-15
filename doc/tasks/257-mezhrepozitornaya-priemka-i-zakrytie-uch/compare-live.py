"""Run the unchanged live entry on two exact commits and retain full assertions and exits."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def parse_tests(raw):
    text = re.sub(r"\x1b\[[0-9;]*m", "", raw.decode("utf-8", errors="replace"))
    tests = {}
    active = None
    for line in text.splitlines():
        match = re.match(r"^  (PASS|FAIL): (.+?)(?: — (.*))?$", line)
        if match:
            status, title, details = match.groups()
            tests[title] = {"status": status, "assertions": details or ""}
            active = title if status == "FAIL" else None
        elif re.match(r"^\d+/\d+ passed$", line) or line.startswith("--- stderr"):
            active = None
        elif active is not None:
            tests[active]["assertions"] += "\n" + line
    return tests


def comparison(baseline, candidate):
    complete = len(baseline["tests"]) == 9 and len(candidate["tests"]) == 9
    identical = complete and baseline["tests"] == candidate["tests"]
    differences = {}
    for title in sorted(baseline["tests"].keys() | candidate["tests"].keys()):
        before = baseline["tests"].get(title)
        after = candidate["tests"].get(title)
        if before != after:
            differences[title] = {"baseline": before, "candidate": after}
    return {"baseline": baseline, "candidate": candidate,
            "complete_test_discovery": complete, "exact_assertions_equal": identical,
            "differences": differences}


def run_side(name, directory, expected, nova, output):
    sha = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=directory, text=True
    ).strip()
    if sha != expected:
        raise RuntimeError(f"{name}: unexpected HEAD {sha}, expected {expected}")
    dirty = subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=directory, text=True
    ).strip()
    if dirty:
        raise RuntimeError(f"{name}: working tree is not clean")
    command = [nova, "test", "src/server_route_live/routes_live_test.nv",
               "--jobs", "1", "--timeout", "900", "--verbose", "--keep-artifacts"]
    env = {**os.environ, "NOVA_DEBUG_RUN_DUMP": "1", "NO_COLOR": "1"}
    completed = subprocess.run(command, cwd=directory, env=env,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               timeout=2400)
    log = output / f"{name}.log"
    log.write_bytes(completed.stdout)
    return {"sha": sha, "exit": completed.returncode, "command": command,
            "log": log.name, "tests": parse_tests(completed.stdout)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--baseline-sha", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--nova", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--reparse", action="store_true", help="Reparse retained logs without running tests or changing their exits")
    args = parser.parse_args()
    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True)
    if args.reparse:
        saved = json.loads((output / "comparison.json").read_text(encoding="utf-8"))
        baseline, candidate = saved["baseline"], saved["candidate"]
        if baseline["sha"] != args.baseline_sha or candidate["sha"] != args.candidate_sha:
            raise RuntimeError("Retained report belongs to other commits")
        for side in (baseline, candidate):
            side["tests"] = parse_tests((output / side["log"]).read_bytes())
        destination = output / "comparison-reparsed.json"
    else:
        baseline = run_side("baseline", args.baseline, args.baseline_sha, args.nova, output)
        (output / "baseline.json").write_text(json.dumps(baseline, ensure_ascii=False, indent=2), encoding="utf-8")
        candidate = run_side("candidate", args.candidate, args.candidate_sha, args.nova, output)
        destination = output / "comparison.json"
    # Keep exact assertion text: equal directory names or merely equal failing test titles do not establish equivalence.
    report = comparison(baseline, candidate)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Baseline: exit {baseline['exit']}, тестов {len(baseline['tests'])}")
    print(f"Кандидат: exit {candidate['exit']}, тестов {len(candidate['tests'])}")
    print(f"Точные assertions совпали: {report['exact_assertions_equal']}; отчёт: {destination}")
    # Equality of two red runs is evidence about attribution, never a green regression gate.
    return 0 if report["complete_test_discovery"] and baseline["exit"] == 0 and candidate["exit"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
