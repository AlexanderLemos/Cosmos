//! COSMOS local IPC between `cosmosd`, the `cosmos` CLI and the Desktop app.

pub mod protocol;
pub mod transport;

pub use protocol::{
    method, ClientKind, Hello, HelloResult, Request, Response, RpcError, PROTOCOL_VERSION,
};
pub use transport::{bind, serve, Client, Endpoint, Handler, IpcError};

/// Connect and perform the version handshake. Fails on protocol mismatch.
pub async fn connect_and_hello(
    endpoint: &Endpoint,
    client: ClientKind,
    client_version: &str,
) -> Result<(Client, HelloResult), IpcError> {
    let mut c = Client::connect(endpoint).await?;
    let hello = Hello {
        client,
        client_version: client_version.into(),
        protocol_version: PROTOCOL_VERSION,
    };
    let v = c.call(method::HELLO, serde_json::to_value(hello)?).await?;
    let result: HelloResult = serde_json::from_value(v)?;
    if result.protocol_version != PROTOCOL_VERSION {
        return Err(RpcError::new(
            RpcError::PROTOCOL_MISMATCH,
            format!(
                "daemon speaks protocol v{}, this client v{}",
                result.protocol_version, PROTOCOL_VERSION
            ),
        )
        .into());
    }
    Ok((c, result))
}
