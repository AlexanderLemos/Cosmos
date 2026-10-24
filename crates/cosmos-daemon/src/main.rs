use interprocess::local_socket::prelude::*;
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args_os().skip(1);
    let root = PathBuf::from(args.next().ok_or("usage: cosmosd VAULT APP_DATA")?);
    let data = PathBuf::from(args.next().ok_or("usage: cosmosd VAULT APP_DATA")?);
    if args.next().is_some() {
        return Err("unexpected arguments".into());
    }
    std::fs::create_dir_all(&data)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&data, std::fs::Permissions::from_mode(0o700))?;
    }
    // Hold the exclusive OS lock before binding/reclaiming the socket.
    let vault = Arc::new(Mutex::new(cosmos_storage::Vault::open(&root, &data)?));
    let listener = cosmos_daemon::listener(&data)?;
    let active = Arc::new(AtomicUsize::new(0));
    for connection in listener.incoming() {
        let mut stream = connection?;
        if active.load(Ordering::SeqCst) >= 8 {
            continue;
        }
        active.fetch_add(1, Ordering::SeqCst);
        let active = active.clone();
        let vault = vault.clone();
        std::thread::spawn(move || {
            if let Ok(request) = cosmos_daemon::receive(&mut stream)
                && let Ok(mut vault) = vault.lock()
            {
                let response = cosmos_daemon::dispatch(request, &mut vault);
                let _ = cosmos_daemon::send(&mut stream, &response);
            }
            active.fetch_sub(1, Ordering::SeqCst);
        });
    }
    Ok(())
}
