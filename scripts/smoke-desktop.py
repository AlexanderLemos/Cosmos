"""Exercise the real Tauri window through an already-running tauri-driver.

Uses only Python's standard library. Never changes the user's vault or integrations.
"""
import argparse
import base64
import json
import subprocess
import tempfile
from pathlib import Path
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--driver-url', default='http://127.0.0.1:4444')
    parser.add_argument('--application', default=str(Path(__file__).resolve().parents[1] / 'target/debug/cosmos-desktop'))
    parser.add_argument('--evidence-dir', type=Path)
    parser.add_argument('--exercise-vault', action='store_true', help='Linux/X11: choose a temporary vault with xdotool and test the editor')
    args = parser.parse_args()
    if args.evidence_dir:
        (args.evidence_dir / 'desktop-smoke.json').unlink(missing_ok=True)

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
        assert runtime == {'protocol_version': 1, 'application_version': '0.0.0', 'capabilities': ['vault.read', 'vault.write', 'vault.search', 'vault.move', 'vault.trash', 'vault.restore', 'projects.create']}, runtime
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
        checks = ['native render', 'Rust IPC runtime_info', 'language switch']
        if args.exercise_vault:
            # The evidence directory must be writable/visible inside the desktop runtime namespace.
            parent = args.evidence_dir
            if parent:
                parent.mkdir(parents=True, exist_ok=True)
            vault = Path(tempfile.mkdtemp(prefix='native-vault-', dir=parent))
            def wait(script):
                until = time.monotonic() + 15
                while time.monotonic() < until:
                    if execute(script):
                        return
                    time.sleep(0.1)
                raise AssertionError('native condition timed out: ' + script)
            def click(text):
                execute('const button = [...document.querySelectorAll("button")].find(b => b.textContent === ' + json.dumps(text) + '); if (!button) throw new Error("button missing"); button.click();')
            def type_into(selector, value):
                element = request('POST', session + '/element', {'using': 'css selector', 'value': selector})
                element_id = element['element-6066-11e4-a52e-4f735466cecf']
                request('POST', session + '/element/' + element_id + '/value', {'text': value.replace('\n', '\ue007')})
            click('Choose vault')
            subprocess.run(['xdotool', 'search', '--sync', '--onlyvisible', '--name', 'Select Folder', 'windowfocus'], check=True, timeout=10, stdout=subprocess.DEVNULL)
            subprocess.run(['xdotool', 'key', 'ctrl+l'], check=True)
            subprocess.run(['xdotool', 'type', '--clearmodifiers', str(vault) + '/'], check=True)
            subprocess.run(['xdotool', 'key', 'Return'], check=True)
            time.sleep(0.4)
            subprocess.run(['xdotool', 'key', 'Return'], check=True)
            wait('return document.querySelector("h1")?.textContent === ' + json.dumps(vault.name))
            type_into('input[placeholder]', 'Native.md')
            click('Create note')
            wait('return document.querySelector(".cm-content")?.contentEditable === "true"')
            type_into('.cm-content', '# Native note\nWritten through cosmosd.')
            wait('return document.body.innerText.includes("Unsaved changes")')
            assert execute('return [...document.querySelectorAll("button")].find(b => b.textContent === "Move note").disabled;')
            click('Save')
            wait('return document.body.innerText.includes("Saved to vault.")')
            assert (vault / 'Native.md').read_text() == '# Native note\nWritten through cosmosd.'
            click('Move note')
            element = request('POST', session + '/element', {'using': 'css selector', 'value': 'input[aria-label="Destination path"]'})
            request('POST', session + '/element/' + element['element-6066-11e4-a52e-4f735466cecf'] + '/clear', {})
            type_into('input[aria-label="Destination path"]', 'Folder/Moved.md')
            click('Confirm move')
            wait('return document.body.innerText.includes("Note moved.")')
            assert not (vault / 'Native.md').exists()
            original = (vault / 'Folder/Moved.md').read_bytes()
            click('Move to trash')
            click('Confirm move to trash')
            wait('return document.body.innerText.includes("Note moved to trash.")')
            assert not (vault / 'Folder/Moved.md').exists()
            click('Folder/Moved.md')
            click('Restore note')
            wait('return document.body.innerText.includes("Note restored.")')
            assert (vault / 'Folder/Moved.md').read_bytes() == original
            assert execute('return document.body.innerText.includes("The trash is empty.");')
            # Create a real project with the same native transport.
            execute('const select = [...document.querySelectorAll("select")].find(s => [...s.options].some(o => o.value === "project")); select.value = "project"; select.dispatchEvent(new Event("change", {bubbles:true}));')
            wait('return document.body.innerText.includes("Project name")')
            type_into('input[placeholder]', 'Native project')
            click('Create project')
            wait('return document.querySelector("h2")?.textContent === "context.md"')
            wait('return ![...document.querySelectorAll("button")].find(b => b.textContent === "Refresh list").disabled')
            project = vault / 'Universos/Pessoal/Native project'
            assert len(list(project.glob('*.md'))) == 6
            metadata = json.loads((project / 'project.cosmos.json').read_text())
            assert metadata['format_version'] == 1 and metadata['bindings'] == []
            assert not (vault / 'cosmos.db').exists()
            assert execute('return [...document.querySelectorAll("button")].find(b => b.textContent === "Move note").disabled;')
            checks += ['native folder consent', 'CodeMirror save via daemon', 'move, trash and restore via daemon', 'protected project structure', 'project documents on disk']
            if args.evidence_dir:
                (args.evidence_dir / 'desktop-vault.png').write_bytes(base64.b64decode(request('GET', session + '/screenshot')))
        result = {'result': 'passed', 'checks': checks, 'runtime': runtime}
        if args.evidence_dir:
            (args.evidence_dir / 'desktop-smoke.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result))
    finally:
        request('DELETE', session)


if __name__ == '__main__':
    main()
