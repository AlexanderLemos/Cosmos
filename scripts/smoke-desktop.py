"""Exercise the real Tauri window through an already-running tauri-driver or native WebKitGTK driver.

Uses only Python's standard library. Never changes the user's vault or integrations.
"""
import argparse
import base64
import json
import os
import signal
import subprocess
import tempfile
from pathlib import Path
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--driver-url', default='http://127.0.0.1:4444')
    parser.add_argument('--native-webkit', action='store_true', help='Linux: connect directly to WebKitWebDriver launched with TAURI_WEBVIEW_AUTOMATION=true')
    parser.add_argument('--application', default=str(Path(__file__).resolve().parents[1] / 'target/debug/cosmos-desktop'))
    parser.add_argument('--evidence-dir', type=Path)
    parser.add_argument('--exercise-vault', action='store_true', help='Linux/X11: choose a temporary vault with xdotool and test the editor')
    args = parser.parse_args()
    capabilities = {'capabilities': {'alwaysMatch': (
        {'webkitgtk:browserOptions': {'binary': args.application, 'args': []}}
        if args.native_webkit else {'tauri:options': {'application': args.application}}
    )}}
    if args.evidence_dir:
        (args.evidence_dir / 'desktop-smoke.json').unlink(missing_ok=True)

    def request(method, path, payload=None):
        req = urllib.request.Request(args.driver_url + path, method=method,
            data=None if payload is None else json.dumps(payload).encode(),
            headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)['value']

    def application_pids():
        found = set()
        for proc in Path('/proc').iterdir():
            if not proc.name.isdigit():
                continue
            try:
                if (proc / 'cmdline').read_bytes().split(b'\0')[0] == os.fsencode(args.application):
                    found.add(int(proc.name))
            except (FileNotFoundError, PermissionError):
                pass
        return found
    previous_pids = application_pids() if args.exercise_vault else set()
    response = request('POST', '/session', capabilities)
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
        assert runtime == {'protocol_version': 1, 'application_version': '0.0.0', 'capabilities': ['vault.read', 'vault.write', 'vault.search', 'vault.move', 'vault.trash', 'vault.restore', 'vault.watch', 'vault.images', 'vault.pdfs', 'projects.create']}, runtime
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
                wait('const button = [...document.querySelectorAll("button")].find(b => b.textContent === ' + json.dumps(text) + '); return button && !button.disabled;')
                execute('const button = [...document.querySelectorAll("button")].find(b => b.textContent === ' + json.dumps(text) + '); if (!button) throw new Error("button missing"); button.click();')
            def type_into(selector, value):
                element = request('POST', session + '/element', {'using': 'css selector', 'value': selector})
                element_id = element['element-6066-11e4-a52e-4f735466cecf']
                request('POST', session + '/element/' + element_id + '/value', {'text': value.replace('\n', '\ue007')})
            def choose_vault():
                click('Choose vault')
                subprocess.run(['xdotool', 'search', '--sync', '--onlyvisible', '--name', 'Select Folder', 'windowfocus'], check=True, timeout=10, stdout=subprocess.DEVNULL)
                subprocess.run(['xdotool', 'key', 'ctrl+l'], check=True)
                subprocess.run(['xdotool', 'type', '--clearmodifiers', str(vault) + '/'], check=True)
                subprocess.run(['xdotool', 'key', 'Return'], check=True)
                time.sleep(0.4)
                subprocess.run(['xdotool', 'key', 'Return'], check=True)
                wait('return document.querySelector("h1")?.textContent === ' + json.dumps(vault.name))
            choose_vault()
            type_into('input[placeholder]', 'Native.md')
            click('Create note')
            wait('return document.querySelector(".cm-content")?.contentEditable === "true"')
            type_into('.cm-content', '# Native note\nWritten through cosmosd.')
            wait('return document.body.innerText.includes("Unsaved changes")')
            wait('return document.body.innerText.includes("Draft protected on this device.")')
            assert (vault / 'Native.md').read_bytes() == b''
            # Kill only the application created by this test, without beforeunload handlers.
            owned = application_pids() - previous_pids
            assert len(owned) == 1, owned
            os.kill(owned.pop(), signal.SIGKILL)
            try:
                request('DELETE', session)
            except urllib.error.HTTPError as error:
                if error.code != 404:
                    raise
            reopened = request('POST', '/session', capabilities)
            session = '/session/' + reopened['sessionId']
            wait('return !!document.querySelector("select")')
            execute('const select = document.querySelector("select"); select.value = "en"; select.dispatchEvent(new Event("change", {bubbles:true}));')
            wait('return document.body.innerText.includes("Choose vault")')
            choose_vault()
            wait('return document.body.innerText.includes("Recover draft")')
            click('Recover draft')
            wait('return document.querySelector(".cm-content")?.textContent.includes("Written through cosmosd.")')
            assert (vault / 'Native.md').read_bytes() == b''
            assert execute('return [...document.querySelectorAll("button")].find(b => b.textContent === "Move note").disabled;')
            execute('window.smokeEditor = document.querySelector(".cm-content");')
            click('Edit and read')
            wait("""return document.querySelector('section[aria-label="Markdown preview"] h1')?.textContent === 'Native note'""")
            click('Read')
            assert execute('return document.querySelector(".cm-content").getClientRects().length === 0;')
            click('Edit and read')
            assert execute('return document.querySelector(".cm-content") === window.smokeEditor;')
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
            # Real disk changes, independent of the daemon's write commands.
            click('Folder/Moved.md')
            wait('return document.querySelector(".cm-content")?.contentEditable === "true"')
            external = b'# External note\r\nUpdated outside COSMOS.\r\n'
            (vault / 'Folder/Moved.md').write_bytes(external)
            wait('return document.querySelector(".cm-content")?.textContent.includes("Updated outside COSMOS.")')
            wait("""return document.querySelector('section[aria-label="Markdown preview"] h1')?.textContent === 'External note'""")
            visual_note = b'# Native heading\r\n\r\n**Native bold** and *native emphasis* and `native code`.\n\n- [ ] Native task\r\n\n~~Old~~\n\n| Column | Value |\r\n| :--- | ---: |\n| **Cell** | 42 |\n\n> [!hint]- Native advice\n> **Native callout body**\r\n\nNative Setext\r\n===\n\nNative subtitle\n---\r\n\nFinal'
            (vault / 'Folder/Moved.md').write_bytes(visual_note)
            wait('return document.querySelector(".cm-content")?.textContent.includes("Native bold")')
            execute('window.nativeEditor = document.querySelector(".cm-content")')
            click('Visual editing')
            wait('return document.querySelector(".cm-live-strong")?.textContent === "Native bold"')
            assert execute('return document.querySelector(".cm-live-code")?.textContent === "native code"')
            wait('return document.querySelector(".cm-live-task")?.disabled === false')
            assert execute('return document.querySelector(".cm-live-strike")?.textContent === "Old"')
            execute('document.querySelector(".cm-live-task").click()')
            wait('return document.querySelector(".cm-live-task")?.checked === true')
            wait('return document.body.innerText.includes("Draft protected on this device.")')
            assert (vault / 'Folder/Moved.md').read_bytes() == visual_note
            click('Save')
            wait('return document.body.innerText.includes("Saved to vault.")')
            visual_note = visual_note.replace(b'[ ] Native task', b'[x] Native task')
            assert (vault / 'Folder/Moved.md').read_bytes() == visual_note
            wait('return document.querySelector(".cm-live-table td strong")?.textContent === "Cell"')
            assert execute('return document.querySelector(".cm-live-table th:last-child")?.style.textAlign === "right"')
            click('Show table Markdown')
            wait('return !document.querySelector(".cm-live-table")')
            assert execute('return document.querySelector(".cm-content")?.textContent.includes("| **Cell** | 42 |")')
            assert execute('return document.activeElement === document.querySelector(".cm-content")')
            wait('return document.querySelector(".cm-live-callout-source")?.textContent === "Tip"')
            click('Tip')
            wait('return !document.querySelector(".cm-live-callout-source")')
            assert execute('return document.querySelector(".cm-content")?.textContent.includes("> [!hint]- Native advice")')
            assert execute('return document.querySelector(".cm-content")?.textContent.includes("> **Native callout body**")')
            assert execute('return document.activeElement === document.querySelector(".cm-content")')
            wait('return document.querySelector(".cm-live-setext.cm-live-heading-1")?.textContent === "Native Setext"')
            assert execute('return document.querySelector(".cm-live-setext.cm-live-heading-2")?.textContent === "Native subtitle"')
            click('Edit')
            wait('return document.querySelector(".cm-content")?.textContent.includes("**Native bold**")')
            assert execute('return document.querySelector(".cm-content") === window.nativeEditor')
            assert (vault / 'Folder/Moved.md').read_bytes() == visual_note
            click('Edit and read')
            checks += ['visual editing renders Setext headings, tables and simple callouts with source reveal and toggles tasks through drafts and explicit save, preserving other bytes and editor identity']
            # Obsidian anchors use the same display parser in the real native WebView.
            blocks = b'# External note\r\n\r\nUpdated outside COSMOS. ^native\r\n\r\n[[#^native|Local block]]\r\n\r\n[[Blocks#^target|Other block]]\r\n'
            block_target = b'Target block. ^target\n\n[Return to block](Folder/Moved.md#%5Enative)'
            (vault / 'Blocks.md').write_bytes(block_target)
            (vault / 'Folder/Moved.md').write_bytes(blocks)
            wait('return !!document.getElementById("cosmos-block-native")')
            click('Visual editing')
            wait('return [...document.querySelectorAll(".cm-live-link-open")].some(b => b.textContent === "Local block")')
            click('Local block')
            wait('return document.activeElement?.id === "cosmos-block-native"')
            wait("""return [...document.querySelectorAll('nav[aria-label="Notes"] button')].some(b => b.textContent === "Blocks.md")""")
            click('Other block')
            wait('return document.activeElement?.id === "cosmos-block-target"')
            click('Visual editing')
            wait('return [...document.querySelectorAll(".cm-live-link-open")].some(b => b.textContent === "Return to block")')
            click('Return to block')
            wait('return document.activeElement?.id === "cosmos-block-native"')
            assert (vault / 'Folder/Moved.md').read_bytes() == blocks
            assert (vault / 'Blocks.md').read_bytes() == block_target
            checks += ['visual wiki and Markdown links navigate through native note/block resolution without changing source bytes']
            image_bytes = (Path(__file__).resolve().parents[1] / 'tests/fixtures/images/pixels.png').read_bytes()
            (vault / 'assets').mkdir()
            (vault / 'assets/pixels.png').write_bytes(image_bytes)
            image_note = blocks + b'\r\n![Native image|120](../assets/pixels.png)\r\n\r\n![[pixels.png|96x48]]\r\n\r\n![Native reference|96x48][photo]\r\n\r\n[photo]: ../assets/pixels.png\r\n'
            (vault / 'Folder/Moved.md').write_bytes(image_note)
            wait('return document.body.innerText.includes("Show image: Native image")')
            assert execute("""return document.querySelectorAll('section[aria-label="Markdown preview"] img').length === 0""")
            click('Show image: Native image')
            wait("""const img = document.querySelector('section[aria-label="Markdown preview"] img'); return img?.complete && img.naturalWidth === 2 && img.src.startsWith('blob:')""")
            assert execute("""const img = document.querySelector('section[aria-label="Markdown preview"] img'); return img.alt === 'Native image' && img.getAttribute('width') === '120' && !img.hasAttribute('height');""")
            assert (vault / 'assets/pixels.png').read_bytes() == image_bytes
            assert (vault / 'Folder/Moved.md').read_bytes() == image_note
            click('Hide image: Native image')
            wait("""return document.querySelectorAll('section[aria-label="Markdown preview"] img').length === 0""")
            click('Show image: pixels.png')
            wait("""const img = document.querySelector('section[aria-label="Markdown preview"] img'); return img?.complete && img.naturalWidth === 2 && img.alt === 'pixels.png'""")
            assert execute("""const img = document.querySelector('section[aria-label="Markdown preview"] img'); return img.getAttribute('width') === '96' && img.getAttribute('height') === '48';""")
            click('Hide image: pixels.png')
            click('Show image: Native reference')
            wait("""const img = document.querySelector('section[aria-label="Markdown preview"] img'); return img?.complete && img.naturalWidth === 2 && img.alt === 'Native reference'""")
            assert execute("""const img = document.querySelector('section[aria-label="Markdown preview"] img'); return img.getAttribute('width') === '96' && img.getAttribute('height') === '48';""")
            click('Hide image: Native reference')
            assert (vault / 'Folder/Moved.md').read_bytes() == image_note
            checks += ['local PNG attachment crosses daemon IPC and renders on demand under the native CSP without changing vault bytes']
            pdf_bytes = (Path(__file__).resolve().parents[1] / 'tests/fixtures/pdfs/two-pages.pdf').read_bytes()
            (vault / 'assets/manual.pdf').write_bytes(pdf_bytes)
            pdf_note = blocks + b'\r\n[Manual PDF](../assets/manual.pdf)\r\n\r\n![[manual.pdf#page=2|Second PDF page]]\r\n'
            (vault / 'Folder/Moved.md').write_bytes(pdf_note)
            wait('return document.body.innerText.includes("Open PDF: Manual PDF")')
            click('Visual editing')
            wait('return [...document.querySelectorAll(".cm-live-link-open")].some(b => b.textContent === "Open PDF: Manual PDF")')
            click('Open PDF: Manual PDF')
            wait("""return !!document.querySelector('dialog[open] canvas:not([hidden])')""")
            assert execute("""return document.querySelector('dialog').textContent.includes('Page 1 of 2')""")
            click('Next page')
            wait("""return document.querySelector('dialog').textContent.includes('COSMOS PDF second page')""")
            click('Close PDF')
            wait("return !document.querySelector('dialog')")
            wait('return document.activeElement?.textContent === "Open PDF: Manual PDF"')
            click('Open PDF: Second PDF page')
            wait("""return !!document.querySelector('dialog canvas:not([hidden])') && document.querySelector('dialog').textContent.includes('Page 2 of 2')""")
            click('Close PDF')
            assert (vault / 'Folder/Moved.md').read_bytes() == pdf_note
            assert (vault / 'assets/manual.pdf').read_bytes() == pdf_bytes
            checks += ['PDF links and Obsidian embeds open from visual editing through daemon IPC with local worker, page links, restored focus and original bytes preserved']
            click('Edit and read')
            callouts = blocks + b'\r\n> [!note]- Native callout\r\n>\r\n> > [!tip]- Nested callout\r\n> > Hidden native body. ^hidden\r\n\r\n[[#^hidden|Reveal callout]]\r\n'
            (vault / 'Folder/Moved.md').write_bytes(callouts)
            wait("""return document.querySelector('summary')?.textContent === 'Native callout'""")
            assert execute("return document.querySelectorAll('details[open]').length === 0")
            execute("document.querySelector('summary').click()")
            wait("return document.querySelector('details').open")
            execute("document.querySelector('summary').click()")
            wait("return !document.querySelector('details').open")
            click('Reveal callout')
            wait('return document.activeElement?.id === "cosmos-block-hidden"')
            assert execute("return document.querySelectorAll('details[open]').length === 2")
            assert (vault / 'Folder/Moved.md').read_bytes() == callouts
            checks += ['nested Obsidian callouts toggle and reveal linked blocks without changing source bytes']
            (vault / 'Folder/Moved.md').write_bytes(external)
            (vault / 'Blocks.md').unlink()
            wait('return !document.getElementById("cosmos-block-native")')
            checks += ['Obsidian block links focus local and cross-note targets without writing source bytes']
            clean = execute('return document.querySelector(".cm-content").textContent;')
            (vault / 'Folder/Moved.md').write_bytes(bytes([255]))
            wait('return document.body.innerText.includes("The current version of this note could not be read.")')
            assert execute('return document.querySelector(".cm-content").textContent;') == clean
            (vault / 'Folder/Moved.md').write_bytes(external)
            wait('return !document.body.innerText.includes("The current version of this note could not be read.")')
            (vault / 'Reference.md').write_text('[[Folder/Moved]]')
            wait("""return [...document.querySelectorAll('section[aria-label="Connections"] button')].some(b => b.textContent === "Reference.md")""")
            type_into('aside form input', 'external')
            click('Search')
            wait("""return document.querySelectorAll('nav[aria-label="Notes"] button').length === 1""")
            (vault / 'Found.md').write_text('external search match')
            wait("""return document.querySelectorAll('nav[aria-label="Notes"] button').length === 2""")
            assert execute('return document.querySelector("aside form input").value;') == 'external'
            click('Refresh list')
            wait('return document.querySelector(".cm-content")?.contentEditable === "true"')
            type_into('.cm-content', '\nMy local draft')
            wait('return document.body.innerText.includes("Unsaved changes")')
            draft = execute('return document.querySelector(".cm-content").textContent;')
            (vault / 'Folder/Moved.md').write_text('another external version')
            wait('return document.body.innerText.includes("This note changed outside COSMOS.")')
            assert execute('return document.querySelector(".cm-content").textContent;') == draft
            assert execute('return [...document.querySelectorAll("button")].find(b => b.textContent === "Save").disabled;')
            # Saving a copy preserves the externally changed source and current editor.
            (vault / 'Occupied.md').write_bytes(b'')
            click('Save copy as…')
            type_into('input[aria-label="Destination path"]', 'Occupied.md')
            click('Create copy')
            wait('return document.body.innerText.includes("A file or folder already exists at that destination.")')
            assert (vault / 'Occupied.md').read_bytes() == b''
            element = request('POST', session + '/element', {'using': 'css selector', 'value': 'input[aria-label="Destination path"]'})
            request('POST', session + '/element/' + element['element-6066-11e4-a52e-4f735466cecf'] + '/clear', {})
            type_into('input[aria-label="Destination path"]', 'Copies/Recovered.md')
            click('Create copy')
            wait('return document.body.innerText.includes("Copy saved to Copies/Recovered.md.")')
            copy_bytes = (vault / 'Copies/Recovered.md').read_bytes()
            assert b'My local draft' in copy_bytes
            assert (vault / 'Folder/Moved.md').read_text() == 'another external version'
            assert execute('return document.querySelector(".cm-content").textContent;') == draft
            # Returning to the original revision clears the warning, not the draft.
            (vault / 'Folder/Moved.md').write_bytes(external)
            wait('return ![...document.querySelectorAll("button")].find(b => b.textContent === "Save").disabled')
            assert execute('return document.querySelector(".cm-content").textContent;') == draft
            click('Save')
            wait('return document.body.innerText.includes("Saved to vault.")')
            assert (vault / 'Folder/Moved.md').read_bytes() == copy_bytes
            (vault / 'Folder/Moved.md').unlink()
            wait('return document.body.innerText.includes("This note was removed or moved outside COSMOS.")')
            assert execute('return document.querySelector(".cm-content").textContent;') == draft
            assert execute("""return ![...document.querySelectorAll('nav[aria-label="Notes"] button')].some(b => b.textContent === "Folder/Moved.md");""")
            # Create a real project with the same native transport.
            execute('const select = [...document.querySelectorAll("select")].find(s => [...s.options].some(o => o.value === "project")); select.value = "project"; select.dispatchEvent(new Event("change", {bubbles:true}));')
            wait('return document.body.innerText.includes("Project name")')
            type_into('input[placeholder]', 'Native project')
            click('Create project')
            wait("""return document.querySelector('section[aria-label="Markdown editor"] h2')?.textContent === 'context.md'""")
            wait('return ![...document.querySelectorAll("button")].find(b => b.textContent === "Refresh list").disabled')
            project = vault / 'Universos/Pessoal/Native project'
            assert len(list(project.glob('*.md'))) == 6
            metadata = json.loads((project / 'project.cosmos.json').read_text())
            assert metadata['format_version'] == 1 and metadata['bindings'] == []
            assert not (vault / 'cosmos.db').exists()
            assert execute('return [...document.querySelectorAll("button")].find(b => b.textContent === "Move note").disabled;')
            checks += ['native folder consent', 'confirmed local draft recovered after application restart without writing the vault', 'Markdown reading and split views preserve editor and follow disk changes', 'CodeMirror save via daemon', 'create-only copy preserves external source, draft and existing destinations', 'move, trash and restore via daemon', 'external changes, search, backlinks and draft preservation', 'protected project structure', 'project documents on disk']
            assert execute("""return !document.querySelector('section[aria-label="Markdown preview"]').textContent.includes('cosmos:begin');""")
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
