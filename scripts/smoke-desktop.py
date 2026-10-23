"""Exercise the real Tauri window through an already-running tauri-driver.

Uses only Python's standard library. Never changes the user's vault or integrations.
"""
import argparse
import base64
import json
from pathlib import Path
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--driver-url', default='http://127.0.0.1:4444')
    parser.add_argument('--application', default=str(Path(__file__).resolve().parents[1] / 'target/debug/cosmos-desktop'))
    parser.add_argument('--evidence-dir', type=Path)
    args = parser.parse_args()

    def request(method, path, payload=None):
        req = urllib.request.Request(args.driver_url + path, method=method,
            data=None if payload is None else json.dumps(payload).encode(),
            headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)['value']

    response = request('POST', '/session', {'capabilities': {'alwaysMatch': {'tauri:options': {'application': args.application}}}})
    session = '/session/' + response['sessionId']
    try:
        def execute(script):
            return request('POST', session + '/execute/sync', {'script': script, 'args': []})
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            heading = execute('return document.querySelector("h1")?.textContent;')
            if heading:
                break
            time.sleep(0.1)
        assert heading and 'Toda ideia nasce no Caos.' in heading, heading
        assert execute('return document.title;') == 'COSMOS'
        runtime = request('POST', session + '/execute/async', {'script': '''
            const done = arguments[arguments.length - 1];
            window.__TAURI_INTERNALS__.invoke('runtime_info').then(done).catch(error => done({error:String(error)}));
        ''', 'args': []})
        assert runtime == {'protocol_version': 1, 'application_version': '0.0.0', 'capabilities': []}, runtime
        if args.evidence_dir:
            args.evidence_dir.mkdir(parents=True, exist_ok=True)
            (args.evidence_dir / 'desktop.png').write_bytes(base64.b64decode(request('GET', session + '/screenshot')))
        execute('const select = document.querySelector("select"); select.value = "en"; select.dispatchEvent(new Event("change", {bubbles:true}));')
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if 'Every idea begins in Chaos.' in execute('return document.querySelector("h1").textContent;'):
                break
            time.sleep(0.1)
        assert execute('return document.documentElement.lang;') == 'en'
        assert 'Every idea begins in Chaos.' in execute('return document.querySelector("h1").textContent;')
        result = {'result': 'passed', 'checks': ['native render', 'Rust IPC runtime_info', 'language switch'], 'runtime': runtime}
        if args.evidence_dir:
            (args.evidence_dir / 'desktop-smoke.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result))
    finally:
        request('DELETE', session)


if __name__ == '__main__':
    main()
