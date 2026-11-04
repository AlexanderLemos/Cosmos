//! Wire protocol: JSON-RPC 2.0, one message per line.
//!
//! Every connection starts with `hello`, where both sides announce versions (plan §13.6,
//! requirement R18). A client must refuse to continue on a protocol mismatch.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Bump on any incompatible change to methods or payloads.
pub const PROTOCOL_VERSION: u32 = 1;

pub const JSONRPC: &str = "2.0";

pub mod method {
    pub const HELLO: &str = "hello";
    pub const PING: &str = "ping";
    pub const SHUTDOWN: &str = "shutdown";
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Request {
    pub jsonrpc: String,
    pub id: u64,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

impl Request {
    pub fn new(id: u64, method: &str, params: Value) -> Self {
        Self {
            jsonrpc: JSONRPC.into(),
            id,
            method: method.into(),
            params,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Response {
    pub jsonrpc: String,
    pub id: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

impl Response {
    pub fn ok(id: u64, result: Value) -> Self {
        Self {
            jsonrpc: JSONRPC.into(),
            id,
            result: Some(result),
            error: None,
        }
    }

    pub fn err(id: u64, error: RpcError) -> Self {
        Self {
            jsonrpc: JSONRPC.into(),
            id,
            result: None,
            error: Some(error),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, thiserror::Error)]
#[error("rpc error {code}: {message}")]
pub struct RpcError {
    pub code: i64,
    pub message: String,
}

impl RpcError {
    pub const PARSE_ERROR: i64 = -32700;
    pub const METHOD_NOT_FOUND: i64 = -32601;
    pub const INVALID_PARAMS: i64 = -32602;
    /// COSMOS-specific: protocol versions do not match.
    pub const PROTOCOL_MISMATCH: i64 = -32010;

    pub fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

/// Which program is connecting. Used for display and audit, never as a credential.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ClientKind {
    Cli,
    Desktop,
    Hook,
    Mcp,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Hello {
    pub client: ClientKind,
    pub client_version: String,
    pub protocol_version: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct HelloResult {
    pub daemon_version: String,
    pub protocol_version: u32,
    /// Internal database schema version (`PRAGMA user_version`).
    pub schema_version: u32,
    pub pid: u32,
    pub uptime_secs: u64,
    pub capabilities: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_roundtrip() {
        let r = Request::new(7, method::PING, Value::Null);
        let line = serde_json::to_string(&r).unwrap();
        assert!(line.contains(r#""jsonrpc":"2.0""#));
        assert_eq!(serde_json::from_str::<Request>(&line).unwrap(), r);
    }

    #[test]
    fn error_response_omits_result() {
        let r = Response::err(1, RpcError::new(RpcError::METHOD_NOT_FOUND, "nope"));
        let line = serde_json::to_string(&r).unwrap();
        assert!(!line.contains("result"));
    }
}
