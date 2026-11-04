//! Local transport: Unix domain socket (macOS/Linux) or named pipe (Windows), carrying
//! newline-delimited JSON-RPC.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use interprocess::local_socket::tokio::{prelude::*, Listener, Stream};
use interprocess::local_socket::ListenerOptions;
#[cfg(unix)]
use interprocess::local_socket::{GenericFilePath, ToFsName};
#[cfg(windows)]
use interprocess::local_socket::{GenericNamespaced, ToNsName};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::protocol::{Request, Response, RpcError};

#[derive(Debug, thiserror::Error)]
pub enum IpcError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Rpc(#[from] RpcError),
    #[error("daemon closed the connection")]
    Closed,
}

/// Where the daemon listens. One endpoint per OS user.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Endpoint {
    /// Unix socket file. Its directory is created with mode 0700 so other OS users cannot
    /// connect (plan §13.2). Not a sandbox against processes of the same user (R17).
    UnixSocket(PathBuf),
    /// Windows named pipe name, e.g. `cosmosd-alex`.
    // F1: apply a security descriptor restricting the pipe to the current user's SID.
    NamedPipe(String),
}

impl Endpoint {
    /// Default endpoint for the current user, derived from the app data dir on Unix.
    pub fn default_for(data_dir: &Path) -> Self {
        if cfg!(windows) {
            let user = std::env::var("USERNAME").unwrap_or_else(|_| "user".into());
            let safe: String = user
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
                .collect();
            Self::NamedPipe(format!("cosmosd-{safe}"))
        } else {
            Self::UnixSocket(data_dir.join("run").join("cosmosd.sock"))
        }
    }
}

impl std::fmt::Display for Endpoint {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnixSocket(p) => write!(f, "{}", p.display()),
            Self::NamedPipe(n) => write!(f, r"\\.\pipe\{n}"),
        }
    }
}

fn name_of(endpoint: &Endpoint) -> std::io::Result<interprocess::local_socket::Name<'static>> {
    match endpoint {
        #[cfg(unix)]
        Endpoint::UnixSocket(path) => path.clone().to_fs_name::<GenericFilePath>(),
        #[cfg(windows)]
        Endpoint::NamedPipe(name) => name.clone().to_ns_name::<GenericNamespaced>(),
        #[allow(unreachable_patterns)]
        other => Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            format!("endpoint {other} is not supported on this OS"),
        )),
    }
}

/// Bind the endpoint. The caller must already hold the daemon lock, so a leftover socket
/// file can only be stale and is removed.
pub fn bind(endpoint: &Endpoint) -> Result<Listener, IpcError> {
    #[cfg(unix)]
    if let Endpoint::UnixSocket(path) = endpoint {
        use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
        if let Some(dir) = path.parent() {
            std::fs::DirBuilder::new()
                .recursive(true)
                .mode(0o700)
                .create(dir)?;
            std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
        }
        if path.exists() {
            std::fs::remove_file(path)?;
        }
    }
    let listener = ListenerOptions::new()
        .name(name_of(endpoint)?)
        .create_tokio()?;
    #[cfg(unix)]
    if let Endpoint::UnixSocket(path) = endpoint {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(listener)
}

/// Request handler used by the server. Returns the `result` value or an RPC error.
pub trait Handler: Send + Sync + 'static {
    fn handle(&self, method: &str, params: Value) -> Result<Value, RpcError>;
}

impl<F> Handler for F
where
    F: Fn(&str, Value) -> Result<Value, RpcError> + Send + Sync + 'static,
{
    fn handle(&self, method: &str, params: Value) -> Result<Value, RpcError> {
        self(method, params)
    }
}

/// Serve one connection until the client disconnects.
pub async fn serve_connection(stream: Stream, handler: Arc<dyn Handler>) -> Result<(), IpcError> {
    let (rx, mut tx) = tokio::io::split(stream);
    let mut lines = BufReader::new(rx).lines();
    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<Request>(&line) {
            Ok(req) => match handler.handle(&req.method, req.params) {
                Ok(v) => Response::ok(req.id, v),
                Err(e) => Response::err(req.id, e),
            },
            Err(e) => Response::err(0, RpcError::new(RpcError::PARSE_ERROR, e.to_string())),
        };
        let mut out = serde_json::to_vec(&response)?;
        out.push(b'\n');
        tx.write_all(&out).await?;
        tx.flush().await?;
    }
    Ok(())
}

/// Accept connections forever, one task per connection.
pub async fn serve(listener: Listener, handler: Arc<dyn Handler>) -> Result<(), IpcError> {
    loop {
        let stream = listener.accept().await?;
        let handler = handler.clone();
        tokio::spawn(async move {
            let _ = serve_connection(stream, handler).await;
        });
    }
}

/// Minimal client: sequential calls over one connection.
pub struct Client {
    reader: tokio::io::Lines<BufReader<tokio::io::ReadHalf<Stream>>>,
    writer: tokio::io::WriteHalf<Stream>,
    next_id: AtomicU64,
}

impl Client {
    pub async fn connect(endpoint: &Endpoint) -> Result<Self, IpcError> {
        let stream = Stream::connect(name_of(endpoint)?).await?;
        let (rx, tx) = tokio::io::split(stream);
        Ok(Self {
            reader: BufReader::new(rx).lines(),
            writer: tx,
            next_id: AtomicU64::new(1),
        })
    }

    pub async fn call(&mut self, method: &str, params: Value) -> Result<Value, IpcError> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let mut out = serde_json::to_vec(&Request::new(id, method, params))?;
        out.push(b'\n');
        self.writer.write_all(&out).await?;
        self.writer.flush().await?;
        let line = self.reader.next_line().await?.ok_or(IpcError::Closed)?;
        let resp: Response = serde_json::from_str(&line)?;
        match (resp.result, resp.error) {
            (_, Some(e)) => Err(e.into()),
            (Some(v), None) => Ok(v),
            (None, None) => Ok(Value::Null),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::method;

    #[tokio::test]
    async fn client_server_roundtrip() {
        let id = ulid::Ulid::new();
        let dir = std::env::temp_dir().join(format!("cosmos-ipc-{id}"));
        let endpoint = if cfg!(windows) {
            Endpoint::NamedPipe(format!("cosmos-test-{id}"))
        } else {
            Endpoint::UnixSocket(dir.join("run/test.sock"))
        };
        let listener = bind(&endpoint).unwrap();
        let handler: Arc<dyn Handler> = Arc::new(|m: &str, p: Value| match m {
            method::PING => Ok(serde_json::json!({ "pong": p })),
            _ => Err(RpcError::new(RpcError::METHOD_NOT_FOUND, m.to_string())),
        });
        tokio::spawn(serve(listener, handler));

        let mut client = Client::connect(&endpoint).await.unwrap();
        let v = client
            .call(method::PING, serde_json::json!(1))
            .await
            .unwrap();
        assert_eq!(v, serde_json::json!({ "pong": 1 }));
        let err = client.call("nope", Value::Null).await.unwrap_err();
        assert!(matches!(
            err,
            IpcError::Rpc(RpcError {
                code: RpcError::METHOD_NOT_FOUND,
                ..
            })
        ));

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.join("run"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o700);
        }
        let _ = std::fs::remove_dir_all(dir);
    }
}
