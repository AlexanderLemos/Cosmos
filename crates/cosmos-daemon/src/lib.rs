//! Local JSON-RPC transport, framed with a little-endian byte length (max 50 MiB).
use cosmos_core::{
    Version1,
    vault::{VaultCommand, VaultReply},
};
use interprocess::local_socket::{GenericFilePath, ListenerOptions, Stream, prelude::*};
use serde::{Deserialize, Serialize};
use std::{
    io::{self, Read, Write},
    path::Path,
    time::{Duration, Instant},
};

pub const MAX_FRAME: usize = 50 * 1024 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    jsonrpc: String,
    id: u64,
    method: String,
    params: Params,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Params {
    protocol_version: Version1,
    command: Option<VaultCommand>,
}

pub fn endpoint(data: &Path) -> String {
    #[cfg(windows)]
    {
        format!(
            r"\\.\pipe\cosmosd-{}",
            &blake3::hash(data.to_string_lossy().as_bytes()).to_hex()[..24]
        )
    }
    #[cfg(unix)]
    {
        data.join("daemon.sock").to_string_lossy().into_owned()
    }
}
pub fn listener(data: &Path) -> io::Result<interprocess::local_socket::Listener> {
    let endpoint = endpoint(data);
    let options = ListenerOptions::new()
        .name(endpoint.as_str().to_fs_name::<GenericFilePath>()?)
        .try_overwrite(true);
    #[cfg(windows)]
    let options = {
        use interprocess::os::windows::{
            local_socket::ListenerOptionsExt, security_descriptor::SecurityDescriptor,
        };
        let sddl = widestring::U16CString::from_str("D:P(A;;GA;;;OW)").map_err(io::Error::other)?;
        options.security_descriptor(SecurityDescriptor::deserialize(&sddl)?)
    };
    // macOS does not support fchmod on an unbound socket. A private parent
    // directory prevents other users reaching the endpoint while it is created.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(data, std::fs::Permissions::from_mode(0o700))?;
    }
    let listener = options.create_sync()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&endpoint, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(listener)
}
fn retry<T>(mut operation: impl FnMut() -> io::Result<T>, deadline: Instant) -> io::Result<T> {
    loop {
        match operation() {
            Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err(io::Error::new(io::ErrorKind::TimedOut, "IPC timeout"));
                }
                std::thread::sleep(Duration::from_millis(5));
            }
            result => return result,
        }
    }
}
fn read_all(stream: &mut Stream, mut bytes: &mut [u8], deadline: Instant) -> io::Result<()> {
    while !bytes.is_empty() {
        let count = retry(|| stream.read(bytes), deadline)?;
        if count == 0 {
            return Err(io::Error::from(io::ErrorKind::UnexpectedEof));
        }
        bytes = &mut bytes[count..];
    }
    Ok(())
}
pub fn receive(stream: &mut Stream) -> io::Result<serde_json::Value> {
    stream.set_nonblocking(true)?;
    let deadline = Instant::now() + Duration::from_secs(30);
    let mut header = [0; 4];
    read_all(stream, &mut header, deadline)?;
    let size = u32::from_le_bytes(header) as usize;
    if size > MAX_FRAME {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "IPC frame too large",
        ));
    }
    let mut bytes = vec![0; size];
    read_all(stream, &mut bytes, deadline)?;
    serde_json::from_slice(&bytes).map_err(io::Error::other)
}
pub fn send(stream: &mut Stream, value: &serde_json::Value) -> io::Result<()> {
    stream.set_nonblocking(true)?;
    let mut bytes = serde_json::to_vec(value)?;
    if bytes.len() > MAX_FRAME {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "IPC frame too large",
        ));
    }
    let mut frame = (bytes.len() as u32).to_le_bytes().to_vec();
    frame.append(&mut bytes);
    let deadline = Instant::now() + Duration::from_secs(30);
    let mut remaining = frame.as_slice();
    while !remaining.is_empty() {
        let count = retry(|| stream.write(remaining), deadline)?;
        if count == 0 {
            return Err(io::Error::from(io::ErrorKind::WriteZero));
        }
        remaining = &remaining[count..];
    }
    Ok(())
}
pub fn connect(data: &Path) -> io::Result<Stream> {
    Stream::connect(endpoint(data).to_fs_name::<GenericFilePath>()?)
}
fn request(
    data: &Path,
    method: &str,
    command: Option<VaultCommand>,
) -> io::Result<serde_json::Value> {
    let mut stream = connect(data)?;
    let request = Request {
        jsonrpc: "2.0".into(),
        id: 1,
        method: method.into(),
        params: Params {
            protocol_version: Version1,
            command,
        },
    };
    send(&mut stream, &serde_json::to_value(request)?)?;
    let reply = receive(&mut stream)?;
    if reply["jsonrpc"] != "2.0" || reply["id"] != 1 {
        return Err(io::Error::other("INVALID_RESPONSE"));
    }
    if let Some(error) = reply.get("error") {
        return Err(io::Error::other(
            error["message"].as_str().unwrap_or("IPC_ERROR"),
        ));
    }
    Ok(reply["result"].clone())
}
pub fn handshake(data: &Path) -> io::Result<()> {
    let result = request(data, "handshake", None)?;
    if result["protocol_version"] != 1 || result["schema_version"] != 1 {
        return Err(io::Error::other("INCOMPATIBLE_DAEMON"));
    }
    Ok(())
}
pub fn call(data: &Path, command: VaultCommand) -> io::Result<VaultReply> {
    serde_json::from_value(request(data, "vault", Some(command))?).map_err(io::Error::other)
}
pub fn dispatch(value: serde_json::Value, vault: &mut cosmos_storage::Vault) -> serde_json::Value {
    let id = value.get("id").cloned().unwrap_or(serde_json::Value::Null);
    let result = (|| -> Result<serde_json::Value, String> {
        let request: Request =
            serde_json::from_value(value).map_err(|_| "INVALID_REQUEST_OR_VERSION".to_string())?;
        if request.jsonrpc != "2.0" {
            return Err("INVALID_REQUEST".into());
        }
        match (request.method.as_str(), request.params.command) {
            ("handshake", None) => Ok(
                serde_json::json!({"protocol_version":1,"schema_version":1,"application_version":env!("CARGO_PKG_VERSION")}),
            ),
            ("vault", Some(command)) => {
                serde_json::to_value(vault.execute(command).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())
            }
            _ => Err("METHOD_NOT_FOUND".into()),
        }
    })();
    match result {
        Ok(result) => serde_json::json!({"jsonrpc":"2.0","id":id,"result":result}),
        Err(message) => {
            serde_json::json!({"jsonrpc":"2.0","id":id,"error":{"code":-32000,"message":message}})
        }
    }
}
