import uuid
from flask import Flask, jsonify, request
from server import _build_assignments

app = Flask(__name__)


def _health_payload():
    return jsonify({
        "status": "OK",
        "service": "solver",
        "timestamp": request.headers.get("Date"),
    })


@app.get("/api/health")
def health():
    return _health_payload()


@app.get("/health")
def health_shortcut():
    return _health_payload()


def _solve_payload():
    payload = request.get_json(force=True, silent=True) or {}
    job_id = payload.get("requestId") or uuid.uuid4().hex
    result = _build_assignments(payload)
    return jsonify({
        "jobId": job_id,
        "status": result["status"],
        "summary": result["summary"],
        "details": result.get("details", {}),
        "request": payload,
    })


@app.post("/api/solve")
def solve_endpoint():
    return _solve_payload()


@app.post("/solve")
def solve_endpoint_shortcut():
    return _solve_payload()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
