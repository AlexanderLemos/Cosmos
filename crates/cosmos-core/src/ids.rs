//! Prefixed, sortable identifiers (ULID based).
//!
//! `prj_01JB7K2X...` for projects, `ses_...` for sessions. Events use a bare ULID.

use std::fmt;
use std::str::FromStr;

use schemars::gen::SchemaGenerator;
use schemars::schema::{InstanceType, Schema, SchemaObject, StringValidation};
use schemars::JsonSchema;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use ulid::Ulid;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum IdError {
    #[error("expected prefix `{expected}`")]
    WrongPrefix { expected: &'static str },
    #[error("invalid ULID: {0}")]
    InvalidUlid(String),
}

macro_rules! prefixed_id {
    ($(#[$meta:meta])* $name:ident, $prefix:literal) => {
        $(#[$meta])*
        #[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
        pub struct $name(Ulid);

        impl $name {
            pub const PREFIX: &'static str = $prefix;

            pub fn new() -> Self {
                Self(Ulid::new())
            }

            pub fn ulid(&self) -> Ulid {
                self.0
            }

            /// Last 6 characters of the ULID, used in file names (`...-claude-code-01JB7K.md`).
            pub fn short(&self) -> String {
                let s = self.0.to_string();
                s[s.len() - 6..].to_string()
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, "{}{}", Self::PREFIX, self.0)
            }
        }

        impl fmt::Debug for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                fmt::Display::fmt(self, f)
            }
        }

        impl FromStr for $name {
            type Err = IdError;
            fn from_str(s: &str) -> Result<Self, Self::Err> {
                let rest = s
                    .strip_prefix(Self::PREFIX)
                    .ok_or(IdError::WrongPrefix { expected: Self::PREFIX })?;
                Ulid::from_string(rest)
                    .map(Self)
                    .map_err(|e| IdError::InvalidUlid(e.to_string()))
            }
        }

        impl Serialize for $name {
            fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
                s.collect_str(self)
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
                let s = String::deserialize(d)?;
                s.parse().map_err(serde::de::Error::custom)
            }
        }

        impl JsonSchema for $name {
            fn schema_name() -> String {
                stringify!($name).to_string()
            }
            fn json_schema(_: &mut SchemaGenerator) -> Schema {
                prefixed_schema(Self::PREFIX)
            }
        }
    };
}

fn prefixed_schema(prefix: &str) -> Schema {
    SchemaObject {
        instance_type: Some(InstanceType::String.into()),
        string: Some(Box::new(StringValidation {
            pattern: Some(format!("^{prefix}[0-9A-HJKMNP-TV-Z]{{26}}$")),
            ..Default::default()
        })),
        ..Default::default()
    }
    .into()
}

prefixed_id!(
    /// Immutable project identifier. Memory belongs to the project, not to the agent.
    ProjectId,
    "prj_"
);
prefixed_id!(
    /// COSMOS session identifier (distinct from the harness' own session id).
    SessionId,
    "ses_"
);
prefixed_id!(
    /// Integration profile identifier (one per installed harness integration).
    ProfileId,
    "itg_"
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_display_parse() {
        let id = ProjectId::new();
        let s = id.to_string();
        assert!(s.starts_with("prj_"));
        assert_eq!(s.parse::<ProjectId>().unwrap(), id);
    }

    #[test]
    fn rejects_wrong_prefix() {
        let s = SessionId::new().to_string();
        assert_eq!(
            s.parse::<ProjectId>(),
            Err(IdError::WrongPrefix { expected: "prj_" })
        );
    }

    #[test]
    fn serde_as_string() {
        let id = SessionId::new();
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, format!("\"{id}\""));
        let back: SessionId = serde_json::from_str(&json).unwrap();
        assert_eq!(back, id);
    }

    #[test]
    fn short_suffix_has_six_chars() {
        assert_eq!(ProjectId::new().short().len(), 6);
    }
}
