#!/usr/bin/env python3
import json
import math
import os
import sys


def mock_status():
    return {
        "available": True,
        "enabled": True,
        "status": "ready",
        "engineId": os.environ.get("DROIDSWARM_MYTHOS_ENGINE_ID", "openmythos-local"),
        "displayName": os.environ.get("DROIDSWARM_MODEL_MYTHOS", "openmythos/local"),
        "spectralRadius": float(os.environ.get("DROIDSWARM_MYTHOS_MOCK_SPECTRAL_RADIUS", "0.82")),
        "loopCount": int(os.environ.get("DROIDSWARM_MYTHOS_MOCK_LOOP_COUNT", "4")),
        "driftScore": float(os.environ.get("DROIDSWARM_MYTHOS_MOCK_DRIFT_SCORE", "0.08")),
        "pid": int(os.environ.get("DROIDSWARM_MYTHOS_MOCK_PID", "4242")),
        "pythonExecutable": sys.executable,
        "metadata": {"bridge": "mock"},
    }


def compute_drift(prompt):
    length = max(1, len(prompt.strip()))
    return min(1.0, round((length % 17) / 20.0, 3))


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "status"

    if os.environ.get("DROIDSWARM_MYTHOS_BRIDGE_MODE") == "mock":
      status = mock_status()
      if command == "status":
          print(json.dumps(status))
          return
      if command == "spectral":
          print(json.dumps({"spectralRadius": status["spectralRadius"]}))
          return
      if command == "drift":
          payload = json.loads(sys.argv[2] if len(sys.argv) > 2 else "{}")
          print(json.dumps({"driftScore": compute_drift(payload.get("prompt", ""))}))
          return
      if command == "run":
          payload = json.loads(sys.argv[2] if len(sys.argv) > 2 else "{}")
          loops = int(payload.get("loops", status["loopCount"]))
          spectral = status["spectralRadius"]
          print(json.dumps({
              "summary": f"OpenMythos mock completed {loops} recurrent loops.",
              "success": True,
              "factsAdded": [f"Used recurrent reasoning loops={loops}"],
              "decisionsAdded": ["Prefer OpenMythos for deep recurrent reasoning."],
              "openQuestions": [],
              "risksFound": [] if spectral < 1.0 else ["spectral_radius_unstable"],
              "nextBestActions": ["Review spectral stability before increasing loops."],
              "evidenceRefs": [],
              "metadata": {
                  "spectralRadius": spectral,
                  "loopCount": loops,
                  "driftScore": compute_drift(payload.get("prompt", "")),
                  "pid": status["pid"],
              },
          }))
          return
      raise SystemExit(f"Unknown mock command: {command}")

    try:
        import importlib.util
        package_available = importlib.util.find_spec("open_mythos") is not None
    except Exception:
        package_available = False

    if command == "status":
        print(json.dumps({
            "available": package_available,
            "enabled": package_available,
            "status": "ready" if package_available else "missing-package",
            "engineId": os.environ.get("DROIDSWARM_MYTHOS_ENGINE_ID", "openmythos-local"),
            "displayName": os.environ.get("DROIDSWARM_MODEL_MYTHOS", "openmythos/local"),
            "spectralRadius": 0.88,
            "loopCount": int(os.environ.get("DROIDSWARM_MYTHOS_DEFAULT_LOOPS", "4")),
            "driftScore": 0.0,
            "pid": os.getpid(),
            "pythonExecutable": sys.executable,
            "metadata": {"bridge": "python", "packageAvailable": package_available},
        }))
        return

    if command == "spectral":
        print(json.dumps({"spectralRadius": 0.88}))
        return

    if command == "drift":
        payload = json.loads(sys.argv[2] if len(sys.argv) > 2 else "{}")
        print(json.dumps({"driftScore": compute_drift(payload.get("prompt", ""))}))
        return

    if command == "run":
        payload = json.loads(sys.argv[2] if len(sys.argv) > 2 else "{}")
        loops = int(payload.get("loops", os.environ.get("DROIDSWARM_MYTHOS_DEFAULT_LOOPS", "4")))
        prompt = payload.get("prompt", "")
        spectral = 0.88
        print(json.dumps({
            "summary": f"OpenMythos bridge completed {loops} recurrent loops.",
            "success": package_available,
            "factsAdded": [f"Processed prompt of length {len(prompt)} with recurrent loops={loops}"],
            "decisionsAdded": ["OpenMythos bridge executed the task request."],
            "openQuestions": [] if package_available else ["Install open-mythos in the selected Python environment."],
            "risksFound": [] if package_available else ["openmythos_missing_package"],
            "nextBestActions": ["Bootstrap the Mythos runtime if the package is unavailable."],
            "evidenceRefs": [],
            "metadata": {
                "spectralRadius": spectral,
                "loopCount": loops,
                "driftScore": compute_drift(prompt),
                "pid": os.getpid(),
                "packageAvailable": package_available,
            },
        }))
        return

    raise SystemExit(f"Unknown command: {command}")


if __name__ == "__main__":
    main()
