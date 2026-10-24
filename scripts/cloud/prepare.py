"""Prepare the Debian 13 x86_64 cloud image without modifying system directories.

All downloads use TLS. APT verifies signed repository metadata and package hashes;
rustup-init is checked against the checksum published by Rust's distribution host.
The private sysroot is for development, never an application distribution artifact.
"""
from pathlib import Path
import os
import platform
import pwd
import re
import subprocess
import tomllib

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path('/workspace/.cosmos-tools')


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def prepare_rust():
    version = tomllib.loads((ROOT / 'rust-toolchain.toml').read_text())['toolchain']['channel']
    env = os.environ | {'CARGO_HOME': str(TOOLS / 'cargo'), 'RUSTUP_HOME': str(TOOLS / 'rustup')}
    rustup = TOOLS / 'cargo/bin/rustup'
    if not rustup.exists():
        bootstrap = TOOLS / 'bootstrap'
        bootstrap.mkdir(parents=True, exist_ok=True)
        origin = 'https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/'
        for filename in ['rustup-init', 'rustup-init.sha256']:
            run('curl', '--proto', '=https', '--tlsv1.2', '-fsSL', origin + filename, '-o', str(bootstrap / filename))
        run('sha256sum', '-c', 'rustup-init.sha256', cwd=bootstrap)
        (bootstrap / 'rustup-init').chmod(0o755)
        run(str(bootstrap / 'rustup-init'), '-y', '--no-modify-path', '--profile', 'minimal',
            '--default-toolchain', version, '--component', 'rustfmt,clippy', env=env)
    else:
        run(str(rustup), 'toolchain', 'install', version, '--profile', 'minimal',
            '--component', 'rustfmt,clippy', env=env)


def prepare_native():
    sysroot = TOOLS / 'sysroot'
    if (sysroot / 'usr/bin/WebKitWebDriver').exists() and (sysroot / 'usr/lib/x86_64-linux-gnu/pkgconfig/webkit2gtk-4.1.pc').exists():
        print('Reusing prepared native sysroot.', flush=True)
        return
    # Do not extract archives through symlinks into the host filesystem.
    if sysroot.exists() and any(sysroot.iterdir()):
        raise RuntimeError('Incomplete native sysroot: preserve it and diagnose before rebuilding.')
    apt = TOOLS / 'apt'
    for directory in ['lists/partial', 'archives/partial', 'packages', 'empty-config']:
        (apt / directory).mkdir(parents=True, exist_ok=True)
    (apt / 'sources.list').write_text('''deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie-updates main
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://security.debian.org/debian-security trixie-security main
''')
    (apt / 'apt.conf').write_text(f'''Dir::Etc::Parts "{apt}/empty-config";
Dir::Etc::main "{apt}/empty-main";
Dir::Etc::sourcelist "{apt}/sources.list";
Dir::Etc::sourceparts "{apt}/empty-config";
Dir::State::lists "{apt}/lists";
Dir::State::status "/var/lib/dpkg/status";
Dir::Cache::archives "{apt}/archives";
Dir::Cache::pkgcache "{apt}/pkgcache.bin";
Dir::Cache::srcpkgcache "{apt}/srcpkgcache.bin";
APT::Sandbox::User "{pwd.getpwuid(os.getuid()).pw_name}";
Acquire::Languages "none";
''')
    env = os.environ | {'APT_CONFIG': str(apt / 'apt.conf')}
    run('apt-get', 'update', env=env)
    requested = ['libwebkit2gtk-4.1-dev', 'libayatana-appindicator3-dev', 'librsvg2-dev',
                 'patchelf', 'xvfb', 'xauth', 'webkitgtk-webdriver', 'xdotool']
    result = run('apt-get', '-s', 'install', '--no-install-recommends', *requested, env=env, capture_output=True, text=True)
    (apt / 'native-plan.txt').write_text(result.stdout)
    packages = [m.group(1) + '=' + m.group(2) for m in re.finditer(r'^Inst (\S+)(?: \[[^\]]+\])? \((\S+)', result.stdout, re.M)]
    if packages:
        run('apt-get', 'download', *packages, env=env, cwd=apt / 'packages')
    sysroot.mkdir(parents=True, exist_ok=True)
    for package in sorted((apt / 'packages').glob('*.deb')):
        run('dpkg-deb', '--extract', str(package), str(sysroot))

    def overlay(source, destination):
        destination.mkdir(parents=True, exist_ok=True)
        for entry in source.iterdir():
            target = destination / entry.name
            if target.exists() or target.is_symlink():
                if entry.is_dir() and target.is_dir() and not target.is_symlink():
                    overlay(entry, target)
            elif entry.is_dir() and not entry.is_symlink():
                overlay(entry, target)
            else:
                target.symlink_to(entry)
    for directory in ['usr/include', 'usr/lib/x86_64-linux-gnu', 'usr/share/pkgconfig']:
        overlay(Path('/') / directory, sysroot / directory)


def write_activation():
    (TOOLS / 'env.sh').write_text('''# COSMOS cloud tool activation; owned by scripts/cloud/prepare.py.
export CARGO_HOME=/workspace/.cosmos-tools/cargo
export RUSTUP_HOME=/workspace/.cosmos-tools/rustup
export XDG_DATA_HOME=/workspace/.cosmos-tools/data
export XDG_CACHE_HOME=/workspace/.cosmos-tools/cache
export XDG_CONFIG_HOME=/workspace/.cosmos-tools/config
export PATH="/workspace/.cosmos-tools/cargo/bin:/workspace/.cosmos-tools/sysroot/usr/bin:$PATH"
export PKG_CONFIG_SYSROOT_DIR=/workspace/.cosmos-tools/sysroot
export PKG_CONFIG_PATH=/workspace/.cosmos-tools/sysroot/usr/lib/x86_64-linux-gnu/pkgconfig:/workspace/.cosmos-tools/sysroot/usr/share/pkgconfig
export LD_LIBRARY_PATH="/workspace/.cosmos-tools/sysroot/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export CARGO_BUILD_JOBS=3
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
export TURBO_TELEMETRY_DISABLED=1
''')


if __name__ == '__main__':
    release = Path('/etc/os-release').read_text()
    if platform.machine() != 'x86_64' or 'ID=debian' not in release or 'VERSION_ID="13"' not in release:
        raise SystemExit('This bootstrap targets the Debian 13 x86_64 cloud image. See README for native setup.')
    TOOLS.mkdir(parents=True, exist_ok=True)
    prepare_rust()
    prepare_native()
    write_activation()
