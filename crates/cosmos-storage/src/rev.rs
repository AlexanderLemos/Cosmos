//! Content revisions: `b3:<blake3 hex>` (plan §12.3).

use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Rev(String);

impl Rev {
    pub const PREFIX: &'static str = "b3:";

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Parse a revision string received from a client.
    pub fn parse(s: &str) -> Option<Self> {
        let hex = s.strip_prefix(Self::PREFIX)?;
        (hex.len() == 64 && hex.bytes().all(|b| b.is_ascii_hexdigit())).then(|| Self(s.into()))
    }
}

impl fmt::Display for Rev {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

pub fn rev_of(content: &[u8]) -> Rev {
    Rev(format!("{}{}", Rev::PREFIX, blake3::hash(content).to_hex()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_and_parseable() {
        let r = rev_of(b"abc");
        assert_eq!(r, rev_of(b"abc"));
        assert_ne!(r, rev_of(b"abd"));
        assert_eq!(Rev::parse(r.as_str()), Some(r));
        assert_eq!(Rev::parse("b3:nothex"), None);
    }
}
